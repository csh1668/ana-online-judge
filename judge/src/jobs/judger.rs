//! Judger module for processing submission judge jobs
//!
//! This module handles the core judging logic for user submissions,
//! including running programs in sandboxes and comparing outputs.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tracing::{info, warn};

use crate::components::checker::{is_python_checker, CheckerManager, DEFAULT_CHECKER_TIMEOUT_SECS};
use crate::core::languages::{self, LanguageConfig};
use crate::core::verdict::Verdict;
use crate::engine::compiler::{compile_in_sandbox, compile_on_host};
use crate::engine::executer::{
    execute_sandboxed, ExecutionLimits, ExecutionSpec, ExecutionStatus, RUN_FSIZE_KB,
};
use crate::engine::sandbox::get_config;
use crate::infra::storage::StorageClient;
use crate::jobs::subtask::{aggregate_subtasks, TestcaseOutcome};

/// Problem type enum for judging strategy
#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ProblemType {
    #[default]
    Icpc,
    SpecialJudge,
    Interactive,
    TwoStep,
}

/// 이 문제 유형이 체커를 쓸 수 있는가. 투 스텝은 선택, 스페셜저지·인터랙티브는 필수.
pub(crate) fn problem_type_uses_checker(t: ProblemType) -> bool {
    matches!(
        t,
        ProblemType::SpecialJudge | ProblemType::Interactive | ProblemType::TwoStep
    )
}

/// 체커가 없을 때 시스템 오류로 거부해야 하는가. 투 스텝은 체커 없이도 정상(문자열 비교)이다.
pub(crate) fn problem_type_requires_checker(t: ProblemType) -> bool {
    matches!(t, ProblemType::SpecialJudge | ProblemType::Interactive)
}

/// Job received from the Redis queue
#[derive(Debug, Serialize, Deserialize)]
pub struct JudgeJob {
    pub submission_id: i64,
    pub problem_id: i64,
    pub code: String,
    pub language: String,
    pub time_limit: u32, // ms
    pub ignore_time_limit_bonus: bool,
    pub memory_limit: u32, // MB
    pub ignore_memory_limit_bonus: bool,
    pub max_score: i64,
    #[serde(default)]
    pub has_subtasks: bool,
    #[serde(default)]
    pub use_full_judge: bool,
    #[serde(default)]
    pub pass_threshold: Option<i32>,
    pub testcases: Vec<TestcaseInfo>,
    #[serde(default)]
    pub problem_type: ProblemType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checker_path: Option<String>,
    /// two_step 문제의 변환기 소스 MinIO 키. `.py`면 Python, 그 외는 C++.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transformer_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TestcaseInfo {
    pub id: i64,
    pub input_path: String,
    pub output_path: String,
    #[serde(default)]
    pub subtask_group: i32,
    #[serde(default)]
    pub score: i64,
}

/// Result of judging a submission
#[derive(Debug, Serialize, Deserialize)]
pub struct JudgeResult {
    pub submission_id: i64,
    pub verdict: String,
    pub score: i64,
    pub execution_time: Option<u32>,
    pub memory_used: Option<u32>,
    pub testcase_results: Vec<TestcaseResult>,
    /// Compile error / Runtime error message
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub passed_testcases: Option<i32>,
}

