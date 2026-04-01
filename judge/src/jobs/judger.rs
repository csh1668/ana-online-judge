//! Judger module for processing submission judge jobs
//!
//! This module handles the core judging logic for user submissions,
//! including running programs in sandboxes and comparing outputs.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tracing::{info, warn};

use crate::components::checker::{
    is_interactive_checker, is_python_checker, CheckerManager, DEFAULT_CHECKER_TIMEOUT_SECS,
};
use crate::core::languages::{self, LanguageConfig};
use crate::core::verdict::Verdict;
use crate::engine::compiler::compile_in_sandbox;
use crate::engine::executer::{execute_sandboxed, ExecutionLimits, ExecutionSpec, ExecutionStatus};
use crate::engine::sandbox::get_config;
use crate::infra::storage::StorageClient;

/// Problem type enum for judging strategy
#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ProblemType {
    #[default]
    Icpc,
    SpecialJudge,
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
    pub testcases: Vec<TestcaseInfo>,
    /// Problem type (icpc or special_judge)
    #[serde(default)]
    pub problem_type: ProblemType,
    /// Checker source path in MinIO (for special_judge)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checker_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TestcaseInfo {
    pub id: i64,
    pub input_path: String,
    pub output_path: String,
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
}

/// Process a judge job
pub async fn process_judge_job(
    job: &JudgeJob,
    storage: &StorageClient,
    checker_manager: &CheckerManager,
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

        let compile_result = compile_in_sandbox(
            temp_dir.path(),
            compile_cmd,
            config.compile_time_limit_ms,
            config.compile_memory_limit_mb,
        )
        .await?;

        if !compile_result.success {
            return Ok(JudgeResult {
                submission_id: job.submission_id,
                verdict: Verdict::CompileError.to_string(),
                score: 0,
                execution_time: None,
                memory_used: None,
                testcase_results: vec![],
                error_message: compile_result.message,
            });
        }
    }

    // Get checker if this is a special judge problem
    // CheckerInfo holds either a compiled C++ binary path or Python source code
    let checker_info = if job.problem_type == ProblemType::SpecialJudge {
        match &job.checker_path {
            Some(path) => {
                if is_python_checker(path) {
                    // Python checker: download source code (no compilation)
                    // Detect interactive vs output mode from imports
                    match checker_manager
                        .get_python_checker_source(storage, path)
                        .await
                    {
                        Ok(source) => {
                            if is_interactive_checker(&source) {
                                info!(
                                    "Detected interactive checker for problem {}",
                                    job.problem_id
                                );
                                Some(CheckerInfo::Interactive(source))
                            } else {
                                Some(CheckerInfo::Python(source))
                            }
                        }
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
                    error_message: Some("Special judge problem requires a checker".to_string()),
                });
            }
        }
    } else {
        None
    };

    // Start storage proxy for Python checkers (enables MinIO access via env vars)
    let storage_proxy = if matches!(
        checker_info,
        Some(CheckerInfo::Python(_)) | Some(CheckerInfo::Interactive(_))
    ) {
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

    let mut testcase_results = Vec::with_capacity(job.testcases.len());
    let mut overall_verdict = Verdict::Accepted;
    let mut max_time = 0u32;
    let mut max_memory = 0u32;

    let total_testcases = job.testcases.len();

    // 0%
    let _ = redis
        .publish_progress(job.submission_id, 0, total_testcases)
        .await;

    for (idx, tc) in job.testcases.iter().enumerate() {
        let tc_result = run_single_testcase(
            job,
            tc,
            temp_dir.path(),
            &lang_config,
            storage,
            checker_info.as_ref(),
            &storage_env,
        )
        .await?;

        if let Some(time) = tc_result.execution_time {
            max_time = max_time.max(time);
        }
        if let Some(mem) = tc_result.memory_used {
            max_memory = max_memory.max(mem);
        }

        let verdict = match tc_result.verdict.as_str() {
            "accepted" => Verdict::Accepted,
            "wrong_answer" => Verdict::WrongAnswer,
            "time_limit_exceeded" => Verdict::TimeLimitExceeded,
            "memory_limit_exceeded" => Verdict::MemoryLimitExceeded,
            "runtime_error" => Verdict::RuntimeError,
            _ => Verdict::SystemError,
        };

        testcase_results.push(tc_result);

        // Publish progress update
        let _ = redis
            .publish_progress(job.submission_id, idx + 1, total_testcases)
            .await;

        if verdict != Verdict::Accepted && overall_verdict == Verdict::Accepted {
            overall_verdict = verdict;
            break;
        }
    }

    // Mark remaining testcases as skipped if early termination
    for i in testcase_results.len()..job.testcases.len() {
        testcase_results.push(TestcaseResult {
            testcase_id: job.testcases[i].id,
            verdict: Verdict::Skipped.to_string(),
            execution_time: None,
            memory_used: None,
            output: None,
            checker_message: None,
        });
    }

    // Stop storage proxy if it was started
    if let Some((proxy, _)) = storage_proxy {
        proxy.stop().await;
    }

    info!(
        "Job summary: submission_id={}, verdict={}, max_time_ms={}, max_memory_kb={}",
        job.submission_id,
        overall_verdict.to_string(),
        max_time,
        max_memory
    );

    let execution_time = if overall_verdict == Verdict::Accepted {
        Some(max_time)
    } else {
        None
    };
    let memory_used = if overall_verdict == Verdict::Accepted {
        Some(max_memory)
    } else {
        None
    };

    Ok(JudgeResult {
        submission_id: job.submission_id,
        verdict: overall_verdict.to_string(),
        execution_time,
        score: if overall_verdict == Verdict::Accepted {
            job.max_score
        } else {
            0
        },
        memory_used,
        testcase_results,
        error_message: None,
    })
}

