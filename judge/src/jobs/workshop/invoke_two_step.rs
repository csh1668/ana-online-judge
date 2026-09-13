//! Workshop (창작마당) `two_step` invocation — the workshop counterpart to
//! `jobs::two_step::run_two_step_testcase`.
//!
//! Deliberately duplicated rather than sharing code with the production
//! `two_step` job path: `run_two_step_testcase` is keyed off `JudgeJob` /
//! `TestcaseInfo` (subtask groups, `has_subtasks`, `ignore_*_limit_bonus`),
//! none of which exist on a single-cell `WorkshopInvokeJob` probe. Stage
//! labels, failure-verdict mapping, and message-prefixing ARE shared (via
//! `crate::jobs::two_step`'s `pub(crate)` helpers) so the two paths report
//! failures identically; only the per-job plumbing and the final
//! checker/compare step (workshop's own all-or-nothing partial-score
//! downgrade — no subtask aggregation exists for a single invocation cell)
//! are copied and adapted. Same rationale as `invoke.rs`'s existing
//! interactor/checker duplication — see
//! `invoke::run_workshop_interactor_invocation`'s doc comment.
//!
//! Security note: both transformer arms (C++ and Python) run entirely
//! through `components::transformer::run_transformer`, which is a single
//! one-shot batch process funneled through `engine::executer::execute_sandboxed`
//! (isolate box) for *both* languages — unlike
//! `components::checker::run_interactive_checker` (judger-only, trusted host
//! subprocess for its Python interactor arm), the transformer has no trusted
//! host-execution arm to accidentally reuse here. So `run_transformer` is
//! safe to call directly for workshop's user-authored transformers, with no
//! `*_sandboxed` variant needed (see task report for the full read-through).

use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use tracing::{debug, warn};

use crate::components::transformer::{run_transformer, TransformerInfo, TransformerOutcome};
use crate::core::languages::LanguageConfig;
use crate::core::verdict::Verdict;
use crate::engine::compiler::{compile_trusted_cpp, get_aoj_transformer_header_path};
use crate::engine::executer::{execute_sandboxed, ExecutionLimits, ExecutionSpec, RUN_FSIZE_KB};
use crate::infra::storage::StorageClient;
use crate::jobs::judger::compare_output;
use crate::jobs::two_step::{
    prefix_message, run_status_to_verdict, stage_label, transformer_label,
};

use super::compile_cache;
use super::invoke::{
    classify_checker_language, run_workshop_cpp_checker, run_workshop_python_checker,
    CheckerLanguage, WorkshopInvokeJob, WorkshopInvokeResult, WorkshopInvokeTransformer,
};

/// stdout preview cap, in chars — same value as `invoke.rs`'s
/// `STDOUT_PREVIEW_BYTES` (kept as a separate constant per this module's
/// duplicate-rather-than-share convention; see module doc comment).
const STDOUT_PREVIEW_CHARS: usize = 4096;

/// Build a failure result carrying only a verdict + message. Time/memory/
/// stdout stay `None`, matching `two_step::run_two_step_testcase`'s
/// `failed()` helper: once either stage has failed, there is no single "the"
/// execution time/memory/stdout that unambiguously represents the cell.
fn failed(
    job: &WorkshopInvokeJob,
    verdict: Verdict,
    message: Option<String>,
) -> WorkshopInvokeResult {
    WorkshopInvokeResult::with_verdict(job, verdict, None, None, None, None, message, None)
}