impl JudgeResult {
    pub fn system_error(submission_id: i64, error: String) -> Self {
        Self {
            submission_id,
            verdict: Verdict::SystemError.to_string(),
            score: 0,
            execution_time: None,
            memory_used: None,
            testcase_results: vec![],
            error_message: Some(error),
            passed_testcases: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TestcaseResult {
    pub testcase_id: i64,
    pub verdict: String,
    pub execution_time: Option<u32>,
    pub memory_used: Option<u32>,
    /// 실제 프로그램 출력 (디버깅/보안 테스트용, 최대 4KB)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
    /// Checker stderr message (for admin visibility)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checker_message: Option<String>,
    /// Partial score ratio in `[0.0, 1.0]` when this testcase's checker
    /// reported partial credit (testlib `POINTS_EXIT_CODE`) AND the
    /// verdict above is `partial` — i.e. only set on the subtask path,
    /// where subtask GroupMin aggregation (`jobs::subtask`) needs it. On
    /// the legacy/full-judge/interactive paths a partial result is
    /// downgraded to `wrong_answer` and this stays `None` (see
    /// `run_single_testcase` and `run_interactive_checker`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub partial_ratio: Option<f64>,
}

/// Pick the first non-accepted verdict from a list of testcase results.
///
/// Used by the full-judge path to surface a representative failure when the
/// pass threshold is not met. Returns `WrongAnswer` as a fallback if every
/// result is accepted (which should not happen on the failure branch).
fn first_failure_verdict(results: &[TestcaseResult]) -> Verdict {
    let accepted = Verdict::Accepted.to_string();
    for r in results {
        if r.verdict != accepted {
            return match r.verdict.as_str() {
                "wrong_answer" => Verdict::WrongAnswer,
                "time_limit_exceeded" => Verdict::TimeLimitExceeded,
                "memory_limit_exceeded" => Verdict::MemoryLimitExceeded,
                "runtime_error" => Verdict::RuntimeError,
                "presentation_error" => Verdict::PresentationError,
                "system_error" => Verdict::SystemError,
                "output_limit_exceeded" => Verdict::OutputLimitExceeded,
                _ => Verdict::WrongAnswer,
            };
        }
    }
    Verdict::WrongAnswer
}

fn parse_verdict(s: &str) -> Verdict {
    match s {
        "accepted" => Verdict::Accepted,
        "wrong_answer" => Verdict::WrongAnswer,
        "time_limit_exceeded" => Verdict::TimeLimitExceeded,
        "memory_limit_exceeded" => Verdict::MemoryLimitExceeded,
        "runtime_error" => Verdict::RuntimeError,
        "presentation_error" => Verdict::PresentationError,
        "skipped" => Verdict::Skipped,
        // Checker partial credit (testlib POINTS_EXIT_CODE) surfaces as
        // Verdict::Partial on the subtask path — must round-trip through
        // its string form so subtask GroupMin aggregation sees it as
        // Partial rather than defaulting to SystemError below.
        "partial" => Verdict::Partial,
        // SIGXFSZ (signal 25) on the user-execution path surfaces as
        // Verdict::OutputLimitExceeded — must round-trip through its string
        // form for the same reason as "partial" above (subtask aggregation
        // and full-judge's first_failure_verdict both re-parse the stored
        // per-testcase verdict string).
        "output_limit_exceeded" => Verdict::OutputLimitExceeded,
        _ => Verdict::SystemError,
    }
}

/// Process a judge job
pub async fn process_judge_job(
    job: &JudgeJob,
    storage: &StorageClient,
    checker_manager: &CheckerManager,
    transformer_manager: &crate::components::transformer::TransformerManager,
    redis: &mut crate::infra::redis_manager::RedisManager,
) -> Result<JudgeResult> {
    let lang_config = languages::get_language_config(&job.language)
        .ok_or_else(|| anyhow::anyhow!("Unsupported language: {}", job.language))?;

    let temp_dir = tempfile::tempdir()?;
    let source_path = temp_dir.path().join(&lang_config.source_file);

    std::fs::write(&source_path, &job.code)?;

    // Compile if needed
    if let Some(compile_cmd) = &lang_config.compile_command {
        let config = get_config();

        // .NET toolchain (dotnet build / csc) is incompatible with isolate's
        // namespace setup — assembly lazy-loader fails to find framework DLLs
        // even when mounted. Compile on host; execute still happens sandboxed.
        // See compile_on_host and files/csharp-template/ for the lockdown
        // that keeps this safe against user-supplied code.
        let compile_result = if matches!(job.language.as_str(), "csharp" | "cs" | "c#") {
            compile_on_host(temp_dir.path(), compile_cmd, config.compile_time_limit_ms).await?
        } else {
            compile_in_sandbox(
                temp_dir.path(),
                compile_cmd,
                config.compile_time_limit_ms,
                config.compile_memory_limit_mb,
                &job.language,
                &[],
            )
            .await?
        };

        if !compile_result.success {
            return Ok(JudgeResult {
                submission_id: job.submission_id,
                verdict: Verdict::CompileError.to_string(),
                score: 0,
                execution_time: None,
                memory_used: None,
                testcase_results: vec![],
                error_message: compile_result.message,
                passed_testcases: None,
            });
        }
    }

    // Get checker if this problem type uses one (special judge, interactive,
    // or two-step). CheckerInfo holds either a compiled C++ binary path or
    // Python source code. Interactive is handled separately below since it
    // maps to its own CheckerInfo variants (Interactive/CppInteractor);
    // SpecialJudge and TwoStep share the branch below since a two-step
    // problem's checker — when present — resolves identically to a special
    // judge's. Unlike SpecialJudge, TwoStep's checker is optional (it's
    // orthogonal to the transformer, see below): its absence falls through
    // to `None` instead of a system error.
    let checker_info = if job.problem_type == ProblemType::Interactive {
        match &job.checker_path {
            Some(path) => {
                if is_python_checker(path) {
                    // Interactive + Python checker: reuse the existing
                    // Python-interactive execution path unconditionally —
                    // problem_type (the SSOT for interactive dispatch)
                    // already declares interactivity here, so no
                    // source-sniffing is needed (nor is any done in the
                    // SpecialJudge branch below, which always treats
                    // special_judge + .py as a plain Python checker).
                    match checker_manager
                        .get_python_checker_source(storage, path)
                        .await
                    {
                        Ok(source) => Some(CheckerInfo::Interactive(source)),
                        Err(e) => {
                            warn!(
                                "Failed to download Python interactor for problem {}: {:#}",
                                job.problem_id, e
                            );
                            return Ok(JudgeResult {
                                submission_id: job.submission_id,
                                verdict: Verdict::SystemError.to_string(),
                                score: 0,
                                execution_time: None,
                                memory_used: None,
                                testcase_results: vec![],
                                error_message: Some(format!(
                                    "Failed to download Python interactor: {:#}",
                                    e
                                )),
                                passed_testcases: None,
                            });
                        }
                    }
                } else {
                    // Interactive + C++ checker: compile via the same
                    // checker compile path (TrustedCompiler/CheckerManager,
                    // testlib.h staging included) used for special-judge C++
                    // checkers — testlib's registerInteraction() compiles
                    // the same way registerTestlibCmd() does. Execution of
                    // the resulting binary is Task 2's scope.
                    match checker_manager
                        .get_cpp_checker(storage, path, job.problem_id)
                        .await
                    {
                        Ok(binary_path) => Some(CheckerInfo::CppInteractor(binary_path)),
                        Err(e) => {
                            warn!(
                                "Failed to get C++ interactor for problem {}: {:#}",
                                job.problem_id, e
                            );
                            return Ok(JudgeResult {
                                submission_id: job.submission_id,
                                verdict: Verdict::SystemError.to_string(),
                                score: 0,
                                execution_time: None,
                                memory_used: None,
                                testcase_results: vec![],
                                error_message: Some(format!(
                                    "Failed to compile C++ interactor: {:#}",
                                    e
                                )),
                                passed_testcases: None,
                            });
                        }
                    }
                }
            }
            None => {
                return Ok(JudgeResult {
                    submission_id: job.submission_id,
                    verdict: Verdict::SystemError.to_string(),
                    score: 0,
                    execution_time: None,
                    memory_used: None,
                    testcase_results: vec![],
                    error_message: Some("interactive problem requires checker".to_string()),
                    passed_testcases: None,
                });
            }
        }
    } else if problem_type_uses_checker(job.problem_type) {
        // Reaches here only for SpecialJudge or TwoStep — Interactive was
        // handled above, and Icpc doesn't use a checker.
        match &job.checker_path {
            Some(path) => {
                if is_python_checker(path) {
                    // Python checker: download source code (no compilation).
                    // special_judge/two_step + .py is always a plain Python checker —
                    // problem_type (Interactive) is the SSOT for interactive
                    // dispatch, so no source-sniffing here.
                    match checker_manager
                        .get_python_checker_source(storage, path)
                        .await
                    {
                        Ok(source) => Some(CheckerInfo::Python(source)),
                        Err(e) => {
                            warn!(
                                "Failed to download Python checker for problem {}: {:#}",
                                job.problem_id, e
                            );
                            return Ok(JudgeResult {
                                submission_id: job.submission_id,
                                verdict: Verdict::SystemError.to_string(),
                                score: 0,
                                execution_time: None,
                                memory_used: None,
                                testcase_results: vec![],
                                error_message: Some(format!(
                                    "Failed to download Python checker: {:#}",
                                    e
                                )),
                                passed_testcases: None,
                            });
                        }
                    }
                } else {
                    // C++ checker: compile or get cached binary
                    match checker_manager
                        .get_cpp_checker(storage, path, job.problem_id)
                        .await
                    {
                        Ok(binary_path) => Some(CheckerInfo::Cpp(binary_path)),
                        Err(e) => {
                            warn!(
                                "Failed to get checker for problem {}: {:#}",
                                job.problem_id, e
                            );
                            return Ok(JudgeResult {
                                submission_id: job.submission_id,
                                verdict: Verdict::SystemError.to_string(),
                                score: 0,
                                execution_time: None,
                                memory_used: None,
                                testcase_results: vec![],
                                error_message: Some(format!("Failed to compile checker: {:#}", e)),
                                passed_testcases: None,
                            });
                        }
                    }
                }
            }
            None => {
                if problem_type_requires_checker(job.problem_type) {
                    return Ok(JudgeResult {
                        submission_id: job.submission_id,
                        verdict: Verdict::SystemError.to_string(),
                        score: 0,
                        execution_time: None,
                        memory_used: None,
                        testcase_results: vec![],
                        error_message: Some("Special judge problem requires a checker".to_string()),
                        passed_testcases: None,
                    });
                }
                // TwoStep without a checker: falls back to plain string
                // comparison of the second-step output, same as ICPC.
                None
            }
        }
    } else {
        None
    };

    // two_step 문제의 변환기 준비. 체커와 직교하므로 둘 다 존재할 수 있다.
    let transformer_info = if job.problem_type == ProblemType::TwoStep {
        let Some(path) = job.transformer_path.as_deref() else {
            return Ok(JudgeResult::system_error(
                job.submission_id,
                "two_step problem requires a transformer".to_string(),
            ));
        };
        let prepared = if crate::components::transformer::is_python_transformer(path) {
            transformer_manager
                .get_python_transformer_source(storage, path)
                .await
                .map(crate::components::transformer::TransformerInfo::Python)
        } else {
            transformer_manager
                .get_cpp_transformer(storage, path, job.problem_id)
                .await
                .map(crate::components::transformer::TransformerInfo::Cpp)
        };
        match prepared {
            Ok(info) => Some(info),
            Err(e) => {
                warn!(
                    "Failed to prepare transformer for problem {}: {:#}",
                    job.problem_id, e
                );
                return Ok(JudgeResult::system_error(
                    job.submission_id,
                    format!("Failed to prepare transformer: {:#}", e),
                ));
            }
        }
    } else {
        None
    };

    // Start storage proxy for Python checkers (enables MinIO access via env vars)
    let needs_storage_proxy = matches!(
        checker_info,
        Some(CheckerInfo::Python(_)) | Some(CheckerInfo::Interactive(_))
    ) || matches!(
        transformer_info,
        Some(crate::components::transformer::TransformerInfo::Python(_))
    );
    let storage_proxy = if needs_storage_proxy {
        let token = format!("aoj-{}-{}", job.problem_id, job.submission_id);
        match crate::infra::storage_proxy::StorageProxy::start(
            storage.clone(),
            job.problem_id,
            &token,
        )
        .await
        {
            Ok(proxy) => {
                let env = proxy.env_vars(job.problem_id, job.submission_id, &token);
                Some((proxy, env))
            }
            Err(e) => {
                warn!("Failed to start storage proxy: {:#}", e);
                None
            }
        }
    } else {
        None
    };
    let storage_env: Vec<(String, String)> = storage_proxy
        .as_ref()
        .map(|(_, env)| env.clone())
        .unwrap_or_default();

    // Reject empty testcase set — would otherwise silently award max_score via the legacy path.
    if job.testcases.is_empty() {
        return Ok(JudgeResult::system_error(
            job.submission_id,
            "Job has no testcases".to_string(),
        ));
    }

    let mut testcase_results = Vec::with_capacity(job.testcases.len());
    let mut max_time = 0u32;
    let mut max_memory = 0u32;

    let total_testcases = job.testcases.len();

    // 0%
    let _ = redis
        .publish_progress(job.submission_id, 0, total_testcases)
        .await;

    let overall_verdict: Verdict;
    let final_score: i64;
    let mut full_judge_passed: Option<i32> = None;

    if job.has_subtasks {
        // IOI-style: group by subtask_group, fail-fast within group, continue across groups.
        use std::collections::BTreeMap;
        let mut grouped: BTreeMap<i32, Vec<&TestcaseInfo>> = BTreeMap::new();
        for tc in &job.testcases {
            grouped.entry(tc.subtask_group).or_default().push(tc);
        }

        let mut completed: usize = 0;
        for (_g, group_tcs) in grouped.iter() {
            let mut group_failed = false;
            for tc in group_tcs {
                if group_failed {
                    testcase_results.push(TestcaseResult {
                        testcase_id: tc.id,
                        verdict: Verdict::Skipped.to_string(),
                        execution_time: None,
                        memory_used: None,
                        output: None,
                        checker_message: None,
                        partial_ratio: None,
                    });
                } else {
                    let r = run_single_testcase(
                        job,
                        tc,
                        temp_dir.path(),
                        &lang_config,
                        storage,
                        checker_info.as_ref(),
                        transformer_info.as_ref(),
                        &storage_env,
                    )
                    .await?;
                    if let Some(t) = r.execution_time {
                        max_time = max_time.max(t);
                    }
                    if let Some(m) = r.memory_used {
                        max_memory = max_memory.max(m);
                    }
                    // A Partial (checker partial credit) testcase does not
                    // stop the group — GroupMin aggregation (jobs::subtask)
                    // still needs the remaining testcases in this group to
                    // compute Σ tc.score × min(ratio). Only a genuine
                    // failure (WA/TLE/MLE/RE/SystemError/...) fail-fasts.
                    if r.verdict != Verdict::Accepted.to_string()
                        && r.verdict != Verdict::Partial.to_string()
                    {
                        group_failed = true;
                    }
                    testcase_results.push(r);
                }
                completed += 1;
                let _ = redis
                    .publish_progress(job.submission_id, completed, total_testcases)
                    .await;
            }
        }

        // Re-order testcase_results back to the original job.testcases order.
        let mut by_id: std::collections::HashMap<i64, TestcaseResult> = testcase_results
            .into_iter()
            .map(|r| (r.testcase_id, r))
            .collect();
        let ordered: Vec<TestcaseResult> = job
            .testcases
            .iter()
            .filter_map(|tc| by_id.remove(&tc.id))
            .collect();
        testcase_results = ordered;

        // Aggregate.
        let outcomes: Vec<TestcaseOutcome> = job
            .testcases
            .iter()
            .zip(testcase_results.iter())
            .map(|(tc, r)| TestcaseOutcome {
                subtask_group: tc.subtask_group,
                score: tc.score,
                verdict: parse_verdict(r.verdict.as_str()),
                partial_ratio: r.partial_ratio,
            })
            .collect();
        let agg = aggregate_subtasks(&outcomes, job.max_score);
        overall_verdict = agg.overall_verdict;
        final_score = agg.final_score;
    } else if job.use_full_judge {
        // Full-judge path: no fail-fast. Run every testcase, then decide AC
        // iff `passed >= pass_threshold` (defaults to all testcases).
        let accepted_str = Verdict::Accepted.to_string();
        let mut passed: i32 = 0;
        for (idx, tc) in job.testcases.iter().enumerate() {
            let r = run_single_testcase(
                job,
                tc,
                temp_dir.path(),
                &lang_config,
                storage,
                checker_info.as_ref(),
                transformer_info.as_ref(),
                &storage_env,
            )
            .await?;

            // Only AC testcases contribute to max_time/max_memory. Failed
            // testcases (WA/TLE/MLE/RE) have unreliable timing measurements
            // due to partial execution or timeouts, and must not pollute the
            // aggregates reported back to the user.
            if r.verdict == accepted_str {
                if let Some(t) = r.execution_time {
                    max_time = max_time.max(t);
                }
                if let Some(m) = r.memory_used {
                    max_memory = max_memory.max(m);
                }
                passed += 1;
            }
            testcase_results.push(r);

            let _ = redis
                .publish_progress(job.submission_id, idx + 1, total_testcases)
                .await;
        }

        let total = job.testcases.len() as i32;
        let threshold = job.pass_threshold.unwrap_or(total);

        if passed >= threshold {
            overall_verdict = Verdict::Accepted;
            final_score = job.max_score;
        } else {
            overall_verdict = first_failure_verdict(&testcase_results);
            final_score = 0;
        }
        full_judge_passed = Some(passed);
    } else {
        // Legacy non-subtask path: fail-fast on first non-accepted; score is all-or-nothing.
        let mut legacy_verdict = Verdict::Accepted;
        for (idx, tc) in job.testcases.iter().enumerate() {
            let tc_result = run_single_testcase(
                job,
                tc,
                temp_dir.path(),
                &lang_config,
                storage,
                checker_info.as_ref(),
                transformer_info.as_ref(),
                &storage_env,
            )
            .await?;

            if let Some(time) = tc_result.execution_time {
                max_time = max_time.max(time);
            }
            if let Some(mem) = tc_result.memory_used {
                max_memory = max_memory.max(mem);
            }

            let verdict = parse_verdict(tc_result.verdict.as_str());
            testcase_results.push(tc_result);

            let _ = redis
                .publish_progress(job.submission_id, idx + 1, total_testcases)
                .await;

            if verdict != Verdict::Accepted && legacy_verdict == Verdict::Accepted {
                legacy_verdict = verdict;
                break;
            }
        }

        for i in testcase_results.len()..job.testcases.len() {
            testcase_results.push(TestcaseResult {
                testcase_id: job.testcases[i].id,
                verdict: Verdict::Skipped.to_string(),
                execution_time: None,
                memory_used: None,
                output: None,
                checker_message: None,
                partial_ratio: None,
            });
        }

        overall_verdict = legacy_verdict;
        final_score = if legacy_verdict == Verdict::Accepted {
            job.max_score
        } else {
            0
        };
    }

    // Stop storage proxy if it was started
    if let Some((proxy, _)) = storage_proxy {
        proxy.stop().await;
    }

    info!(
        "Job summary: submission_id={}, verdict={}, score={}/{}, max_time_ms={}, max_memory_kb={}",
        job.submission_id,
        overall_verdict.to_string(),
        final_score,
        job.max_score,
        max_time,
        max_memory
    );

    let (execution_time, memory_used) = match overall_verdict {
        Verdict::Accepted => (Some(max_time), Some(max_memory)),
        Verdict::Partial => {
            aggregate_completed_group_time_memory(&job.testcases, &testcase_results)
        }
        _ => (None, None),
    };

    Ok(JudgeResult {
        submission_id: job.submission_id,
        verdict: overall_verdict.to_string(),
        execution_time,
        score: final_score,
        memory_used,
        testcase_results,
        error_message: None,
        passed_testcases: full_judge_passed,
    })
}

/// Aggregate max time/memory across subtask groups that ran to completion —
/// every TC in the group is `Accepted` or `Partial` (checker partial
/// credit still means the program ran to completion; only a genuine
/// failure — WA/TLE/MLE/RE/SystemError/... — anywhere in the group has
/// unreliable/absent timing and excludes it). Used to compute the report
/// for a submission whose overall verdict is `Partial`.
fn aggregate_completed_group_time_memory(
    testcases: &[TestcaseInfo],
    results: &[TestcaseResult],
) -> (Option<u32>, Option<u32>) {
    use std::collections::BTreeMap;
    let accepted_str = Verdict::Accepted.to_string();
    let partial_str = Verdict::Partial.to_string();
    let mut grouped: BTreeMap<i32, Vec<&TestcaseResult>> = BTreeMap::new();
    for (tc, r) in testcases.iter().zip(results.iter()) {
        grouped.entry(tc.subtask_group).or_default().push(r);
    }
    let mut time = 0u32;
    let mut memory = 0u32;
    let mut any = false;
    for items in grouped.values() {
        if items
            .iter()
            .all(|r| r.verdict == accepted_str || r.verdict == partial_str)
        {
            for r in items {
                if let Some(t) = r.execution_time {
                    time = time.max(t);
                    any = true;
                }
                if let Some(m) = r.memory_used {
                    memory = memory.max(m);
                    any = true;
                }
            }
        }
    }
    if any {
        (Some(time), Some(memory))
    } else {
        (None, None)
    }
}

/// Info about the checker to use for special judge / interactive problems
pub(crate) enum CheckerInfo {
    /// Compiled C++ binary path
    Cpp(std::path::PathBuf),
    /// Python output checker source code
    Python(String),
    /// Python interactive checker source code
    Interactive(String),
    /// Compiled C++ interactor binary path (testlib `registerInteraction`).
    CppInteractor(std::path::PathBuf),
}

async fn run_single_testcase(
    job: &JudgeJob,
    tc: &TestcaseInfo,
    work_dir: &Path,
    lang_config: &LanguageConfig,
    storage: &StorageClient,
    checker_info: Option<&CheckerInfo>,
    transformer_info: Option<&crate::components::transformer::TransformerInfo>,
    storage_env: &[(String, String)],
) -> Result<TestcaseResult> {
    // two_step: 유저 프로그램을 순차로 두 번 실행하고 그 사이를 변환기가 중계한다.
    // 인터랙티브와 같은 자리에서 갈라지므로 서브태스크·풀저지·레거시 세 집계
    // 경로가 그대로 따라온다.
    if let Some(transformer) = transformer_info {
        return crate::jobs::two_step::run_two_step_testcase(
            job,
            tc,
            work_dir,
            lang_config,
            storage,
            transformer,
            checker_info,
            storage_env,
        )
        .await;
    }

    // Interactive mode (Python or C++ interactor): run user program and
    // interactor simultaneously — both variants funnel into
    // run_interactive_testcase, which dispatches to the matching
    // components::checker entry point.
    match checker_info {
        Some(info @ CheckerInfo::Interactive(_)) | Some(info @ CheckerInfo::CppInteractor(_)) => {
            return run_interactive_testcase(
                job,
                tc,
                work_dir,
                lang_config,
                storage,
                info,
                storage_env,
            )
            .await;
        }
        _ => {}
    }

    let input_content = storage
        .download_string_cached(&tc.input_path)
        .await
        .with_context(|| format!("Failed to download testcase input: {}", tc.input_path))?;

    let expected_output = storage
        .download_string_cached(&tc.output_path)
        .await
        .with_context(|| format!("Failed to download testcase output: {}", tc.output_path))?;

    let adjusted_time_limit = if job.ignore_time_limit_bonus {
        job.time_limit
    } else {
        lang_config.calculate_time_limit(job.time_limit)
    };
    let adjusted_memory_limit = if job.ignore_memory_limit_bonus {
        job.memory_limit
    } else {
        lang_config.calculate_memory_limit(job.memory_limit)
    };

    // Run user's program using execute_sandboxed. fsize is tightened to
    // RUN_FSIZE_KB (32MB) here — unlike compilation/checker/validator runs,
    // which keep ExecutionSpec::default()'s 256MB — so a submission that
    // floods stdout is killed by SIGXFSZ well before isolate's much larger
    // default cap, and gets a proper OutputLimitExceeded verdict below
    // instead of exhausting box disk space.
    let spec = ExecutionSpec::new(work_dir)
        .with_command(&lang_config.run_command)
        .with_limits(ExecutionLimits {
            time_ms: adjusted_time_limit,
            memory_mb: adjusted_memory_limit,
        })
        .with_stdin(&input_content)
        .with_fsize(RUN_FSIZE_KB);

    let run_result = execute_sandboxed(&spec).await?;

    let output_preview = if run_result.stdout.is_empty() {
        None
    } else {
        let truncated: String = run_result.stdout.chars().take(4096).collect();
        Some(truncated)
    };

    // Determine verdict based on run status and problem type
    let (verdict, checker_message, partial_ratio) = match run_result.status {
        ExecutionStatus::Exited(0) => {
            evaluate_user_output(
                checker_info,
                tc.id,
                &input_content,
                &run_result.stdout,
                &expected_output,
                storage_env,
            )
            .await?
        }
        ExecutionStatus::Exited(_) => (Verdict::RuntimeError, None, None),
        ExecutionStatus::TimeLimitExceeded => (Verdict::TimeLimitExceeded, None, None),
        ExecutionStatus::MemoryLimitExceeded => (Verdict::MemoryLimitExceeded, None, None),
        // Signal 25 = SIGXFSZ: the user program was killed for exceeding
        // isolate's --fsize cap (RUN_FSIZE_KB on this, the user-execution,
        // path). Only meaningful here — checker/compiler/workshop Signaled
        // handling is untouched and keeps mapping every signal to a generic
        // crash verdict, since those paths never tighten fsize.
        ExecutionStatus::Signaled(25) => (Verdict::OutputLimitExceeded, None, None),
        ExecutionStatus::Signaled(_) => (Verdict::RuntimeError, None, None),
        ExecutionStatus::SystemError => (Verdict::SystemError, None, None),
    };

    // Non-subtask problems score all-or-nothing: a checker's partial credit
    // (Verdict::Partial, 0 < ratio < 1) only has meaning when there are
    // subtask groups to apply GroupMin aggregation across (jobs::subtask).
    // Without subtasks, downgrade to WrongAnswer but keep the points info
    // visible in checker_message — preserves legacy all-or-nothing scoring
    // semantics while still surfacing what the checker actually reported.
    let (verdict, checker_message, partial_ratio) = downgrade_partial_without_subtasks(
        job.has_subtasks,
        verdict,
        checker_message,
        partial_ratio,
    );

    // A Partial testcase (checker partial credit) ran to completion just
    // like Accepted — only a genuine failure (WA/TLE/MLE/RE/...) has
    // unreliable/absent timing. Excluding Partial here would silently drop
    // it from max_time/max_memory aggregation and the subtask-group
    // aggregate below (Verdict::Partial branch of process_judge_job).
    let (execution_time, memory_used) = if matches!(verdict, Verdict::Accepted | Verdict::Partial) {
        (Some(run_result.time_ms), Some(run_result.memory_kb))
    } else {
        (None, None)
    };

    Ok(TestcaseResult {
        testcase_id: tc.id,
        verdict: verdict.to_string(),
        execution_time,
        memory_used,
        output: output_preview,
        checker_message,
        partial_ratio,
    })
}

/// 유저 출력에 대해 체커를 돌리거나, 체커가 없으면 ICPC 문자열 비교를 한다.
///
/// `run_single_testcase`와 `jobs::two_step`이 공유한다. 인터랙티브 변종은
/// 여기 도달할 수 없다 (호출부에서 이미 조기 반환된다).
pub(crate) async fn evaluate_user_output(
    checker_info: Option<&CheckerInfo>,
    tc_id: i64,
    input_content: &str,
    user_output: &str,
    expected_output: &str,
    storage_env: &[(String, String)],
) -> Result<(Verdict, Option<String>, Option<f64>)> {
    let Some(info) = checker_info else {
        return Ok(if compare_output(user_output, expected_output) {
            (Verdict::Accepted, None, None)
        } else {
            (Verdict::WrongAnswer, None, None)
        });
    };

    let checker_temp_dir = tempfile::tempdir()?;
    let input_path = checker_temp_dir.path().join("input.txt");
    let output_path = checker_temp_dir.path().join("output.txt");
    let answer_path = checker_temp_dir.path().join("answer.txt");

    tokio::fs::write(&input_path, input_content).await?;
    tokio::fs::write(&output_path, user_output).await?;
    tokio::fs::write(&answer_path, expected_output).await?;

    Ok(match info {
        CheckerInfo::Cpp(checker_path) => {
            match crate::components::checker::run_checker(
                checker_path,
                &input_path,
                &output_path,
                &answer_path,
                DEFAULT_CHECKER_TIMEOUT_SECS,
            )
            .await
            {
                Ok(r) => (r.verdict, r.checker_message, r.partial_ratio),
                Err(e) => {
                    warn!("Checker failed for testcase {}: {}", tc_id, e);
                    (Verdict::SystemError, Some(format!("{:#}", e)), None)
                }
            }
        }
        CheckerInfo::Python(source) => {
            match crate::components::checker::run_python_checker(
                source,
                &input_path,
                &output_path,
                &answer_path,
                DEFAULT_CHECKER_TIMEOUT_SECS,
                storage_env,
            )
            .await
            {
                Ok(r) => (r.verdict, r.checker_message, r.partial_ratio),
                Err(e) => {
                    warn!("Python checker failed for testcase {}: {}", tc_id, e);
                    (Verdict::SystemError, Some(format!("{:#}", e)), None)
                }
            }
        }
        CheckerInfo::Interactive(_) => {
            unreachable!("Interactive checker handled separately")
        }
        CheckerInfo::CppInteractor(_) => {
            unreachable!("CppInteractor handled separately")
        }
    })
}

/// 서브태스크가 없는 문제에서 체커 부분 점수를 오답으로 강등한다.
///
/// 부분 점수(`Verdict::Partial`, 0 < ratio < 1)는 GroupMin 집계
/// (`jobs::subtask`)를 적용할 그룹이 있을 때만 의미가 있다. 서브태스크가
/// 없으면 전부 아니면 전무 채점이 되므로 오답으로 내리되, 체커가 실제로
/// 무엇을 보고했는지는 메시지에 남긴다.
pub(crate) fn downgrade_partial_without_subtasks(
    has_subtasks: bool,
    verdict: Verdict,
    checker_message: Option<String>,
    partial_ratio: Option<f64>,
) -> (Verdict, Option<String>, Option<f64>) {
    if verdict != Verdict::Partial || has_subtasks {
        return (verdict, checker_message, partial_ratio);
    }
    let points = partial_ratio.unwrap_or(0.0) * 100.0;
    let note = format!(
        "partial: {} points (no subtasks configured — scored as WA)",
        crate::components::checker::format_points(points)
    );
    let combined = match checker_message {
        Some(m) => format!("{} | {}", note, m),
        None => note,
    };
    (Verdict::WrongAnswer, Some(combined), None)
}

/// Compare program output with expected output
pub fn compare_output(actual: &str, expected: &str) -> bool {
    // Normalize outputs: trim trailing whitespace from each line and trailing newlines
    let normalize = |s: &str| -> Vec<String> {
        s.lines()
            .map(|line| line.trim_end().to_string())
            .collect::<Vec<_>>()
    };

    let actual_lines = normalize(actual);
    let expected_lines = normalize(expected);

    // Remove trailing empty lines
    let trim_trailing = |lines: Vec<String>| -> Vec<String> {
        let mut lines = lines;
        while lines.last().map(|s| s.is_empty()).unwrap_or(false) {
            lines.pop();
        }
        lines
    };

    let actual_lines = trim_trailing(actual_lines);
    let expected_lines = trim_trailing(expected_lines);

    actual_lines == expected_lines
}

/// Run a single testcase in interactive mode.
///
/// The user program and interactor run simultaneously with piped I/O.
/// The interactor determines the verdict via its exit code. `checker_info`
/// must be `CheckerInfo::Interactive` (Python) or `CheckerInfo::CppInteractor`
/// (C++, compiled `registerInteraction` binary) — any other variant is a
/// caller bug (the two match arms in `run_single_testcase` are the only
/// callers, and they only reach here for those two variants).
async fn run_interactive_testcase(
    job: &JudgeJob,
    tc: &TestcaseInfo,
    work_dir: &Path,
    lang_config: &LanguageConfig,
    storage: &StorageClient,
    checker_info: &CheckerInfo,
    storage_env: &[(String, String)],
) -> Result<TestcaseResult> {
    // Only download input (no expected output for interactive problems).
    // Uses the ETag-validated cache, same as the non-interactive path
    // (run_single_testcase) — this was previously plain download_string,
    // missing the P2 caching that testcase inputs otherwise get.
    let input_content = storage
        .download_string_cached(&tc.input_path)
        .await
        .with_context(|| format!("Failed to download testcase input: {}", tc.input_path))?;

    let adjusted_time_limit = if job.ignore_time_limit_bonus {
        job.time_limit
    } else {
        lang_config.calculate_time_limit(job.time_limit)
    };
    let adjusted_memory_limit = if job.ignore_memory_limit_bonus {
        job.memory_limit
    } else {
        lang_config.calculate_memory_limit(job.memory_limit)
    };
    let user_limits = ExecutionLimits {
        time_ms: adjusted_time_limit,
        memory_mb: adjusted_memory_limit,
    };

    let result = match checker_info {
        CheckerInfo::Interactive(checker_source) => {
            crate::components::checker::run_interactive_checker(
                checker_source,
                &input_content,
                work_dir,
                &lang_config.run_command,
                &user_limits,
                storage_env,
            )
            .await
        }
        CheckerInfo::CppInteractor(interactor_binary) => {
            crate::components::checker::run_cpp_interactor(
                interactor_binary,
                &input_content,
                work_dir,
                &lang_config.run_command,
                &user_limits,
                storage_env,
            )
            .await
        }
        CheckerInfo::Cpp(_) | CheckerInfo::Python(_) => {
            unreachable!(
                "run_interactive_testcase called with a non-interactive CheckerInfo variant"
            )
        }
    };

    match result {
        Ok(r) => {
            let (execution_time, memory_used) = if r.verdict == Verdict::Accepted {
                (Some(r.user_time_ms), Some(r.user_memory_kb))
            } else {
                (None, None)
            };

            Ok(TestcaseResult {
                testcase_id: tc.id,
                verdict: r.verdict.to_string(),
                execution_time,
                memory_used,
                output: None,
                checker_message: r.checker_message,
                // Interactive checkers always resolve to a binary
                // Accepted/WrongAnswer result — a POINTS_EXIT_CODE partial
                // is downgraded to WrongAnswer inside
                // `run_interactive_checker` itself, so there is no ratio to
                // carry through here.
                partial_ratio: None,
            })
        }
        Err(e) => {
            warn!("Interactive checker failed for testcase {}: {}", tc.id, e);
            Ok(TestcaseResult {
                testcase_id: tc.id,
                verdict: Verdict::SystemError.to_string(),
                execution_time: None,
                memory_used: None,
                output: None,
                checker_message: Some(format!("{:#}", e)),
                partial_ratio: None,
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compare_output_exact_match() {
        assert!(compare_output("hello\nworld\n", "hello\nworld\n"));
    }

    #[test]
    fn test_compare_output_trailing_whitespace() {
        assert!(compare_output("hello  \nworld\n", "hello\nworld\n"));
    }

    #[test]
    fn test_compare_output_trailing_newlines() {
        assert!(compare_output("hello\nworld\n\n\n", "hello\nworld\n"));
    }

    #[test]
    fn test_compare_output_different() {
        assert!(!compare_output("hello\nworld\n", "hello\nearth\n"));
    }

    #[test]
    fn test_problem_type_default() {
        let pt: ProblemType = Default::default();
        assert_eq!(pt, ProblemType::Icpc);
    }

    #[test]
    fn test_problem_type_uses_checker_matches_expected_table() {
        // Icpc: never uses a checker.
        assert!(!problem_type_uses_checker(ProblemType::Icpc));
        // SpecialJudge and Interactive: always use a checker.
        assert!(problem_type_uses_checker(ProblemType::SpecialJudge));
        assert!(problem_type_uses_checker(ProblemType::Interactive));
        // TwoStep: uses a checker when present (optional, but the branch must
        // still handle it the same way SpecialJudge does).
        assert!(problem_type_uses_checker(ProblemType::TwoStep));
    }

    #[test]
    fn test_problem_type_requires_checker_matches_expected_table() {
        // Icpc: checker absent is fine (string comparison).
        assert!(!problem_type_requires_checker(ProblemType::Icpc));
        // SpecialJudge and Interactive: checker absent is a system error.
        assert!(problem_type_requires_checker(ProblemType::SpecialJudge));
        assert!(problem_type_requires_checker(ProblemType::Interactive));
        // TwoStep: checker is optional — absence must NOT be rejected.
        assert!(!problem_type_requires_checker(ProblemType::TwoStep));
    }

    #[test]
    fn test_problem_type_interactive_round_trips_through_serde() {
        // New variant: "interactive" <-> ProblemType::Interactive.
        let json = serde_json::to_string(&ProblemType::Interactive).unwrap();
        assert_eq!(json, "\"interactive\"");
        let back: ProblemType = serde_json::from_str(&json).unwrap();
        assert_eq!(back, ProblemType::Interactive);
        // Also from a raw literal, as it would arrive from the web queue.
        let from_literal: ProblemType = serde_json::from_str("\"interactive\"").unwrap();
        assert_eq!(from_literal, ProblemType::Interactive);
    }

    #[test]
    fn test_problem_type_two_step_round_trips_through_serde() {
        let json = serde_json::to_string(&ProblemType::TwoStep).unwrap();
        assert_eq!(json, "\"two_step\"");
        let back: ProblemType = serde_json::from_str(&json).unwrap();
        assert_eq!(back, ProblemType::TwoStep);

        let from_literal: ProblemType = serde_json::from_str("\"two_step\"").unwrap();
        assert_eq!(from_literal, ProblemType::TwoStep);
    }

    #[test]
    fn test_judge_job_without_transformer_path_deserializes() {
        // 구버전 페이로드 호환: transformer_path가 없어도 역직렬화된다.
        let json = r#"{
            "submission_id": 1, "problem_id": 2, "code": "x", "language": "cpp",
            "time_limit": 1000, "ignore_time_limit_bonus": false,
            "memory_limit": 256, "ignore_memory_limit_bonus": false,
            "max_score": 100, "testcases": []
        }"#;
        let job: JudgeJob = serde_json::from_str(json).unwrap();
        assert_eq!(job.transformer_path, None);
        assert_eq!(job.problem_type, ProblemType::Icpc);
    }

    #[test]
    fn test_judge_job_with_two_step_payload_deserializes() {
        let json = r#"{
            "submission_id": 1, "problem_id": 2, "code": "x", "language": "cpp",
            "time_limit": 1000, "ignore_time_limit_bonus": false,
            "memory_limit": 256, "ignore_memory_limit_bonus": false,
            "max_score": 100, "testcases": [],
            "problem_type": "two_step",
            "transformer_path": "problems/2/transformer.cpp"
        }"#;
        let job: JudgeJob = serde_json::from_str(json).unwrap();
        assert_eq!(job.problem_type, ProblemType::TwoStep);
        assert_eq!(
            job.transformer_path.as_deref(),
            Some("problems/2/transformer.cpp")
        );
    }

    #[test]
    fn test_problem_type_special_judge_round_trips_through_serde() {
        // Regression: pre-existing variant must keep its wire form.
        let json = serde_json::to_string(&ProblemType::SpecialJudge).unwrap();
        assert_eq!(json, "\"special_judge\"");
        let back: ProblemType = serde_json::from_str(&json).unwrap();
        assert_eq!(back, ProblemType::SpecialJudge);
    }

    #[test]
    fn test_problem_type_icpc_round_trips_through_serde() {
        // Regression: pre-existing default variant must keep its wire form.
        let json = serde_json::to_string(&ProblemType::Icpc).unwrap();
        assert_eq!(json, "\"icpc\"");
        let back: ProblemType = serde_json::from_str(&json).unwrap();
        assert_eq!(back, ProblemType::Icpc);
    }

    #[test]
    fn test_judge_job_deserializes_without_subtask_fields() {
        let json = r#"{
            "submission_id": 1,
            "problem_id": 1,
            "code": "",
            "language": "cpp",
            "time_limit": 1000,
            "ignore_time_limit_bonus": false,
            "memory_limit": 256,
            "ignore_memory_limit_bonus": false,
            "max_score": 100,
            "testcases": [
                { "id": 1, "input_path": "a", "output_path": "b" }
            ]
        }"#;
        let job: JudgeJob = serde_json::from_str(json).unwrap();
        assert!(!job.has_subtasks);
        assert_eq!(job.testcases[0].subtask_group, 0);
        assert_eq!(job.testcases[0].score, 0);
    }

    #[test]
    fn test_judge_job_deserializes_with_subtask_fields() {
        let json = r#"{
            "submission_id": 1,
            "problem_id": 1,
            "code": "",
            "language": "cpp",
            "time_limit": 1000,
            "ignore_time_limit_bonus": false,
            "memory_limit": 256,
            "ignore_memory_limit_bonus": false,
            "max_score": 50,
            "has_subtasks": true,
            "testcases": [
                { "id": 1, "input_path": "a", "output_path": "b", "subtask_group": 1, "score": 30 },
                { "id": 2, "input_path": "c", "output_path": "d", "subtask_group": 2, "score": 20 }
            ]
        }"#;
        let job: JudgeJob = serde_json::from_str(json).unwrap();
        assert!(job.has_subtasks);
        assert_eq!(job.testcases[1].subtask_group, 2);
        assert_eq!(job.testcases[1].score, 20);
    }

    #[test]
    fn test_judge_job_deserializes_with_full_judge_fields() {
        let json = r#"{
            "submission_id": 1,
            "problem_id": 1,
            "code": "",
            "language": "cpp",
            "time_limit": 1000,
            "ignore_time_limit_bonus": false,
            "memory_limit": 256,
            "ignore_memory_limit_bonus": false,
            "max_score": 100,
            "use_full_judge": true,
            "pass_threshold": 7,
            "testcases": [
                { "id": 1, "input_path": "a", "output_path": "b" }
            ]
        }"#;
        let job: JudgeJob = serde_json::from_str(json).unwrap();
        assert!(job.use_full_judge);
        assert_eq!(job.pass_threshold, Some(7));
    }

    #[test]
    fn test_judge_job_full_judge_defaults() {
        let json = r#"{
            "submission_id": 1, "problem_id": 1, "code": "", "language": "cpp",
            "time_limit": 1000, "ignore_time_limit_bonus": false,
            "memory_limit": 256, "ignore_memory_limit_bonus": false,
            "max_score": 100,
            "testcases": [{ "id": 1, "input_path": "a", "output_path": "b" }]
        }"#;
        let job: JudgeJob = serde_json::from_str(json).unwrap();
        assert!(!job.use_full_judge);
        assert_eq!(job.pass_threshold, None);
    }

    #[test]
    fn test_parse_verdict_preserves_presentation_error() {
        // Regression: a special-judge testcase returning PE must aggregate as
        // PresentationError, not collapse into SystemError.
        assert_eq!(
            parse_verdict("presentation_error"),
            Verdict::PresentationError
        );
    }

    #[test]
    fn test_parse_verdict_known_values() {
        assert_eq!(parse_verdict("accepted"), Verdict::Accepted);
        assert_eq!(parse_verdict("wrong_answer"), Verdict::WrongAnswer);
        assert_eq!(
            parse_verdict("time_limit_exceeded"),
            Verdict::TimeLimitExceeded
        );
        assert_eq!(
            parse_verdict("memory_limit_exceeded"),
            Verdict::MemoryLimitExceeded
        );
        assert_eq!(parse_verdict("runtime_error"), Verdict::RuntimeError);
        assert_eq!(parse_verdict("skipped"), Verdict::Skipped);
    }

    #[test]
    fn test_parse_verdict_unknown_defaults_to_system_error() {
        assert_eq!(parse_verdict("system_error"), Verdict::SystemError);
        assert_eq!(parse_verdict("nonsense"), Verdict::SystemError);
    }

    #[test]
    fn test_first_failure_verdict_picks_first_non_accepted() {
        let results = vec![
            TestcaseResult {
                testcase_id: 1,
                verdict: "accepted".to_string(),
                execution_time: Some(10),
                memory_used: Some(1024),
                output: None,
                checker_message: None,
                partial_ratio: None,
            },
            TestcaseResult {
                testcase_id: 2,
                verdict: "time_limit_exceeded".to_string(),
                execution_time: None,
                memory_used: None,
                output: None,
                checker_message: None,
                partial_ratio: None,
            },
            TestcaseResult {
                testcase_id: 3,
                verdict: "wrong_answer".to_string(),
                execution_time: None,
                memory_used: None,
                output: None,
                checker_message: None,
                partial_ratio: None,
            },
        ];
        let v = first_failure_verdict(&results);
        assert_eq!(v, Verdict::TimeLimitExceeded);
    }

    #[test]
    fn test_first_failure_verdict_all_accepted_returns_wrong_answer_default() {
        let results = vec![TestcaseResult {
            testcase_id: 1,
            verdict: "accepted".to_string(),
            execution_time: Some(10),
            memory_used: Some(1024),
            output: None,
            checker_message: None,
            partial_ratio: None,
        }];
        let v = first_failure_verdict(&results);
        assert_eq!(v, Verdict::WrongAnswer);
    }

    #[test]
    fn test_parse_verdict_round_trips_partial() {
        // Regression: a subtask-path testcase returning checker partial
        // credit (Verdict::Partial) must round-trip through its string form
        // so GroupMin aggregation (jobs::subtask) sees Partial, not
        // SystemError.
        assert_eq!(parse_verdict("partial"), Verdict::Partial);
        assert_eq!(
            parse_verdict(&Verdict::Partial.to_string()),
            Verdict::Partial
        );
    }

    #[test]
    fn test_parse_verdict_round_trips_output_limit_exceeded() {
        // A subtask-path testcase whose user program hit SIGXFSZ must
        // round-trip through its string form so aggregation sees
        // OutputLimitExceeded, not SystemError.
        assert_eq!(
            parse_verdict("output_limit_exceeded"),
            Verdict::OutputLimitExceeded
        );
        assert_eq!(
            parse_verdict(&Verdict::OutputLimitExceeded.to_string()),
            Verdict::OutputLimitExceeded
        );
    }

    #[test]
    fn test_first_failure_verdict_picks_output_limit_exceeded() {
        let results = vec![
            TestcaseResult {
                testcase_id: 1,
                verdict: "accepted".to_string(),
                execution_time: Some(10),
                memory_used: Some(1024),
                output: None,
                checker_message: None,
                partial_ratio: None,
            },
            TestcaseResult {
                testcase_id: 2,
                verdict: "output_limit_exceeded".to_string(),
                execution_time: None,
                memory_used: None,
                output: None,
                checker_message: None,
                partial_ratio: None,
            },
        ];
        let v = first_failure_verdict(&results);
        assert_eq!(v, Verdict::OutputLimitExceeded);
    }

    fn tc_info(id: i64, group: i32, score: i64) -> TestcaseInfo {
        TestcaseInfo {
            id,
            input_path: String::new(),
            output_path: String::new(),
            subtask_group: group,
            score,
        }
    }

    fn tc_result(id: i64, verdict: &str, time: Option<u32>, mem: Option<u32>) -> TestcaseResult {
        TestcaseResult {
            testcase_id: id,
            verdict: verdict.to_string(),
            execution_time: time,
            memory_used: mem,
            output: None,
            checker_message: None,
            partial_ratio: None,
        }
    }

    #[test]
    fn test_aggregate_completed_group_time_memory_preserves_partial_timing() {
        // Regression: a Partial testcase (checker partial credit) ran to
        // completion just like Accepted — it must not be dropped from the
        // subtask-group time/memory aggregate the way a genuine failure is.
        let testcases = vec![tc_info(1, 1, 60), tc_info(2, 1, 40)];
        let results = vec![
            tc_result(1, "accepted", Some(100), Some(2048)),
            tc_result(2, "partial", Some(150), Some(4096)),
        ];
        let (time, mem) = aggregate_completed_group_time_memory(&testcases, &results);
        assert_eq!(time, Some(150));
        assert_eq!(mem, Some(4096));
    }

    #[test]
    fn test_aggregate_completed_group_time_memory_excludes_group_with_real_failure() {
        // A group containing a genuine failure (WA) alongside a Partial is
        // NOT "ran to completion" as a whole — still excluded, same as the
        // pre-existing all-Accepted-only rule for a failed group.
        let testcases = vec![tc_info(1, 1, 50), tc_info(2, 1, 50), tc_info(3, 2, 100)];
        let results = vec![
            tc_result(1, "partial", Some(150), Some(4096)),
            tc_result(2, "wrong_answer", None, None),
            tc_result(3, "accepted", Some(200), Some(1024)),
        ];
        let (time, mem) = aggregate_completed_group_time_memory(&testcases, &results);
        // Only group 2 (fully Accepted) contributes.
        assert_eq!(time, Some(200));
        assert_eq!(mem, Some(1024));
    }

    #[test]
    fn test_partial_survives_when_subtasks_are_configured() {
        let (v, msg, ratio) = downgrade_partial_without_subtasks(
            true,
            Verdict::Partial,
            Some("half".to_string()),
            Some(0.5),
        );
        assert_eq!(v, Verdict::Partial);
        assert_eq!(msg.as_deref(), Some("half"));
        assert_eq!(ratio, Some(0.5));
    }

    #[test]
    fn test_partial_downgrades_to_wa_without_subtasks() {
        let (v, msg, ratio) = downgrade_partial_without_subtasks(
            false,
            Verdict::Partial,
            Some("half".to_string()),
            Some(0.5),
        );
        assert_eq!(v, Verdict::WrongAnswer);
        assert_eq!(ratio, None);
        let msg = msg.expect("downgrade must keep an explanatory message");
        assert!(msg.contains("no subtasks configured"));
        assert!(msg.contains("half"));
    }

    #[test]
    fn test_non_partial_verdicts_pass_through_untouched() {
        for verdict in [
            Verdict::Accepted,
            Verdict::WrongAnswer,
            Verdict::TimeLimitExceeded,
        ] {
            let (v, msg, ratio) = downgrade_partial_without_subtasks(false, verdict, None, None);
            assert_eq!(v, verdict);
            assert_eq!(msg, None);
            assert_eq!(ratio, None);
        }
    }
}
