//! Judger module for processing submission judge jobs
//!
//! This module handles the core judging logic for user submissions,
//! including running programs in sandboxes and comparing outputs.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

use crate::checker::{CheckerManager, Verdict, DEFAULT_CHECKER_TIMEOUT_SECS};
use crate::compiler::compile_in_sandbox;
use crate::executer::{execute_sandboxed, ExecutionLimits, ExecutionSpec, ExecutionStatus};
use crate::languages;
use crate::sandbox::get_config;
use crate::storage::StorageClient;

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
    pub execution_time: Option<u32>,
    pub memory_used: Option<u32>,
    pub testcase_results: Vec<TestcaseResult>,
    /// Compile error / Runtime error message
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
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
}

/// Process a judge job
pub async fn process_judge_job(
    job: &JudgeJob,
    storage: &StorageClient,
    checker_manager: &CheckerManager,
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
                execution_time: None,
                memory_used: None,
                testcase_results: vec![],
                error_message: compile_result.message,
            });
        }
    }

    // Get checker path if this is a special judge problem
    let checker_binary = if job.problem_type == ProblemType::SpecialJudge {
        match &job.checker_path {
            Some(path) => {
                match checker_manager
                    .get_checker(storage, path, job.problem_id)
                    .await
                {
                    Ok(binary_path) => Some(binary_path),
                    Err(e) => {
                        return Ok(JudgeResult {
                            submission_id: job.submission_id,
                            verdict: Verdict::SystemError.to_string(),
                            execution_time: None,
                            memory_used: None,
                            testcase_results: vec![],
                            error_message: Some(format!("Failed to compile checker: {}", e)),
                        });
                    }
                }
            }
            None => {
                return Ok(JudgeResult {
                    submission_id: job.submission_id,
                    verdict: Verdict::SystemError.to_string(),
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

    let mut testcase_results = Vec::with_capacity(job.testcases.len());
    let mut overall_verdict = Verdict::Accepted;
    let mut max_time = 0u32;
    let mut max_memory = 0u32;

    for tc in job.testcases.iter() {
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
        let spec = ExecutionSpec::new(temp_dir.path())
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

        max_time = max_time.max(run_result.time_ms);
        max_memory = max_memory.max(run_result.memory_kb);

        // Determine verdict based on run status and problem type
        let verdict = match run_result.status {
            ExecutionStatus::Exited(0) => {
                // Program ran successfully, check output
                if let Some(ref checker_path) = checker_binary {
                    // Special judge: run checker
                    let checker_temp_dir = tempfile::tempdir()?;
                    let input_path = checker_temp_dir.path().join("input.txt");
                    let output_path = checker_temp_dir.path().join("output.txt");
                    let answer_path = checker_temp_dir.path().join("answer.txt");

                    tokio::fs::write(&input_path, &input_content).await?;
                    tokio::fs::write(&output_path, &run_result.stdout).await?;
                    tokio::fs::write(&answer_path, &expected_output).await?;

                    match crate::checker::run_checker(
                        checker_path,
                        &input_path,
                        &output_path,
                        &answer_path,
                        DEFAULT_CHECKER_TIMEOUT_SECS,
                    )
                    .await
                    {
                        Ok(checker_result) => checker_result.verdict,
                        Err(e) => {
                            warn!("Checker failed for testcase {}: {}", tc.id, e);
                            Verdict::SystemError
                        }
                    }
                } else {
                    // ICPC: simple string comparison
                    if compare_output(&run_result.stdout, &expected_output) {
                        Verdict::Accepted
                    } else {
                        Verdict::WrongAnswer
                    }
                }
            }
            ExecutionStatus::Exited(_) => Verdict::RuntimeError,
            ExecutionStatus::TimeLimitExceeded => Verdict::TimeLimitExceeded,
            ExecutionStatus::MemoryLimitExceeded => Verdict::MemoryLimitExceeded,
            ExecutionStatus::Signaled(_) => Verdict::RuntimeError,
            ExecutionStatus::RuntimeError => Verdict::RuntimeError,
            ExecutionStatus::SystemError => Verdict::SystemError,
        };

        let tc_result = TestcaseResult {
            testcase_id: tc.id,
            verdict: verdict.to_string(),
            execution_time: Some(run_result.time_ms),
            memory_used: Some(run_result.memory_kb),
            output: output_preview,
        };

        testcase_results.push(tc_result);

        if verdict != Verdict::Accepted && overall_verdict == Verdict::Accepted {
            overall_verdict = verdict;
            break;
        }
    }

    // Mark remaining testcases as skipped if early termination
    for i in testcase_results.len()..job.testcases.len() {
        let tc_result = TestcaseResult {
            testcase_id: job.testcases[i].id,
            verdict: Verdict::Skipped.to_string(),
            execution_time: None,
            memory_used: None,
            output: None,
        };

        testcase_results.push(tc_result);
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
        memory_used,
        testcase_results,
        error_message: None,
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
