//! `workshop_invoke` — run one solution against one testcase; optionally
//! score with a checker.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tracing::{info, warn};

use crate::components::checker::{
    run_checker, run_cpp_interactor, run_python_checker, run_python_interactor_sandboxed,
    DEFAULT_CHECKER_TIMEOUT_SECS,
};
use crate::core::languages;
use crate::core::verdict::Verdict;
use crate::engine::compiler::{compile_trusted_cpp, compile_with_config};
use crate::engine::executer::{execute_sandboxed, ExecutionLimits, ExecutionSpec, ExecutionStatus};
use crate::engine::sandbox::get_config;
use crate::infra::storage::StorageClient;
use crate::jobs::judger::compare_output;

use super::{fetch_resources_into, WorkshopResource};

#[derive(Debug, Serialize, Deserialize)]
pub struct WorkshopInvokeJob {
    pub job_id: String,
    pub problem_id: i64,
    pub user_id: i64,
    pub invocation_id: i64,
    pub solution_id: i64,
    pub testcase_id: i64,
    pub language: String,
    pub solution_source_path: String,
    pub input_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub answer_path: Option<String>,
    #[serde(default)]
    pub resources: Vec<WorkshopResource>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checker: Option<WorkshopInvokeChecker>,
    pub base_time_limit_ms: u32,
    pub base_memory_limit_mb: u32,
    /// Top-level problem type (`"icpc" | "special_judge" | "interactive" |
    /// "two_step"`). New field — `#[serde(default)]` keeps pre-two_step
    /// payloads (no key at all) deserializing to `None`, which the dispatch
    /// in `process_workshop_invoke_job` treats as "not two_step" (byte-for-byte
    /// the old ICPC/special-judge/interactor behavior).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub problem_type: Option<String>,
    /// Present only when `problem_type == Some("two_step")` — the web never
    /// sends this key for any other problem type. `#[serde(default)]` for
    /// the same forward/backward-compat reason as `problem_type`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transformer: Option<WorkshopInvokeTransformer>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stdout_upload_path: Option<String>,
}

/// two_step 문제의 변환기 설정. `language`는 `"cpp"` 또는 `"python"`만
/// 온다 (웹이 그 외 값이면 invocation 생성 자체를 막는다).
#[derive(Debug, Serialize, Deserialize)]
pub struct WorkshopInvokeTransformer {
    pub language: String,
    pub source_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WorkshopInvokeChecker {
    pub language: String,
    pub source_path: String,
    /// `Some("interactor")` selects the C++ 2-box interactor path
    /// (`run_workshop_interactor_invocation` / `checker::run_cpp_interactor`).
    /// `#[serde(default)]` keeps existing payloads (no `mode` key at all,
    /// predating Task 1's interactive support) deserializing to `None` —
    /// the original output-checker path — unchanged.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WorkshopInvokeResult {
    pub job_id: String,
    pub problem_id: i64,
    pub invocation_id: i64,
    pub solution_id: i64,
    pub testcase_id: i64,
    pub verdict: String,
    pub time_ms: Option<u32>,
    pub memory_kb: Option<u32>,
    pub stdout_preview: Option<String>,
    pub stderr: Option<String>,
    pub checker_message: Option<String>,
    pub compile_message: Option<String>,
}

impl WorkshopInvokeResult {
    pub fn system_error(
        job_id: String,
        problem_id: i64,
        invocation_id: i64,
        solution_id: i64,
        testcase_id: i64,
        err: String,
    ) -> Self {
        Self {
            job_id,
            problem_id,
            invocation_id,
            solution_id,
            testcase_id,
            verdict: Verdict::SystemError.to_string(),
            time_ms: None,
            memory_kb: None,
            stdout_preview: None,
            stderr: Some(err),
            checker_message: None,
            compile_message: None,
        }
    }

