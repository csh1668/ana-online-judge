//! Checker module for special judge problems
//!
//! This module handles running testlib.h-based checkers for special judge problems.
//! Checkers compare user output against the expected answer using custom logic.

use anyhow::{Context, Result};
use std::path::Path;
use tracing::{debug, info, warn};

use crate::core::verdict::Verdict;
use crate::engine::compiler::CheckerCompiler;
use crate::engine::executer::{ExecutionLimits, ExecutionSpec};
use crate::infra::storage::StorageClient;

/// Result of running a checker
#[derive(Debug)]
pub struct CheckerResult {
    pub verdict: Verdict,
}

/// testlib.h exit codes
/// Reference: https://github.com/MikeMirzayanov/testlib
mod testlib_exit_codes {
    pub const OK: i32 = 0; // _ok
    pub const WRONG_ANSWER: i32 = 1; // _wa
    pub const PRESENTATION_ERROR: i32 = 2; // _pe (treated as WA in most systems)
    pub const FAIL: i32 = 3; // _fail (checker bug or internal error)
    pub const DIRT: i32 = 4; // _dirt (extra output in user file)
    #[allow(dead_code)]
    pub const POINTS: i32 = 5; // _points (partial scoring - not commonly used)
    pub const UNEXPECTED_EOF: i32 = 8; // _unexpected_eof
}

/// Convert testlib exit code to verdict
fn exit_code_to_verdict(exit_code: i32) -> Verdict {
    match exit_code {
        testlib_exit_codes::OK => Verdict::Accepted,
        testlib_exit_codes::WRONG_ANSWER => Verdict::WrongAnswer,
        testlib_exit_codes::PRESENTATION_ERROR => Verdict::PresentationError,
        testlib_exit_codes::FAIL => Verdict::Fail,
        testlib_exit_codes::DIRT => Verdict::WrongAnswer,
        testlib_exit_codes::UNEXPECTED_EOF => Verdict::WrongAnswer,
        _ => {
            warn!("Unknown checker exit code: {}", exit_code);
            if exit_code < 0 || exit_code > 127 {
                Verdict::SystemError
            } else {
                Verdict::WrongAnswer
            }
        }
    }
}

/// Run a testlib.h-based checker
///
/// Arguments to checker: <input_file> <user_output_file> <expected_answer_file>
pub async fn run_checker(
    checker_path: &Path,
    input_path: &Path,
    user_output_path: &Path,
    answer_path: &Path,
    timeout_secs: u64,
) -> Result<CheckerResult> {
    info!(
        "Running checker: {:?} with input={:?}, output={:?}, answer={:?}",
        checker_path, input_path, user_output_path, answer_path
    );

    // Create a temporary directory to gather all files for the sandbox
    let temp_dir = tempfile::tempdir()?;
    let work_dir = temp_dir.path();

    // Copy necessary files to the temp directory with standard names
    let checker_bin = "checker";
    let input_name = "input.txt";
    let output_name = "output.txt";
    let answer_name = "answer.txt";

    tokio::fs::copy(checker_path, work_dir.join(checker_bin)).await?;
    tokio::fs::copy(input_path, work_dir.join(input_name)).await?;
    tokio::fs::copy(user_output_path, work_dir.join(output_name)).await?;
    tokio::fs::copy(answer_path, work_dir.join(answer_name)).await?;

    // Build execution spec for sandboxed checker
    let spec = ExecutionSpec::new(work_dir)
        .with_command([
            format!("./{}", checker_bin),
            input_name.to_string(),
            output_name.to_string(),
            answer_name.to_string(),
        ])
        .with_limits(ExecutionLimits {
            // Use at least 10s as suggested by the user
            time_ms: (timeout_secs * 1000).max(10_000) as u32,
            memory_mb: 1024,
        });

    let result = crate::engine::executer::execute_sandboxed(&spec)
        .await
        .context("Failed to run checker in sandbox")?;

    debug!(
        "Checker result: status={:?}, time={}ms, memory={}kb, stdout={}, stderr={}",
        result.status,
        result.time_ms,
        result.memory_kb,
        result.stdout.chars().take(200).collect::<String>(),
        result.stderr.chars().take(200).collect::<String>()
    );

    let verdict = exit_code_to_verdict(result.exit_code());

    Ok(CheckerResult { verdict })
}

/// Checker manager for handling checker compilation and caching
pub struct CheckerManager {
    /// Compiler for checkers
    compiler: CheckerCompiler,
}

impl CheckerManager {
    /// Create a new checker manager
    pub fn new() -> Self {
        Self {
            compiler: CheckerCompiler::new(),
        }
    }

    /// Get the path to a compiled checker, compiling it if necessary
    pub async fn get_checker(
        &self,
        storage: &StorageClient,
        checker_source_path: &str,
        problem_id: i64,
    ) -> Result<std::path::PathBuf> {
        // Download source from storage
        info!("Downloading checker source: {}", checker_source_path);
        let source_content = storage.download_string(checker_source_path).await?;

        // Compile or get cached
        self.compiler
            .get_or_compile(&source_content, problem_id)
            .await
    }
}

/// Default timeout for checker execution (in seconds)
pub const DEFAULT_CHECKER_TIMEOUT_SECS: u64 = 30;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_exit_code_to_verdict() {
        assert_eq!(exit_code_to_verdict(0), Verdict::Accepted);
        assert_eq!(exit_code_to_verdict(1), Verdict::WrongAnswer);
        assert_eq!(exit_code_to_verdict(2), Verdict::PresentationError);
        assert_eq!(exit_code_to_verdict(3), Verdict::Fail);
        assert_eq!(exit_code_to_verdict(4), Verdict::WrongAnswer);
    }

    #[test]
    fn test_verdict_display() {
        assert_eq!(Verdict::Accepted.to_string(), "accepted");
        assert_eq!(Verdict::WrongAnswer.to_string(), "wrong_answer");
        assert_eq!(
            Verdict::TimeLimitExceeded.to_string(),
            "time_limit_exceeded"
        );
    }
}