/// What to do once stage2 has produced output, given whether an answer and a
/// checker are attached. Pure mirror of `process_workshop_invoke_job`'s step
/// 6 branch (`invoke.rs`'s `answer_content` match) for the two_step path —
/// pulled out standalone so the decision is unit-testable without storage or
/// sandbox execution.
///
/// - `answer = None, checker = None`: **generate-answers mode**
///   (`workshop-invocations.ts`'s `generateAnswers` sends exactly this
///   shape: no answer to compare against because stage2's output IS the
///   answer being produced, `stdout_upload_path` set instead). Nothing to
///   compare — the caller returns AC once stage2's stdout has been uploaded.
/// - `answer = None, checker = Some(_)`: a checker with nothing to check
///   against is a real programming error — the web layer never sends this
///   shape (mirrors `invoke.rs`'s identical "invariant violated: answer_path
///   must be set when checker is attached" case).
/// - `answer = Some(a)`: normal invocation — compare stage2's output to `a`
///   (checker or string compare, decided by the caller).
#[derive(Debug, PartialEq, Eq)]
enum AnswerDecision<'a> {
    NoComparisonNeeded,
    InvariantViolation,
    Compare(&'a str),
}

fn decide_answer_handling<'a>(
    answer: Option<&'a str>,
    checker_present: bool,
) -> AnswerDecision<'a> {
    match answer {
        Some(a) => AnswerDecision::Compare(a),
        None if !checker_present => AnswerDecision::NoComparisonNeeded,
        None => AnswerDecision::InvariantViolation,
    }
}