    pub(super) fn with_verdict(
        job: &WorkshopInvokeJob,
        verdict: Verdict,
        time_ms: Option<u32>,
        memory_kb: Option<u32>,
        stdout_preview: Option<String>,
        stderr: Option<String>,
        checker_message: Option<String>,
        compile_message: Option<String>,
    ) -> Self {
        Self {
            job_id: job.job_id.clone(),
            problem_id: job.problem_id,
            invocation_id: job.invocation_id,
            solution_id: job.solution_id,
            testcase_id: job.testcase_id,
            verdict: verdict.to_string(),
            time_ms,
            memory_kb,
            stdout_preview,
            stderr,
            checker_message,
            compile_message,
        }
    }
}

const STDOUT_PREVIEW_BYTES: usize = 4096;

pub async fn process_workshop_invoke_job(
    job: &WorkshopInvokeJob,
    storage: &StorageClient,
) -> Result<WorkshopInvokeResult> {
    info!(
        "Processing workshop_invoke: job_id={}, problem={}, inv={}, sol={}, tc={}",
        job.job_id, job.problem_id, job.invocation_id, job.solution_id, job.testcase_id
    );

    let lang_config = match languages::get_language_config(&job.language) {
        Some(c) => c,
        None => {
            return Ok(WorkshopInvokeResult::system_error(
                job.job_id.clone(),
                job.problem_id,
                job.invocation_id,
                job.solution_id,
                job.testcase_id,
                format!("Unsupported language: {}", job.language),
            ));
        }
    };
    if let Err(e) = languages::require_toolchain_ready(&lang_config) {
        return Ok(WorkshopInvokeResult::system_error(
            job.job_id.clone(),
            job.problem_id,
            job.invocation_id,
            job.solution_id,
            job.testcase_id,
            e.to_string(),
        ));
    }

    // 1. Prepare work dir.
    let temp_dir = tempfile::tempdir().context("Failed to create temp dir")?;
    let work_dir = temp_dir.path();

    let src_bytes = storage
        .download(&job.solution_source_path)
        .await
        .with_context(|| {
            format!(
                "Failed to download solution source: {}",
                job.solution_source_path
            )
        })?;
    tokio::fs::write(work_dir.join(&lang_config.source_file), &src_bytes).await?;

    fetch_resources_into(
        storage,
        work_dir,
        &job.resources,
        &[lang_config.source_file.as_str()],
    )
    .await?;

    // 2. Compile.
    if let Some(compile_cmd) = &lang_config.compile_command {
        let cfg = get_config();
        let include_dirs = vec![std::path::PathBuf::from(".")];

        // Compile cache: same key scheme as the checker. The biggest win is
        // the N×M invocation matrix — without caching, every (solution,
        // testcase) pair recompiles the same solution from scratch.
        // Only a single `Main` artifact round-trips through the compile cache;
        // languages with multi-file outputs opt out via `produces_single_binary`.
        let cache_eligible = lang_config.produces_single_binary;
        let bin_path = work_dir.join("Main");
        let cache_hash = if cache_eligible {
            let mut resources = super::compile_cache::read_resource_files(work_dir).await?;
            // Filter out the source file itself — it's the primary input.
            resources.retain(|(name, _)| name != &lang_config.source_file);
            Some(super::compile_cache::compute_hash(
                &src_bytes,
                &resources,
                &job.language,
                compile_cmd,
                lang_config.install_hash.as_deref(),
                lang_config.compile_script.as_deref(),
                &lang_config.env,
            ))
        } else {
            None
        };

        let cache_hit = if let Some(h) = &cache_hash {
            super::compile_cache::try_restore("solution", h, &bin_path).await?
        } else {
            false
        };

        if !cache_hit {
            let compile_result = compile_with_config(
                work_dir,
                &lang_config,
                cfg.compile_time_limit_ms,
                cfg.compile_memory_limit_mb,
                &include_dirs,
            )
            .await?;
            if !compile_result.success {
                return Ok(WorkshopInvokeResult::with_verdict(
                    job,
                    Verdict::CompileError,
                    None,
                    None,
                    None,
                    None,
                    None,
                    compile_result.message,
                ));
            }
            if let Some(h) = &cache_hash {
                super::compile_cache::save("solution", h, &bin_path).await;
            }
        }
    }

    // Interactor mode diverges completely from the ICPC/output-checker flow
    // below (steps 3-8): it downloads its own input, skips the answer
    // entirely (interactive problems have no answer key — the interactor
    // itself is the judge), and runs the user program through
    // `checker::run_cpp_interactor`'s 2-box cross-piped execution instead of
    // the plain `execute_sandboxed` call in step 5. Branching here — before
    // step 3 touches anything — keeps the `mode == None` path below
    // (including the "answer_path must be set when checker is attached"
    // invariant) completely unreached, and therefore unchanged, for
    // interactor invocations.
    if let Some(checker) = &job.checker {
        if checker.mode.as_deref() == Some("interactor") {
            return run_workshop_interactor_invocation(
                job,
                storage,
                checker,
                work_dir,
                &lang_config,
            )
            .await;
        }
    }

    // two_step mode diverges completely from the ICPC/output-checker flow
    // below too, for the same reason the interactor branch above does: it
    // runs the solution TWICE (transformer(1) → stage1 → transformer(2) →
    // stage2) instead of the single plain `execute_sandboxed` call in step
    // 5, so it cannot reuse that call site. Branching here — before step 3
    // touches anything, same spot as the interactor check — keeps the
    // `mode == None` path below completely unreached, and therefore
    // unchanged, for two_step invocations. `checker` IS still read inside
    // `run_workshop_two_step_invocation` (two_step and special_judge are
    // orthogonal — a two_step problem may optionally attach a checker), just
    // not through this dispatch.
    if job.problem_type.as_deref() == Some("two_step") {
        return match &job.transformer {
            Some(transformer_cfg) => {
                super::invoke_two_step::run_workshop_two_step_invocation(
                    job,
                    storage,
                    transformer_cfg,
                    work_dir,
                    &lang_config,
                )
                .await
            }
            None => Ok(WorkshopInvokeResult::with_verdict(
                job,
                Verdict::SystemError,
                None,
                None,
                None,
                None,
                Some(
                    "invariant violated: transformer must be set for two_step problem_type"
                        .to_string(),
                ),
                None,
            )),
        };
    }

    // 3. Download testcase input + optional answer.
    let input_content = storage
        .download_string(&job.input_path)
        .await
        .with_context(|| format!("Failed to download input: {}", job.input_path))?;

    let answer_content = match &job.answer_path {
        Some(p) => Some(
            storage
                .download_string(p)
                .await
                .with_context(|| format!("Failed to download answer: {}", p))?,
        ),
        None => None,
    };

    // 4. Apply language time/memory multipliers.
    let adjusted_time = lang_config.calculate_time_limit(job.base_time_limit_ms);
    let adjusted_memory = lang_config.calculate_memory_limit(job.base_memory_limit_mb);

    let include_dirs = vec![std::path::PathBuf::from(".")];
    let runtime_flags = crate::engine::compiler::include_flags::format_include_flags(
        &lang_config.id,
        &include_dirs,
    );

    let spec = ExecutionSpec::new(work_dir)
        .with_command(&lang_config.run_command)
        .with_limits(ExecutionLimits {
            time_ms: adjusted_time,
            memory_mb: adjusted_memory,
        })
        .with_stdin(&input_content)
        .with_env_vars([runtime_flags.env_vars, lang_config.env.clone()].concat());

    let outcome = execute_sandboxed(&spec)
        .await
        .context("Failed to run solution in sandbox")?;

    let stdout_preview = if outcome.stdout.is_empty() {
        None
    } else {
        Some(
            outcome
                .stdout
                .chars()
                .take(STDOUT_PREVIEW_BYTES)
                .collect::<String>(),
        )
    };

    // Upload full stdout if requested.
    if let Some(upload_path) = &job.stdout_upload_path {
        if !outcome.stdout_bytes.is_empty() {
            if let Err(e) = storage
                .upload(upload_path, outcome.stdout_bytes.clone())
                .await
            {
                warn!(
                    "Failed to upload solution stdout to {}: {:#}",
                    upload_path, e
                );
            }
        }
    }

    // 5. Verdict by run outcome.
    let runtime_verdict = match outcome.status {
        ExecutionStatus::Exited(0) => None, // success — proceed to checker
        ExecutionStatus::Exited(_) => Some(Verdict::RuntimeError),
        ExecutionStatus::Signaled(_) => Some(Verdict::RuntimeError),
        ExecutionStatus::TimeLimitExceeded => Some(Verdict::TimeLimitExceeded),
        ExecutionStatus::MemoryLimitExceeded => Some(Verdict::MemoryLimitExceeded),
        ExecutionStatus::SystemError => Some(Verdict::SystemError),
    };

    if let Some(v) = runtime_verdict {
        return Ok(WorkshopInvokeResult::with_verdict(
            job,
            v,
            Some(outcome.time_ms),
            Some(outcome.memory_kb),
            stdout_preview,
            if outcome.stderr.is_empty() {
                None
            } else {
                Some(outcome.stderr)
            },
            None,
            None,
        ));
    }

    // 6. Solution ran successfully (exit 0). Decide what to do with output:
    //
    //    (a) Generate-answers mode: caller passed `stdout_upload_path` with
    //        `answer_path=None` and `checker=None`. Stdout was uploaded above;
    //        return AC directly (no comparison to perform).
    //    (b) Normal invocation: `answer_path` MUST be set. The web layer
    //        (Phase 6) disables the "Run Invocation" button unless the main
    //        solution has produced answers for every selected testcase.
    //        A missing answer here when a checker IS attached is a real
    //        programming error.
    let answer = match answer_content {
        Some(a) => a,
        None => {
            if job.checker.is_none() {
                // Generate-answers / no-comparison mode → success.
                return Ok(WorkshopInvokeResult::with_verdict(
                    job,
                    Verdict::Accepted,
                    Some(outcome.time_ms),
                    Some(outcome.memory_kb),
                    stdout_preview,
                    if outcome.stderr.is_empty() {
                        None
                    } else {
                        Some(outcome.stderr)
                    },
                    None,
                    None,
                ));
            }
            return Ok(WorkshopInvokeResult::with_verdict(
                job,
                Verdict::SystemError,
                None,
                None,
                stdout_preview,
                None,
                Some(
                    "invariant violated: answer_path must be set when checker is attached"
                        .to_string(),
                ),
                None,
            ));
        }
    };

    // 7. If a checker is attached, run it; otherwise ICPC compare.
    let (verdict, checker_message) = if let Some(checker) = &job.checker {
        let checker_result = match classify_checker_language(&checker.language) {
            CheckerLanguage::Cpp => {
                run_workshop_cpp_checker(
                    storage,
                    checker,
                    &input_content,
                    &outcome.stdout,
                    &answer,
                    work_dir,
                )
                .await
            }
            CheckerLanguage::Python => {
                run_workshop_python_checker(
                    storage,
                    checker,
                    &input_content,
                    &outcome.stdout,
                    &answer,
                )
                .await
            }
            CheckerLanguage::Unsupported => {
                return Ok(WorkshopInvokeResult::with_verdict(
                    job,
                    Verdict::SystemError,
                    None,
                    None,
                    stdout_preview,
                    None,
                    Some(format!(
                        "unsupported checker language: {}",
                        checker.language
                    )),
                    None,
                ));
            }
        };

        match checker_result {
            Ok(cr) => cr,
            Err(e) => {
                warn!("workshop checker error: {:#}", e);
                return Ok(WorkshopInvokeResult::with_verdict(
                    job,
                    Verdict::SystemError,
                    None,
                    None,
                    stdout_preview,
                    None,
                    Some(format!("Checker error: {:#}", e)),
                    None,
                ));
            }
        }
    } else if compare_output(&outcome.stdout, &answer) {
        (Verdict::Accepted, None)
    } else {
        (Verdict::WrongAnswer, None)
    };

    let (time, mem) = (Some(outcome.time_ms), Some(outcome.memory_kb));

    Ok(WorkshopInvokeResult::with_verdict(
        job,
        verdict,
        time,
        mem,
        stdout_preview,
        if outcome.stderr.is_empty() {
            None
        } else {
            Some(outcome.stderr)
        },
        checker_message,
        None,
    ))
}

/// Which per-language checker/interactor path a `WorkshopInvokeChecker`
/// selects, decided purely from `checker.language` (case-insensitive) — a
/// pure function shared by both dispatch points in this module (the
/// output-checker `mode == None` branch in `process_workshop_invoke_job`
/// and the interactor branch in `run_workshop_interactor_invocation`) so
/// their "unsupported language" `SystemError` messages stay identical.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum CheckerLanguage {
    Cpp,
    Python,
    Unsupported,
}

