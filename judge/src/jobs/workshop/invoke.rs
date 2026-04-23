//! `workshop_invoke` — run one solution against one testcase; optionally
//! score with a checker.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tracing::{info, warn};

use crate::components::checker::{run_checker, DEFAULT_CHECKER_TIMEOUT_SECS};
use crate::core::languages;
use crate::core::verdict::Verdict;
use crate::engine::compiler::{compile_in_sandbox, compile_on_host, compile_trusted_cpp};
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stdout_upload_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WorkshopInvokeChecker {
    pub language: String,
    pub source_path: String,
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

    fn with_verdict(
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
        // Java is skipped (multiple .class files; not worth the MVP
        // complexity). C# is skipped (multi-file .NET artifact set that the
        // single-binary cache can't round-trip). Python/JS never enter this
        // branch (no compile_command).
        let lang_lc = job.language.to_lowercase();
        let cache_eligible =
            lang_lc != "java" && !matches!(lang_lc.as_str(), "csharp" | "cs" | "c#");
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
            let compile_result = if matches!(lang_lc.as_str(), "csharp" | "cs" | "c#") {
                compile_on_host(work_dir, compile_cmd, cfg.compile_time_limit_ms).await?
            } else {
                compile_in_sandbox(
                    work_dir,
                    compile_cmd,
                    cfg.compile_time_limit_ms,
                    cfg.compile_memory_limit_mb,
                    &job.language,
                    &include_dirs,
                )
                .await?
            };
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
    let runtime_flags =
        crate::engine::compiler::include_flags::format_include_flags(&job.language, &include_dirs);

    let spec = ExecutionSpec::new(work_dir)
        .with_command(&lang_config.run_command)
        .with_limits(ExecutionLimits {
            time_ms: adjusted_time,
            memory_mb: adjusted_memory,
        })
        .with_stdin(&input_content)
        .with_env_vars(runtime_flags.env_vars);

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
        if checker.language.to_lowercase() != "cpp" && checker.language.to_lowercase() != "c++" {
            return Ok(WorkshopInvokeResult::with_verdict(
                job,
                Verdict::SystemError,
                None,
                None,
                stdout_preview,
                None,
                Some(format!(
                    "Only cpp checkers are supported in MVP (got {})",
                    checker.language
                )),
                None,
            ));
        }

        match run_workshop_cpp_checker(
            storage,
            checker,
            &input_content,
            &outcome.stdout,
            &answer,
            work_dir,
        )
        .await
        {
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

/// Compile + run a workshop C++ checker against (input, user_output, answer).
/// Returns `(verdict, checker_stderr)`.
async fn run_workshop_cpp_checker(
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
    Ok((r.verdict, r.checker_message))
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
            }),
            base_time_limit_ms: 1000,
            base_memory_limit_mb: 256,
            stdout_upload_path: None,
        };
        let json = serde_json::to_string(&job).unwrap();
        let back: WorkshopInvokeJob = serde_json::from_str(&json).unwrap();
        assert_eq!(back.invocation_id, 100);
        assert!(back.checker.is_some());
    }

    #[test]
    fn system_error_sets_verdict() {
        let r = WorkshopInvokeResult::system_error("j".into(), 1, 2, 3, 4, "x".into());
        assert_eq!(r.verdict, "system_error");
        assert!(r.time_ms.is_none());
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