/// Run a workshop invocation cell in `two_step` mode: transformer(1) →
/// stage1 → transformer(2) → stage2 → checker or string compare. Mirrors
/// `jobs::two_step::run_two_step_testcase`'s stage order, failure-verdict
/// mapping, and stage-label message prefixes exactly.
pub(super) async fn run_workshop_two_step_invocation(
    job: &WorkshopInvokeJob,
    storage: &StorageClient,
    transformer_cfg: &WorkshopInvokeTransformer,
    work_dir: &Path,
    lang_config: &LanguageConfig,
) -> Result<WorkshopInvokeResult> {
    // `answer_path` is NOT always set for two_step, unlike what an earlier
    // version of this module assumed: `workshop-invocations.ts`'s
    // `generateAnswers` sends `answerPath: null, checker: null,
    // stdoutUploadPath: <path>` — stage2's own output IS the answer being
    // produced, so there is nothing yet to compare against. Only the "Run
    // Invocation" path (comparing against an already-generated answer) is
    // guaranteed to have one. Download optionally here, same as `invoke.rs`
    // step 3's `answer_content`, and decide what to do once stage2 has run
    // (see `decide_answer_handling`).
    let input_content = storage
        .download_string(&job.input_path)
        .await
        .with_context(|| format!("Failed to download input: {}", job.input_path))?;
    let expected_output: Option<String> = match &job.answer_path {
        Some(p) => Some(
            storage
                .download_string(p)
                .await
                .with_context(|| format!("Failed to download answer: {}", p))?,
        ),
        None => None,
    };

    let transformer_info = match classify_checker_language(&transformer_cfg.language) {
        CheckerLanguage::Cpp => {
            match compile_workshop_cpp_transformer(storage, transformer_cfg, work_dir).await {
                Ok(bin) => TransformerInfo::Cpp(bin),
                Err(e) => {
                    warn!("workshop transformer compile error: {:#}", e);
                    return Ok(failed(
                        job,
                        Verdict::SystemError,
                        Some(format!("Transformer error: {:#}", e)),
                    ));
                }
            }
        }
        CheckerLanguage::Python => {
            match storage.download_string(&transformer_cfg.source_path).await {
                Ok(source) => TransformerInfo::Python(source),
                Err(e) => {
                    warn!("workshop transformer source download error: {:#}", e);
                    return Ok(failed(
                        job,
                        Verdict::SystemError,
                        Some(format!(
                            "Failed to download transformer {}: {:#}",
                            transformer_cfg.source_path, e
                        )),
                    ));
                }
            }
        }
        CheckerLanguage::Unsupported => {
            return Ok(failed(
                job,
                Verdict::SystemError,
                Some(format!(
                    "unsupported transformer language: {}",
                    transformer_cfg.language
                )),
            ));
        }
    };

    let adjusted_time = lang_config.calculate_time_limit(job.base_time_limit_ms);
    let adjusted_memory = lang_config.calculate_memory_limit(job.base_memory_limit_mb);
    let limits = ExecutionLimits {
        time_ms: adjusted_time,
        memory_mb: adjusted_memory,
    };

    // Same include-dir/env-var wiring the ICPC/output-checker path (step 4
    // in `process_workshop_invoke_job`) applies to its own solution
    // execution — so a two_step solution that pulls in workshop `resources`
    // (e.g. a Python helper module) works the same way across both stages.
    let include_dirs = vec![PathBuf::from(".")];
    let runtime_flags =
        crate::engine::compiler::include_flags::format_include_flags(&job.language, &include_dirs);

    // Workshop has no storage-proxy wiring (see `invoke::run_workshop_python_checker`'s
    // doc comment) — aoj_checker's state.py-backed helpers stay inert for a
    // Python transformer here too.
    let storage_env: &[(String, String)] = &[];

    // --- transformer phase 1: builds stage1's stdin ---
    let stage1_stdin =
        match run_transformer(&transformer_info, 1, &input_content, "", storage_env).await {
            Ok(TransformerOutcome::Ok(out)) => {
                if let Some(msg) = &out.message {
                    debug!(
                        "Workshop transformer phase 1 stderr for job {}: {}",
                        job.job_id, msg
                    );
                }
                out.payload
            }
            Ok(TransformerOutcome::Rejected { verdict, message }) => {
                // Phase 1 only ever reads the draft's own testcase input, so a
                // rejection here can never be the solution's fault — always a
                // system/draft-authoring error. Same rule as the production
                // two_step path.
                let detail = format!("변환기가 {}로 거부함", verdict);
                let message = Some(match message {
                    Some(m) => format!("{} | {}", detail, m),
                    None => detail,
                });
                return Ok(failed(
                    job,
                    Verdict::SystemError,
                    prefix_message(transformer_label(1), message),
                ));
            }
            Err(e) => {
                warn!(
                    "Workshop transformer phase 1 failed for job {}: {:#}",
                    job.job_id, e
                );
                return Ok(failed(
                    job,
                    Verdict::SystemError,
                    prefix_message(transformer_label(1), Some(format!("{:#}", e))),
                ));
            }
        };

    // --- stage 1 user execution ---
    let stage1 = execute_sandboxed(
        &ExecutionSpec::new(work_dir)
            .with_command(&lang_config.run_command)
            .with_limits(limits.clone())
            .with_stdin(&stage1_stdin)
            .with_env_vars(runtime_flags.env_vars.clone())
            .with_fsize(RUN_FSIZE_KB),
    )
    .await
    .context("Failed to run stage1 solution in sandbox")?;

    if let Some(verdict) = run_status_to_verdict(&stage1.status) {
        return Ok(failed(job, verdict, prefix_message(stage_label(1), None)));
    }

    // --- transformer phase 2: validates stage1's output, builds stage2's stdin ---
    let stage2_stdin = match run_transformer(
        &transformer_info,
        2,
        &input_content,
        &stage1.stdout,
        storage_env,
    )
    .await
    {
        Ok(TransformerOutcome::Ok(out)) => {
            if let Some(msg) = &out.message {
                debug!(
                    "Workshop transformer phase 2 stderr for job {}: {}",
                    job.job_id, msg
                );
            }
            out.payload
        }
        Ok(TransformerOutcome::Rejected { verdict, message }) => {
            // Phase 2 rejects stage1's own output, so this IS the solution's
            // fault.
            return Ok(failed(
                job,
                verdict,
                prefix_message(transformer_label(2), message),
            ));
        }
        Err(e) => {
            warn!(
                "Workshop transformer phase 2 failed for job {}: {:#}",
                job.job_id, e
            );
            return Ok(failed(
                job,
                Verdict::SystemError,
                prefix_message(transformer_label(2), Some(format!("{:#}", e))),
            ));
        }
    };

    // --- stage 2 user execution ---
    let stage2 = execute_sandboxed(
        &ExecutionSpec::new(work_dir)
            .with_command(&lang_config.run_command)
            .with_limits(limits)
            .with_stdin(&stage2_stdin)
            .with_env_vars(runtime_flags.env_vars)
            .with_fsize(RUN_FSIZE_KB),
    )
    .await
    .context("Failed to run stage2 solution in sandbox")?;

    if let Some(verdict) = run_status_to_verdict(&stage2.status) {
        return Ok(failed(job, verdict, prefix_message(stage_label(2), None)));
    }

    // Upload stage2's full stdout if requested — mirrors `invoke.rs`'s
    // "Upload full stdout if requested" step, placed here (right after the
    // FINAL stage's execution succeeds) rather than after stage1, since
    // two_step's "the" solution output is stage2's — stage1's output is only
    // ever an intermediate hand-off to the transformer. Runs unconditionally
    // once stage2 has produced output, independent of what happens below
    // (generate-answers mode or a real comparison) — same as `invoke.rs`,
    // upload failure only warns and never changes the verdict.
    if let Some(upload_path) = &job.stdout_upload_path {
        if !stage2.stdout_bytes.is_empty() {
            if let Err(e) = storage
                .upload(upload_path, stage2.stdout_bytes.clone())
                .await
            {
                warn!("Failed to upload stage2 stdout to {}: {:#}", upload_path, e);
            }
        }
    }

    let stdout_preview = if stage2.stdout.is_empty() {
        None
    } else {
        Some(
            stage2
                .stdout
                .chars()
                .take(STDOUT_PREVIEW_CHARS)
                .collect::<String>(),
        )
    };
    let stderr = if stage2.stderr.is_empty() {
        None
    } else {
        Some(stage2.stderr.clone())
    };

    // Reported value on a clean (non-comparison-failing) outcome is the max
    // across both stages, same rule `run_two_step_testcase` uses.
    let success_time_ms = Some(stage1.time_ms.max(stage2.time_ms));
    let success_memory_kb = Some(stage1.memory_kb.max(stage2.memory_kb));

    let answer = match decide_answer_handling(expected_output.as_deref(), job.checker.is_some()) {
        AnswerDecision::NoComparisonNeeded => {
            // Generate-answers mode (`workshop-invocations.ts`'s
            // `generateAnswers`): no answer to compare against and no
            // checker attached. Stdout was already uploaded above — return
            // AC directly, same as `invoke.rs`'s step 6(a).
            return Ok(WorkshopInvokeResult::with_verdict(
                job,
                Verdict::Accepted,
                success_time_ms,
                success_memory_kb,
                stdout_preview,
                stderr,
                None,
                None,
            ));
        }
        AnswerDecision::InvariantViolation => {
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
        AnswerDecision::Compare(a) => a,
    };

    // --- final judgment: attached checker, else plain string compare ---
    let (verdict, checker_message) = if let Some(checker) = &job.checker {
        let checker_result = match classify_checker_language(&checker.language) {
            CheckerLanguage::Cpp => {
                run_workshop_cpp_checker(
                    storage,
                    checker,
                    &input_content,
                    &stage2.stdout,
                    answer,
                    work_dir,
                )
                .await
            }
            CheckerLanguage::Python => {
                run_workshop_python_checker(
                    storage,
                    checker,
                    &input_content,
                    &stage2.stdout,
                    answer,
                )
                .await
            }
            CheckerLanguage::Unsupported => {
                return Ok(failed(
                    job,
                    Verdict::SystemError,
                    Some(format!(
                        "unsupported checker language: {}",
                        checker.language
                    )),
                ));
            }
        };

        match checker_result {
            Ok(cr) => cr,
            Err(e) => {
                warn!("workshop two_step checker error: {:#}", e);
                return Ok(failed(
                    job,
                    Verdict::SystemError,
                    Some(format!("Checker error: {:#}", e)),
                ));
            }
        }
    } else if compare_output(&stage2.stdout, answer) {
        (Verdict::Accepted, None)
    } else {
        (Verdict::WrongAnswer, None)
    };

    let (time_ms, memory_kb) = if matches!(verdict, Verdict::Accepted | Verdict::Partial) {
        (success_time_ms, success_memory_kb)
    } else {
        (None, None)
    };

    Ok(WorkshopInvokeResult::with_verdict(
        job,
        verdict,
        time_ms,
        memory_kb,
        stdout_preview,
        stderr,
        checker_message,
        None,
    ))
}

/// Compile a workshop C++ transformer source into a binary, via the same
/// workshop compile cache + `compile_trusted_cpp` path as
/// `invoke::run_workshop_cpp_checker` / `invoke::compile_workshop_cpp_interactor`'s
/// compile steps (testlib.h/custom-header draft resources copied in flat
/// from `parent_work_dir`, same as there). Cache namespace is
/// `"transformer"`, distinct from `"checker"`/`"interactor"`, so the roles
/// never alias to the same cached binary.
///
/// Unlike the checker/interactor case, `aoj_transformer.h` is not a
/// draft-uploaded resource — it's a fixed judge SDK asset, exactly like
/// `engine::compiler::TransformerCompiler` (the production two_step path's
/// compiler) stages via `TrustedCompiler::with_header`. It's copied in
/// directly from `get_aoj_transformer_header_path()` and folded into the
/// cache hash so a judge deployment that changes the SDK header can't serve
/// a stale binary compiled against an older version.
async fn compile_workshop_cpp_transformer(
    storage: &StorageClient,
    transformer: &WorkshopInvokeTransformer,
    parent_work_dir: &Path,
) -> Result<PathBuf> {
    let transformer_dir = parent_work_dir.join("transformer_build");
    tokio::fs::create_dir_all(&transformer_dir).await?;

    let src_bytes = storage
        .download(&transformer.source_path)
        .await
        .with_context(|| {
            format!(
                "Failed to download transformer: {}",
                transformer.source_path
            )
        })?;
    let src_path = transformer_dir.join("transformer.cpp");
    tokio::fs::write(&src_path, &src_bytes).await?;

    let bin_path = transformer_dir.join("transformer");

    // Copy draft resources (custom headers) present in parent_work_dir into
    // the transformer sandbox box — same rationale as
    // `run_workshop_cpp_checker`'s identical block: the sandbox only mounts
    // `transformer_dir`, so resources at `parent_work_dir` root are
    // otherwise inaccessible. `read_dir` is non-recursive, so sibling build
    // dirs (`checker_build`, `interactor_build`) are skipped as directories,
    // not descended into.
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
        let dest = transformer_dir.join(name);
        if dest.exists() {
            continue; // don't clobber transformer.cpp itself
        }
        let bytes = tokio::fs::read(&path).await?;
        tokio::fs::write(&dest, &bytes).await?;
        resource_files.push((name.to_string(), bytes));
    }

    let header_path = get_aoj_transformer_header_path();
    let header_bytes = tokio::fs::read(&header_path)
        .await
        .with_context(|| format!("Failed to read aoj_transformer.h at {:?}", header_path))?;
    tokio::fs::write(transformer_dir.join("aoj_transformer.h"), &header_bytes).await?;
    resource_files.push(("aoj_transformer.h".to_string(), header_bytes));

    // Compile cache: keyed by sha256(transformer_source + sorted resources
    // incl. the SDK header). Same rationale as
    // `run_workshop_cpp_checker`/`compile_workshop_cpp_interactor`'s caches —
    // avoids recompiling for every cell in an N×M invocation matrix.
    let hash = compile_cache::compute_hash(
        &src_bytes,
        &resource_files,
        "cpp",
        &[
            "g++".to_string(),
            "-O2".to_string(),
            "-std=c++17".to_string(),
        ],
    );
    let hit = compile_cache::try_restore("transformer", &hash, &bin_path).await?;
    if !hit {
        let tc = compile_trusted_cpp(&src_path, &bin_path, &[Path::new(".")]).await?;
        if !tc.success {
            anyhow::bail!("Transformer compile failed: {}", tc.stderr);
        }
        compile_cache::save("transformer", &hash, &bin_path).await;
    }

    Ok(bin_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn failed_leaves_time_memory_stdout_empty() {
        let job = WorkshopInvokeJob {
            job_id: "j".into(),
            problem_id: 1,
            user_id: 1,
            invocation_id: 1,
            solution_id: 1,
            testcase_id: 1,
            language: "cpp".into(),
            solution_source_path: "x".into(),
            input_path: "x".into(),
            answer_path: Some("x".into()),
            resources: vec![],
            checker: None,
            base_time_limit_ms: 1000,
            base_memory_limit_mb: 256,
            problem_type: Some("two_step".into()),
            transformer: None,
            stdout_upload_path: None,
        };
        let r = failed(&job, Verdict::SystemError, Some("boom".into()));
        assert_eq!(r.verdict, "system_error");
        assert!(r.time_ms.is_none());
        assert!(r.memory_kb.is_none());
        assert!(r.stdout_preview.is_none());
        assert_eq!(r.checker_message.as_deref(), Some("boom"));
    }

    #[test]
    fn decide_answer_handling_no_answer_no_checker_is_generate_mode() {
        // workshop-invocations.ts's generateAnswers: answerPath=null,
        // checker=null, stdoutUploadPath=<path>. Must NOT be treated as an
        // invariant violation — it's the two_step "produce the answer"
        // flow, not a malformed cell.
        assert_eq!(
            decide_answer_handling(None, false),
            AnswerDecision::NoComparisonNeeded
        );
    }

    #[test]
    fn decide_answer_handling_no_answer_with_checker_is_invariant_violation() {
        // A checker with nothing to check against is a real programming
        // error — the web layer never sends this shape.
        assert_eq!(
            decide_answer_handling(None, true),
            AnswerDecision::InvariantViolation
        );
    }

    #[test]
    fn decide_answer_handling_with_answer_compares_regardless_of_checker() {
        assert_eq!(
            decide_answer_handling(Some("42"), false),
            AnswerDecision::Compare("42")
        );
        assert_eq!(
            decide_answer_handling(Some("42"), true),
            AnswerDecision::Compare("42")
        );
    }

    #[test]
    fn generate_answers_payload_deserializes_with_transformer_and_no_answer_or_checker() {
        // The exact shape workshop-invocations.ts's generateAnswers sends
        // for a two_step problem: answerPath omitted/null, checker omitted,
        // transformer present, stdoutUploadPath present.
        let json = r#"{
            "job_id": "gen-1",
            "problem_id": 2,
            "user_id": 7,
            "invocation_id": 300,
            "solution_id": 9,
            "testcase_id": 15,
            "language": "cpp",
            "solution_source_path": "workshop/2/drafts/7/solutions/main.cpp",
            "input_path": "workshop/2/drafts/7/testcases/testcase_1.input.txt",
            "base_time_limit_ms": 1000,
            "base_memory_limit_mb": 256,
            "problem_type": "two_step",
            "transformer": {"language": "cpp", "source_path": "workshop/2/drafts/7/transformer.cpp"},
            "stdout_upload_path": "workshop/2/drafts/7/testcases/testcase_1.output.txt"
        }"#;
        let job: super::WorkshopInvokeJob = serde_json::from_str(json).unwrap();
        assert!(job.answer_path.is_none());
        assert!(job.checker.is_none());
        assert_eq!(job.problem_type.as_deref(), Some("two_step"));
        assert!(job.transformer.is_some());
        assert_eq!(
            job.stdout_upload_path.as_deref(),
            Some("workshop/2/drafts/7/testcases/testcase_1.output.txt")
        );
        // And the pure decision this payload must drive:
        assert_eq!(
            decide_answer_handling(job.answer_path.as_deref(), job.checker.is_some()),
            AnswerDecision::NoComparisonNeeded
        );
    }
}