pub(super) fn classify_checker_language(language: &str) -> CheckerLanguage {
    match language.to_lowercase().as_str() {
        "cpp" | "c++" => CheckerLanguage::Cpp,
        "python" => CheckerLanguage::Python,
        _ => CheckerLanguage::Unsupported,
    }
}

/// Compile + run a workshop C++ checker against (input, user_output, answer).
/// Returns `(verdict, checker_stderr)`.
pub(super) async fn run_workshop_cpp_checker(
    storage: &StorageClient,
    checker: &WorkshopInvokeChecker,
    input: &str,
    user_output: &str,
    answer: &str,
    parent_work_dir: &Path,
) -> Result<(Verdict, Option<String>)> {
    let checker_dir = parent_work_dir.join("checker_build");
    tokio::fs::create_dir_all(&checker_dir).await?;

    let src_bytes = storage
        .download(&checker.source_path)
        .await
        .with_context(|| format!("Failed to download checker: {}", checker.source_path))?;
    let src_path = checker_dir.join("checker.cpp");
    tokio::fs::write(&src_path, &src_bytes).await?;

    let bin_path = checker_dir.join("checker");

    // Copy draft resources (testlib.h, custom headers) into the checker
    // sandbox box. Sandbox only mounts `checker_dir`, so resources at
    // `parent_work_dir` root are inaccessible without this copy.
    let mut resource_files: Vec<(String, Vec<u8>)> = Vec::new();
    let mut entries = tokio::fs::read_dir(parent_work_dir).await?;
    while let Some(entry) = entries.next_entry().await? {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        let metadata = entry.metadata().await?;
        if !metadata.is_file() {
            continue;
        }
        let dest = checker_dir.join(name);
        if dest.exists() {
            continue; // don't clobber checker.cpp itself
        }
        let bytes = tokio::fs::read(&path).await?;
        tokio::fs::write(&dest, &bytes).await?;
        resource_files.push((name.to_string(), bytes));
    }

    // Compile cache: keyed by sha256(checker_source + sorted resources).
    // Avoids recompiling the (slow) testlib.h-based checker for every cell
    // in an N×M invocation matrix. Cache lives in /tmp; cleared on container
    // restart, which is fine — first invocation re-warms it.
    // Checker is always cpp via compile_trusted_cpp (hardcoded g++ command).
    // Salt the hash with these constants so a future compile-flag change
    // invalidates stale entries automatically.
    let hash = super::compile_cache::compute_hash(
        &src_bytes,
        &resource_files,
        "cpp",
        &[
            "g++".to_string(),
            "-O2".to_string(),
            "-std=c++17".to_string(),
        ],
        None,
        None,
        &[],
    );
    let hit = super::compile_cache::try_restore("checker", &hash, &bin_path).await?;
    if !hit {
        // Resources were just copied flat into checker_dir (the sandbox box
        // work_dir), so `-I.` is what the contract wants — see
        // compile_trusted_cpp's docstring.
        let tc = compile_trusted_cpp(&src_path, &bin_path, &[Path::new(".")]).await?;
        if !tc.success {
            anyhow::bail!("Checker compile failed: {}", tc.stderr);
        }
        super::compile_cache::save("checker", &hash, &bin_path).await;
    }

    // Build input/output/answer files for the checker.
    let io_dir = parent_work_dir.join("checker_io");
    tokio::fs::create_dir_all(&io_dir).await?;
    let inp = io_dir.join("input.txt");
    let outp = io_dir.join("output.txt");
    let ansp = io_dir.join("answer.txt");
    tokio::fs::write(&inp, input).await?;
    tokio::fs::write(&outp, user_output).await?;
    tokio::fs::write(&ansp, answer).await?;

    let r = run_checker(&bin_path, &inp, &outp, &ansp, DEFAULT_CHECKER_TIMEOUT_SECS).await?;

    // Workshop invocations are single-testcase, single-result probes (no
    // subtask groups to run GroupMin aggregation across), so checker
    // partial credit (testlib POINTS_EXIT_CODE, Verdict::Partial) is not
    // AC — downgrade to WrongAnswer, same all-or-nothing rule as the
    // judger's legacy/interactive paths, keeping the points info visible.
    if r.verdict == Verdict::Partial {
        let points = r.partial_ratio.unwrap_or(0.0) * 100.0;
        let note = format!(
            "partial: {} points (workshop — scored as WA)",
            crate::components::checker::format_points(points)
        );
        let combined = match r.checker_message {
            Some(m) => format!("{} | {}", note, m),
            None => note,
        };
        return Ok((Verdict::WrongAnswer, Some(combined)));
    }

    Ok((r.verdict, r.checker_message))
}

