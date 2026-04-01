//! Checker module for special judge problems
//!
//! This module handles running checkers for special judge problems:
//! - C++ testlib.h-based checkers (compiled binary)
//! - Python checkers (aoj_checker SDK)

use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use tracing::{debug, info, warn};

use crate::core::verdict::Verdict;
use crate::engine::compiler::CheckerCompiler;
use crate::engine::executer::{ExecutionLimits, ExecutionSpec, ExecutionStatus};
use crate::infra::storage::StorageClient;

/// Result of running a checker
#[derive(Debug)]
pub struct CheckerResult {
    pub verdict: Verdict,
    /// Checker stderr output (messages from checker for admin visibility)
    pub checker_message: Option<String>,
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

/// Convert testlib/Python checker exit code to verdict
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

/// Run a testlib.h-based checker (compiled C++ binary)
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
    let checker_message = if result.stderr.trim().is_empty() {
        None
    } else {
        Some(result.stderr.chars().take(4096).collect())
    };

    Ok(CheckerResult {
        verdict,
        checker_message,
    })
}

/// Get the path to the aoj_checker.py SDK file
fn get_aoj_checker_sdk_path() -> PathBuf {
    std::env::current_dir()
        .map(|cwd| cwd.join("files/aoj_checker.py"))
        .unwrap_or_else(|_| PathBuf::from("files/aoj_checker.py"))
}

/// Run a Python checker
///
/// Arguments to checker: python3 checker.py <input_file> <user_output_file> <expected_answer_file>
pub async fn run_python_checker(
    checker_source: &str,
    input_path: &Path,
    user_output_path: &Path,
    answer_path: &Path,
    timeout_secs: u64,
    env_vars: &[(String, String)],
) -> Result<CheckerResult> {
    info!(
        "Running Python checker with input={:?}, output={:?}, answer={:?}",
        input_path, user_output_path, answer_path
    );

    let temp_dir = tempfile::tempdir()?;
    let work_dir = temp_dir.path();

    let checker_name = "checker.py";
    let sdk_name = "aoj_checker.py";
    let input_name = "input.txt";
    let output_name = "output.txt";
    let answer_name = "answer.txt";

    // Copy SDK and checker script
    let sdk_path = get_aoj_checker_sdk_path();
    tokio::fs::copy(&sdk_path, work_dir.join(sdk_name)).await?;
    tokio::fs::write(work_dir.join(checker_name), checker_source).await?;

    // Copy testcase files
    tokio::fs::copy(input_path, work_dir.join(input_name)).await?;
    tokio::fs::copy(user_output_path, work_dir.join(output_name)).await?;
    tokio::fs::copy(answer_path, work_dir.join(answer_name)).await?;

    let mut spec = ExecutionSpec::new(work_dir)
        .with_command([
            "python3".to_string(),
            "-W".to_string(),
            "ignore".to_string(),
            checker_name.to_string(),
            input_name.to_string(),
            output_name.to_string(),
            answer_name.to_string(),
        ])
        .with_limits(ExecutionLimits {
            time_ms: (timeout_secs * 1000).max(10_000) as u32,
            memory_mb: 1024,
        });

    // Pass storage proxy env vars and enable network if storage is configured
    if !env_vars.is_empty() {
        spec = spec.with_env_vars(env_vars.to_vec()).with_share_net();
    }

    let result = crate::engine::executer::execute_sandboxed(&spec)
        .await
        .context("Failed to run Python checker in sandbox")?;

    debug!(
        "Python checker result: status={:?}, time={}ms, memory={}kb, stderr={}",
        result.status,
        result.time_ms,
        result.memory_kb,
        result.stderr.chars().take(200).collect::<String>()
    );

    // If the Python checker crashed (not a clean exit), treat as SystemError
    // and include the traceback as checker_message
    let (verdict, checker_message) = match result.status {
        ExecutionStatus::Exited(code) => {
            let verdict = exit_code_to_verdict(code);
            let msg = if result.stderr.trim().is_empty() {
                None
            } else {
                Some(result.stderr.chars().take(4096).collect())
            };
            (verdict, msg)
        }
        ExecutionStatus::TimeLimitExceeded => (
            Verdict::SystemError,
            Some("Python checker timed out".to_string()),
        ),
        _ => {
            let msg = if result.stderr.trim().is_empty() {
                Some("Python checker crashed".to_string())
            } else {
                Some(result.stderr.chars().take(4096).collect())
            };
            (Verdict::SystemError, msg)
        }
    };

    Ok(CheckerResult {
        verdict,
        checker_message,
    })
}

/// Determine if a checker path refers to a Python checker
pub fn is_python_checker(checker_path: &str) -> bool {
    checker_path.ends_with(".py")
}

/// Determine if a Python checker source uses Interactive mode
/// (checks for `from aoj_checker import Interactive`)
pub fn is_interactive_checker(source: &str) -> bool {
    source.contains("from aoj_checker import Interactive")
        || source.contains("from aoj_checker import Interactive,")
        || source.contains(", Interactive")
}

/// Result of running an interactive checker
#[derive(Debug)]
pub struct InteractiveCheckerResult {
    pub verdict: Verdict,
    pub user_time_ms: u32,
    pub user_memory_kb: u32,
    pub checker_message: Option<String>,
}