/// Info about the checker to use for special judge
enum CheckerInfo {
    /// Compiled C++ binary path
    Cpp(std::path::PathBuf),
    /// Python output checker source code
    Python(String),
    /// Python interactive checker source code
    Interactive(String),
}

async fn run_single_testcase(
    job: &JudgeJob,
    tc: &TestcaseInfo,
    work_dir: &Path,
    lang_config: &LanguageConfig,
    storage: &StorageClient,
    checker_info: Option<&CheckerInfo>,
    storage_env: &[(String, String)],
) -> Result<TestcaseResult> {
    // Interactive mode: run user program and interactor simultaneously
    if let Some(CheckerInfo::Interactive(source)) = checker_info {
        return run_interactive_testcase(
            job,
            tc,
            work_dir,
            lang_config,
            storage,
            source,
            storage_env,
        )
        .await;
    }

    let input_content = storage
        .download_string(&tc.input_path)
        .await
        .with_context(|| format!("Failed to download testcase input: {}", tc.input_path))?;

    let expected_output = storage
        .download_string(&tc.output_path)
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

    // Run user's program using execute_sandboxed
    let spec = ExecutionSpec::new(work_dir)
        .with_command(&lang_config.run_command)
        .with_limits(ExecutionLimits {
            time_ms: adjusted_time_limit,
            memory_mb: adjusted_memory_limit,
        })
        .with_stdin(&input_content);

    let run_result = execute_sandboxed(&spec).await?;

    let output_preview = if run_result.stdout.is_empty() {
        None
    } else {
        let truncated: String = run_result.stdout.chars().take(4096).collect();
        Some(truncated)
    };

    // Determine verdict based on run status and problem type
    let (verdict, checker_message) = match run_result.status {
        ExecutionStatus::Exited(0) => {
            // Program ran successfully, check output
            match checker_info {
                Some(info) => {
                    // Special judge: run checker
                    let checker_temp_dir = tempfile::tempdir()?;
                    let input_path = checker_temp_dir.path().join("input.txt");
                    let output_path = checker_temp_dir.path().join("output.txt");
                    let answer_path = checker_temp_dir.path().join("answer.txt");

                    tokio::fs::write(&input_path, &input_content).await?;
                    tokio::fs::write(&output_path, &run_result.stdout).await?;
                    tokio::fs::write(&answer_path, &expected_output).await?;

                    match info {
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
                                Ok(r) => (r.verdict, r.checker_message),
                                Err(e) => {
                                    warn!("Checker failed for testcase {}: {}", tc.id, e);
                                    (Verdict::SystemError, Some(format!("{:#}", e)))
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
                                Ok(r) => (r.verdict, r.checker_message),
                                Err(e) => {
                                    warn!("Python checker failed for testcase {}: {}", tc.id, e);
                                    (Verdict::SystemError, Some(format!("{:#}", e)))
                                }
                            }
                        }
                        CheckerInfo::Interactive(_) => {
                            // Should not reach here — handled by early return above
                            unreachable!("Interactive checker handled separately")
                        }
                    }
                }
                None => {
                    // ICPC: simple string comparison
                    if compare_output(&run_result.stdout, &expected_output) {
                        (Verdict::Accepted, None)
                    } else {
                        (Verdict::WrongAnswer, None)
                    }
                }
            }
        }
        ExecutionStatus::Exited(_) => (Verdict::RuntimeError, None),
        ExecutionStatus::TimeLimitExceeded => (Verdict::TimeLimitExceeded, None),
        ExecutionStatus::MemoryLimitExceeded => (Verdict::MemoryLimitExceeded, None),
        ExecutionStatus::Signaled(_) => (Verdict::RuntimeError, None),
        ExecutionStatus::SystemError => (Verdict::SystemError, None),
    };

    let (execution_time, memory_used) = if verdict == Verdict::Accepted {
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
    })
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
/// The interactor determines the verdict via its exit code.
async fn run_interactive_testcase(
    job: &JudgeJob,
    tc: &TestcaseInfo,
    work_dir: &Path,
    lang_config: &LanguageConfig,
    storage: &StorageClient,
    checker_source: &str,
    storage_env: &[(String, String)],
) -> Result<TestcaseResult> {
    // Only download input (no expected output for interactive problems)
    let input_content = storage
        .download_string(&tc.input_path)
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

    match crate::components::checker::run_interactive_checker(
        checker_source,
        &input_content,
        work_dir,
        &lang_config.run_command,
        &ExecutionLimits {
            time_ms: adjusted_time_limit,
            memory_mb: adjusted_memory_limit,
        },
        DEFAULT_CHECKER_TIMEOUT_SECS,
        storage_env,
    )
    .await
    {
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
}