/// Run a workshop Python checker against (input, user_output, answer).
/// Returns `(verdict, checker_stderr)`.
///
/// No compile step: `checker::run_python_checker` stages the aoj_checker.py
/// SDK + checker source directly into its own sandbox box per call — unlike
/// `run_workshop_cpp_checker`, there is no cached binary to reuse across an
/// N×M invocation matrix, so every cell re-downloads and re-stages the
/// checker source. `env_vars` is `&[]`: the workshop path has no storage
/// proxy wiring (unlike the main judger's special_judge path — see
/// judger.rs's `storage_proxy` setup), so aoj_checker's `state.py`-backed
/// helpers are inert here.
///
/// Mirrors `run_workshop_cpp_checker`'s exit-7 (testlib `POINTS_EXIT_CODE`)
/// partial-score downgrade rule — same all-or-nothing MVP semantics for
/// workshop invocation cells (no subtask groups to aggregate across) — kept
/// as a separate copy rather than factored into a shared helper, consistent
/// with this file's existing choice to keep per-language checker/interactor
/// paths self-contained (see `run_workshop_interactor_invocation`'s doc
/// comment for the same rationale on the interactor side).
pub(super) async fn run_workshop_python_checker(
    storage: &StorageClient,
    checker: &WorkshopInvokeChecker,
    input: &str,
    user_output: &str,
    answer: &str,
) -> Result<(Verdict, Option<String>)> {
    let source = storage
        .download_string(&checker.source_path)
        .await
        .with_context(|| format!("Failed to download checker: {}", checker.source_path))?;

    let io_dir = tempfile::tempdir()?;
    let inp = io_dir.path().join("input.txt");
    let outp = io_dir.path().join("output.txt");
    let ansp = io_dir.path().join("answer.txt");
    tokio::fs::write(&inp, input).await?;
    tokio::fs::write(&outp, user_output).await?;
    tokio::fs::write(&ansp, answer).await?;

    let r = run_python_checker(
        &source,
        &inp,
        &outp,
        &ansp,
        DEFAULT_CHECKER_TIMEOUT_SECS,
        &[],
    )
    .await?;

    // Workshop invocations are single-testcase, single-result probes (no
    // subtask groups to run GroupMin aggregation across), so checker
    // partial credit (testlib POINTS_EXIT_CODE, Verdict::Partial) is not
    // AC — downgrade to WrongAnswer, same all-or-nothing rule
    // `run_workshop_cpp_checker` applies to the cpp path.
    if r.verdict == Verdict::Partial {
        let points = r.partial_ratio.unwrap_or(0.0) * 100.0;
        let note = format!(
            "partial: {} points (workshop — scored as WA)",
            crate::components::checker::format_points(points)
        );
        let combined = match r.checker_message {
            Some(m) => format!("{} | {}", note, m),
            None => note,
        };
        return Ok((Verdict::WrongAnswer, Some(combined)));
    }

    Ok((r.verdict, r.checker_message))
}