/// Run an interactive Python checker (interactor) alongside a user program.
///
/// The user program runs in sandbox with piped I/O.
/// The interactor runs as a trusted subprocess, communicating with the user via pipes.
pub async fn run_interactive_checker(
    checker_source: &str,
    input_content: &str,
    user_work_dir: &Path,
    user_command: &[String],
    user_limits: &ExecutionLimits,
    timeout_secs: u64,
    env_vars: &[(String, String)],
) -> Result<InteractiveCheckerResult> {
    info!("Running interactive checker");

    // Set up interactor working directory with SDK + checker + input
    let temp_dir = tempfile::tempdir()?;
    let work_dir = temp_dir.path();

    let sdk_path = get_aoj_checker_sdk_path();
    tokio::fs::copy(&sdk_path, work_dir.join("aoj_checker.py")).await?;
    tokio::fs::write(work_dir.join("checker.py"), checker_source).await?;
    tokio::fs::write(work_dir.join("input.txt"), input_content).await?;

    // Build interactor command
    let interactor_command = vec![
        "python3".to_string(),
        "-W".to_string(),
        "ignore".to_string(),
        work_dir.join("checker.py").to_string_lossy().to_string(),
        work_dir.join("input.txt").to_string_lossy().to_string(),
    ];

    // Build user execution spec
    let user_spec = crate::engine::executer::ExecutionSpec::new(user_work_dir)
        .with_command(user_command.iter().map(|s| s.as_str()))
        .with_limits(user_limits.clone())
        .with_env_vars(env_vars.to_vec());

    // Calculate overall timeout: max of user wall time and checker timeout, plus buffer
    let user_wall_secs = (user_limits.time_ms as u64 * 2 / 1000) + 2;
    let overall_timeout = timeout_secs.max(user_wall_secs) + 5;

    let outcome = crate::engine::executer::execute_interactive(
        &user_spec,
        work_dir,
        &interactor_command,
        env_vars,
        overall_timeout,
    )
    .await
    .context("Failed to run interactive checker")?;

    debug!(
        "Interactive result: user_status={:?}, user_time={}ms, user_mem={}kb, \
         interactor_exit={}, timed_out={}",
        outcome.user_status,
        outcome.user_time_ms,
        outcome.user_memory_kb,
        outcome.interactor_exit_code,
        outcome.timed_out,
    );

    // Determine verdict: user execution issues take priority over interactor verdict
    let (verdict, checker_message) = if outcome.timed_out {
        (
            Verdict::SystemError,
            Some("Interactive execution timed out".to_string()),
        )
    } else {
        match outcome.user_status {
            ExecutionStatus::TimeLimitExceeded => (Verdict::TimeLimitExceeded, None),
            ExecutionStatus::MemoryLimitExceeded => (Verdict::MemoryLimitExceeded, None),
            ExecutionStatus::Signaled(_) | ExecutionStatus::RuntimeError => {
                (Verdict::RuntimeError, None)
            }
            ExecutionStatus::SystemError => (Verdict::SystemError, None),
            ExecutionStatus::Exited(0) => {
                // User program exited normally — use interactor's verdict
                let verdict = exit_code_to_verdict(outcome.interactor_exit_code);
                let msg = if outcome.interactor_stderr.trim().is_empty() {
                    None
                } else {
                    Some(outcome.interactor_stderr.chars().take(4096).collect())
                };
                (verdict, msg)
            }
            ExecutionStatus::Exited(_) => {
                // User program exited with non-zero — could be RE or the interactor
                // already judged. Check interactor's verdict first.
                if outcome.interactor_exit_code == 0 {
                    // Interactor accepted but user exited non-zero — unusual, treat as RE
                    (Verdict::RuntimeError, None)
                } else {
                    // Use interactor's verdict (likely WA due to EOF)
                    let verdict = exit_code_to_verdict(outcome.interactor_exit_code);
                    let msg = if outcome.interactor_stderr.trim().is_empty() {
                        None
                    } else {
                        Some(outcome.interactor_stderr.chars().take(4096).collect())
                    };
                    (verdict, msg)
                }
            }
        }
    };

    Ok(InteractiveCheckerResult {
        verdict,
        user_time_ms: outcome.user_time_ms,
        user_memory_kb: outcome.user_memory_kb,
        checker_message,
    })
}

/// Checker manager for handling checker compilation and caching
pub struct CheckerManager {
    /// Compiler for C++ checkers
    compiler: CheckerCompiler,
}

impl CheckerManager {
    /// Create a new checker manager
    pub fn new() -> Self {
        Self {
            compiler: CheckerCompiler::new(),
        }
    }

    /// Get the path to a compiled C++ checker, compiling it if necessary
    pub async fn get_cpp_checker(
        &self,
        storage: &StorageClient,
        checker_source_path: &str,
        problem_id: i64,
    ) -> Result<PathBuf> {
        // Download source from storage
        info!("Downloading checker source: {}", checker_source_path);
        let source_content = storage.download_string(checker_source_path).await?;

        // Compile or get cached
        self.compiler
            .get_or_compile(&source_content, problem_id)
            .await
    }

    /// Download a Python checker source from storage
    pub async fn get_python_checker_source(
        &self,
        storage: &StorageClient,
        checker_source_path: &str,
    ) -> Result<String> {
        info!("Downloading Python checker source: {}", checker_source_path);
        storage.download_string(checker_source_path).await
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

    #[test]
    fn test_is_python_checker() {
        assert!(is_python_checker("problems/1/checker/checker.py"));
        assert!(!is_python_checker("problems/1/checker/checker.cpp"));
        assert!(is_python_checker("checker.py"));
        assert!(!is_python_checker("checker.py.bak"));
    }
}
