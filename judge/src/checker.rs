//! Checker module for special judge problems
//!
//! This module handles running testlib.h-based checkers for special judge problems.
//! Checkers compare user output against the expected answer using custom logic.

use anyhow::{Context, Result};
use std::path::Path;
use tracing::{debug, info, warn};

use crate::compiler::CheckerCompiler;
use crate::executer::{execute_trusted, ExecutionLimits, ExecutionSpec};
use crate::storage::StorageClient;

/// Verdict from judging (shared with other modules)
#[derive(Debug, Clone, PartialEq)]
pub enum Verdict {
    Accepted,
    WrongAnswer,
    TimeLimitExceeded,
    MemoryLimitExceeded,
    RuntimeError,
    SystemError,
    CompileError,
    Skipped,
    PresentationError,
    Fail,
}

impl std::fmt::Display for Verdict {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Verdict::Accepted => "accepted",
            Verdict::WrongAnswer => "wrong_answer",
            Verdict::TimeLimitExceeded => "time_limit_exceeded",
            Verdict::MemoryLimitExceeded => "memory_limit_exceeded",
            Verdict::RuntimeError => "runtime_error",
            Verdict::SystemError => "system_error",
            Verdict::CompileError => "compile_error",
            Verdict::Skipped => "skipped",
            Verdict::PresentationError => "presentation_error",
            Verdict::Fail => "fail",
        };
        write!(f, "{}", s)
    }
}

/// Result of running a checker
#[derive(Debug)]
pub struct CheckerResult {
    pub verdict: Verdict,
    pub message: Option<String>,
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

    // Build execution spec for checker: <input_file> <output_file> <answer_file>
    let spec = ExecutionSpec::new(checker_path.parent().unwrap_or(Path::new(".")))
        .with_command([
            checker_path.to_str().unwrap_or(""),
            input_path.to_str().unwrap_or(""),
            user_output_path.to_str().unwrap_or(""),
            answer_path.to_str().unwrap_or(""),
        ])
        .with_limits(ExecutionLimits {
            time_ms: (timeout_secs * 1000) as u32,
            memory_mb: 512,
        });

    let result = execute_trusted(&spec)
        .await
        .context("Failed to run checker")?;

    debug!(
        "Checker result: exit_code={}, stdout={}, stderr={}",
        result.exit_code(),
        result.stdout.chars().take(200).collect::<String>(),
        result.stderr.chars().take(200).collect::<String>()
    );

    let verdict = exit_code_to_verdict(result.exit_code());

    // Checker message is typically in stderr (testlib writes to stderr)
    let message = if result.stderr.is_empty() {
        if result.stdout.is_empty() {
            None
        } else {
            Some(result.stdout.trim().to_string())
        }
    } else {
        Some(result.stderr.trim().to_string())
    };

    Ok(CheckerResult { verdict, message })
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

    /// Clear cached checker for a problem
    pub async fn clear_cache(&self, problem_id: i64) -> Result<()> {
        self.compiler.clear_cache(problem_id).await
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