/// Run a workshop invocation cell in C++ interactor mode.
///
/// Compiles the interactor source via `compile_workshop_cpp_interactor`
/// (same workshop compile cache + `compile_trusted_cpp` path as
/// `run_workshop_cpp_checker`, kept as a separate function rather than
/// refactored to share code with it so the `mode == None` output-checker
/// path in `process_workshop_invoke_job` stays byte-for-byte unchanged),
/// then hands off to `checker::run_cpp_interactor` for the 2-box
/// cross-piped execution P3-11 built for the main judger's
/// `ProblemType::Interactive` path.
///
/// `job.answer_path` is never read here — interactive problems have no
/// answer key (the interactor itself is the judge), so the "answer_path
/// must be set when checker is attached" invariant enforced on the
/// `mode == None` path does not apply and is simply not checked.
/// `job.stdout_upload_path` is likewise meaningless (there is no single
/// captured "the" stdout to upload — it's a live conversation across many
/// small reads/writes) and is ignored. Both are defended against with a
/// single warn log, even though the web layer (Task 1) never sends them
/// for interactive problems.
async fn run_workshop_interactor_invocation(
    job: &WorkshopInvokeJob,
    storage: &StorageClient,
    checker: &WorkshopInvokeChecker,
    work_dir: &Path,
    lang_config: &languages::LanguageConfig,
) -> Result<WorkshopInvokeResult> {
    if job.answer_path.is_some() || job.stdout_upload_path.is_some() {
        warn!(
            "workshop_invoke: interactor mode ignores answer_path/stdout_upload_path (job_id={})",
            job.job_id
        );
    }

    let checker_lang = classify_checker_language(&checker.language);
    if checker_lang == CheckerLanguage::Unsupported {
        return Ok(WorkshopInvokeResult::with_verdict(
            job,
            Verdict::SystemError,
            None,
            None,
            None,
            None,
            Some(format!(
                "unsupported checker language: {}",
                checker.language
            )),
            None,
        ));
    }

    let input_content = storage
        .download_string(&job.input_path)
        .await
        .with_context(|| format!("Failed to download input: {}", job.input_path))?;

    let adjusted_time = lang_config.calculate_time_limit(job.base_time_limit_ms);
    let adjusted_memory = lang_config.calculate_memory_limit(job.base_memory_limit_mb);
    let user_limits = ExecutionLimits {
        time_ms: adjusted_time,
        memory_mb: adjusted_memory,
    };

    let include_dirs = vec![std::path::PathBuf::from(".")];
    let runtime_flags = crate::engine::compiler::include_flags::format_include_flags(
        &lang_config.id,
        &include_dirs,
    );
    let user_env = [runtime_flags.env_vars, lang_config.env.clone()].concat();

    let result = match checker_lang {
        CheckerLanguage::Cpp => {
            let interactor_binary =
                match compile_workshop_cpp_interactor(storage, checker, work_dir).await {
                    Ok(p) => p,
                    Err(e) => {
                        warn!("workshop interactor compile error: {:#}", e);
                        return Ok(WorkshopInvokeResult::with_verdict(
                            job,
                            Verdict::SystemError,
                            None,
                            None,
                            None,
                            None,
                            Some(format!("Interactor error: {:#}", e)),
                            None,
                        ));
                    }
                };

            match run_cpp_interactor(
                &interactor_binary,
                &input_content,
                work_dir,
                &lang_config.run_command,
                &user_limits,
                &user_env,
            )
            .await
            {
                Ok(r) => r,
                Err(e) => {
                    warn!("workshop interactor run error: {:#}", e);
                    return Ok(WorkshopInvokeResult::with_verdict(
                        job,
                        Verdict::SystemError,
                        None,
                        None,
                        None,
                        None,
                        Some(format!("Interactor error: {:#}", e)),
                        None,
                    ));
                }
            }
        }
        CheckerLanguage::Python => {
            // No compile step: `run_python_interactor_sandboxed` stages the
            // aoj_checker.py SDK + checker source directly into its own
            // **second isolate box** (mirroring `run_cpp_interactor`'s
            // 2-box path above), NOT a trusted host subprocess. Workshop
            // interactors are authored by ordinary logged-in users (bounded
            // only by `workshopQuota`), unlike the main judger's
            // `CheckerInfo::Interactive` path where only admins author
            // problems — so the judger's `run_interactive_checker` (which
            // runs the interactor unsandboxed on the privileged judge host)
            // must never be used here; see that function's doc comment.
            // Unlike `run_python_checker`'s `env_vars` (applied to the
            // *checker's* own sandbox spec — storage-proxy wiring the
            // workshop path doesn't have),
            // `run_python_interactor_sandboxed`'s `env_vars` is applied to
            // the *user program's* `ExecutionSpec` — so this must carry the
            // same `user_env` (PYTHONPATH / NODE_PATH / etc.
            // for the user's own solution language) that the cpp interactor
            // arm above passes to `run_cpp_interactor`, not an empty slice.
            let source = match storage.download_string(&checker.source_path).await {
                Ok(s) => s,
                Err(e) => {
                    warn!("workshop interactor source download error: {:#}", e);
                    return Ok(WorkshopInvokeResult::with_verdict(
                        job,
                        Verdict::SystemError,
                        None,
                        None,
                        None,
                        None,
                        Some(format!(
                            "Failed to download interactor {}: {:#}",
                            checker.source_path, e
                        )),
                        None,
                    ));
                }
            };

            match run_python_interactor_sandboxed(
                &source,
                &input_content,
                work_dir,
                &lang_config.run_command,
                &user_limits,
                &user_env,
            )
            .await
            {
                Ok(r) => r,
                Err(e) => {
                    warn!("workshop interactor run error: {:#}", e);
                    return Ok(WorkshopInvokeResult::with_verdict(
                        job,
                        Verdict::SystemError,
                        None,
                        None,
                        None,
                        None,
                        Some(format!("Interactor error: {:#}", e)),
                        None,
                    ));
                }
            }
        }
        CheckerLanguage::Unsupported => unreachable!("handled above"),
    };

    Ok(WorkshopInvokeResult::with_verdict(
        job,
        result.verdict,
        Some(result.user_time_ms),
        Some(result.user_memory_kb),
        None,
        None,
        result.checker_message,
        None,
    ))
}

/// Compile a workshop C++ interactor source into a binary, via the same
/// workshop compile cache + `compile_trusted_cpp` path as
/// `run_workshop_cpp_checker`'s compile step (testlib.h/custom-header
/// resources copied in flat from `parent_work_dir`, same as there).
///
/// Deliberately duplicated rather than sharing a helper with
/// `run_workshop_cpp_checker` — see `run_workshop_interactor_invocation`'s
/// doc comment for why. Cache namespace is `"interactor"`, distinct from
/// `"checker"`, so the two roles never alias to the same cached binary.
async fn compile_workshop_cpp_interactor(
    storage: &StorageClient,
    checker: &WorkshopInvokeChecker,
    parent_work_dir: &Path,
) -> Result<std::path::PathBuf> {
    let interactor_dir = parent_work_dir.join("interactor_build");
    tokio::fs::create_dir_all(&interactor_dir).await?;

    let src_bytes = storage
        .download(&checker.source_path)
        .await
        .with_context(|| format!("Failed to download interactor: {}", checker.source_path))?;
    let src_path = interactor_dir.join("interactor.cpp");
    tokio::fs::write(&src_path, &src_bytes).await?;

    let bin_path = interactor_dir.join("interactor");

    // Copy draft resources (testlib.h, custom headers) into the interactor
    // sandbox box. Sandbox only mounts `interactor_dir`, so resources at
    // `parent_work_dir` root are inaccessible without this copy — same
    // rationale as run_workshop_cpp_checker's identical block.
    let mut resource_files: Vec<(String, Vec<u8>)> = Vec::new();
    let mut entries = tokio::fs::read_dir(parent_work_dir).await?;
    while let Some(entry) = entries.next_entry().await? {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        let metadata = entry.metadata().await?;
        if !metadata.is_file() {
            continue;
        }
        let dest = interactor_dir.join(name);
        if dest.exists() {
            continue; // don't clobber interactor.cpp itself
        }
        let bytes = tokio::fs::read(&path).await?;
        tokio::fs::write(&dest, &bytes).await?;
        resource_files.push((name.to_string(), bytes));
    }

    // Compile cache: keyed by sha256(interactor_source + sorted resources).
    // Same rationale as run_workshop_cpp_checker's cache — avoids
    // recompiling the (slow) testlib.h-based interactor for every cell in
    // an N×M invocation matrix.
    let hash = super::compile_cache::compute_hash(
        &src_bytes,
        &resource_files,
        "cpp",
        &[
            "g++".to_string(),
            "-O2".to_string(),
            "-std=c++17".to_string(),
        ],
        None,
        None,
        &[],
    );
    let hit = super::compile_cache::try_restore("interactor", &hash, &bin_path).await?;
    if !hit {
        let tc = compile_trusted_cpp(&src_path, &bin_path, &[Path::new(".")]).await?;
        if !tc.success {
            anyhow::bail!("Interactor compile failed: {}", tc.stderr);
        }
        super::compile_cache::save("interactor", &hash, &bin_path).await;
    }

    Ok(bin_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serde_roundtrip_job() {
        let job = WorkshopInvokeJob {
            job_id: "i1".into(),
            problem_id: 42,
            user_id: 7,
            invocation_id: 100,
            solution_id: 5,
            testcase_id: 9,
            language: "cpp".into(),
            solution_source_path: "workshop/42/drafts/7/solutions/main.cpp".into(),
            input_path: "workshop/42/drafts/7/testcases/testcase_1.input.txt".into(),
            answer_path: Some("workshop/42/drafts/7/testcases/testcase_1.output.txt".into()),
            resources: vec![],
            checker: Some(WorkshopInvokeChecker {
                language: "cpp".into(),
                source_path: "workshop/42/drafts/7/checker.cpp".into(),
                mode: None,
            }),
            base_time_limit_ms: 1000,
            base_memory_limit_mb: 256,
            problem_type: Some("special_judge".into()),
            transformer: None,
            stdout_upload_path: None,
        };
        let json = serde_json::to_string(&job).unwrap();
        let back: WorkshopInvokeJob = serde_json::from_str(&json).unwrap();
        assert_eq!(back.invocation_id, 100);
        assert!(back.checker.is_some());
    }

    #[test]
    fn legacy_payload_without_problem_type_or_transformer_deserializes() {
        // 구버전 페이로드 호환: problem_type/transformer 키 자체가 없어도
        // 역직렬화되어야 하고, 둘 다 None으로 떨어져야 한다 (two_step이
        // 생기기 전 기존 ICPC/special_judge/interactor 페이로드).
        let json = r#"{
            "job_id": "i2",
            "problem_id": 1,
            "user_id": 1,
            "invocation_id": 1,
            "solution_id": 1,
            "testcase_id": 1,
            "language": "cpp",
            "solution_source_path": "workshop/1/drafts/1/solutions/main.cpp",
            "input_path": "workshop/1/drafts/1/testcases/testcase_1.input.txt",
            "answer_path": "workshop/1/drafts/1/testcases/testcase_1.output.txt",
            "base_time_limit_ms": 1000,
            "base_memory_limit_mb": 256
        }"#;
        let job: WorkshopInvokeJob = serde_json::from_str(json).unwrap();
        assert!(job.problem_type.is_none());
        assert!(job.transformer.is_none());
        assert!(job.checker.is_none());
        assert_eq!(job.resources.len(), 0);
    }

    #[test]
    fn two_step_payload_with_transformer_and_checker_deserializes() {
        // problem_type: "two_step" + transformer + checker가 동시에 있는
        // 페이로드 — 투 스텝은 스페셜저지와 직교하므로 둘 다 존재할 수 있다.
        let json = r#"{
            "job_id": "i3",
            "problem_id": 2,
            "user_id": 7,
            "invocation_id": 200,
            "solution_id": 9,
            "testcase_id": 15,
            "language": "cpp",
            "solution_source_path": "workshop/2/drafts/7/solutions/main.cpp",
            "input_path": "workshop/2/drafts/7/testcases/testcase_1.input.txt",
            "answer_path": "workshop/2/drafts/7/testcases/testcase_1.output.txt",
            "checker": {"language": "cpp", "source_path": "workshop/2/drafts/7/checker.cpp"},
            "base_time_limit_ms": 1000,
            "base_memory_limit_mb": 256,
            "problem_type": "two_step",
            "transformer": {"language": "cpp", "source_path": "workshop/2/drafts/7/transformer.cpp"}
        }"#;
        let job: WorkshopInvokeJob = serde_json::from_str(json).unwrap();
        assert_eq!(job.problem_type.as_deref(), Some("two_step"));
        let transformer = job.transformer.as_ref().unwrap();
        assert_eq!(transformer.language, "cpp");
        assert_eq!(
            transformer.source_path,
            "workshop/2/drafts/7/transformer.cpp"
        );
        let checker = job.checker.as_ref().unwrap();
        assert_eq!(checker.language, "cpp");
        assert!(checker.mode.is_none());
    }

    #[test]
    fn system_error_sets_verdict() {
        let r = WorkshopInvokeResult::system_error("j".into(), 1, 2, 3, 4, "x".into());
        assert_eq!(r.verdict, "system_error");
        assert!(r.time_ms.is_none());
    }

    #[test]
    fn checker_mode_missing_defaults_to_none() {
        let json = r#"{"language":"cpp","source_path":"workshop/1/checker.cpp"}"#;
        let c: WorkshopInvokeChecker = serde_json::from_str(json).unwrap();
        assert!(c.mode.is_none());
    }

    #[test]
    fn checker_mode_interactor_parses() {
        let json =
            r#"{"language":"cpp","source_path":"workshop/1/interactor.cpp","mode":"interactor"}"#;
        let c: WorkshopInvokeChecker = serde_json::from_str(json).unwrap();
        assert_eq!(c.mode.as_deref(), Some("interactor"));
    }

    #[test]
    fn checker_python_mode_none_parses() {
        let json = r#"{"language":"python","source_path":"workshop/1/checker.py"}"#;
        let c: WorkshopInvokeChecker = serde_json::from_str(json).unwrap();
        assert_eq!(c.language, "python");
        assert!(c.mode.is_none());
    }

    #[test]
    fn checker_python_interactor_mode_parses() {
        let json =
            r#"{"language":"python","source_path":"workshop/1/interactor.py","mode":"interactor"}"#;
        let c: WorkshopInvokeChecker = serde_json::from_str(json).unwrap();
        assert_eq!(c.language, "python");
        assert_eq!(c.mode.as_deref(), Some("interactor"));
    }

    #[test]
    fn classify_checker_language_cpp_variants() {
        assert_eq!(classify_checker_language("cpp"), CheckerLanguage::Cpp);
        assert_eq!(classify_checker_language("C++"), CheckerLanguage::Cpp);
        assert_eq!(classify_checker_language("CPP"), CheckerLanguage::Cpp);
    }

    #[test]
    fn classify_checker_language_python_variants() {
        assert_eq!(classify_checker_language("python"), CheckerLanguage::Python);
        assert_eq!(classify_checker_language("Python"), CheckerLanguage::Python);
        assert_eq!(classify_checker_language("PYTHON"), CheckerLanguage::Python);
    }

    #[test]
    fn classify_checker_language_unsupported() {
        assert_eq!(
            classify_checker_language("java"),
            CheckerLanguage::Unsupported
        );
        assert_eq!(classify_checker_language(""), CheckerLanguage::Unsupported);
    }

    #[test]
    fn serde_roundtrip_result_with_checker_message() {
        let r = WorkshopInvokeResult {
            job_id: "j".into(),
            problem_id: 1,
            invocation_id: 2,
            solution_id: 3,
            testcase_id: 4,
            verdict: "wrong_answer".into(),
            time_ms: None,
            memory_kb: None,
            stdout_preview: Some("5".into()),
            stderr: None,
            checker_message: Some("expected 4, got 5".into()),
            compile_message: None,
        };
        let json = serde_json::to_string(&r).unwrap();
        let back: WorkshopInvokeResult = serde_json::from_str(&json).unwrap();
        assert_eq!(back.verdict, "wrong_answer");
        assert_eq!(back.checker_message.unwrap(), "expected 4, got 5");
    }
}
