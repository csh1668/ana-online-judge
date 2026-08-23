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
    /// Partial score ratio in `[0.0, 1.0]` when the checker reported
    /// partial credit via testlib's `POINTS_EXIT_CODE` (see
    /// `CheckerVerdict::partial_ratio`). `None` for all other verdicts.
    pub partial_ratio: Option<f64>,
}

/// testlib.h exit codes
/// Reference: https://github.com/MikeMirzayanov/testlib
mod testlib_exit_codes {
    pub const OK: i32 = 0; // _ok
    pub const WRONG_ANSWER: i32 = 1; // _wa
    pub const PRESENTATION_ERROR: i32 = 2; // _pe (treated as WA in most systems)
    pub const FAIL: i32 = 3; // _fail (checker bug or internal error)
    pub const DIRT: i32 = 4; // _dirt (extra output in user file)
                             // NOTE: testlib's `_points` TResult *enum* value is 5 (see testlib.h's
                             // `TResult` definition), but that enum value is never used as a process
                             // exit code. The actual exit code for partial-score results is
                             // `POINTS_EXIT_CODE` (testlib.h:280-282), which `resultExitCode()`
                             // (testlib.h:2932) maps `_points` to — i.e. 7. Do not reintroduce a
                             // `POINTS: i32 = 5` constant; it was dead code that silently caused
                             // exit 7 to fall through to the `_ => unknown` branch below (WA).
    pub const POINTS_EXIT_CODE: i32 = 7; // _points, via quitp()/quitpi()
    pub const UNEXPECTED_EOF: i32 = 8; // _unexpected_eof
}

/// Result of interpreting a checker's exit code (plus stderr, for the
/// partial-score case).
#[derive(Debug, Clone, PartialEq)]
pub struct CheckerVerdict {
    pub verdict: Verdict,
    /// Partial score ratio in `[0.0, 1.0]`. Present only when the checker
    /// exited with `POINTS_EXIT_CODE` (7) and reported a parsable points
    /// value via `quitp()`. `1.0` maps to `Accepted`, `0.0` to
    /// `WrongAnswer`, anything in between to `Verdict::Partial`.
    pub partial_ratio: Option<f64>,
}

/// Parse testlib's `points <value> [message]` stderr line into a points
/// value clamped to `[0, 100]`.
///
/// Background: `quitp(points, msg)` (testlib.h ~4467-4507) exits with
/// `POINTS_EXIT_CODE` (7) and writes `points <value> <msg>` to stderr — the
/// literal `"points "` is the fixed `errorName` prefix `InStream::quit`
/// (testlib.h:3141-3144) writes for the `_points` result, immediately
/// followed by the trimmed message, which for `quitp` starts with the
/// formatted points value (testlib.h:4467-4491).
///
/// `quitpi(points_info, msg)` (testlib.h:4509-4516) also exits 7 but writes
/// `points points_info=<str> <msg>` — the token right after `"points "` is
/// not a number, so this function correctly returns `None` for it. Callers
/// that need the `points_info` string should read stderr directly; it is
/// preserved as free-form message text elsewhere and is never parsed as a
/// score by this function.
///
/// NOT supported: testlib's `_pc(k)` partial-correctness helper, which
/// exits via `PC_BASE_EXIT_CODE + k` — i.e. a plain `exit(k)` with no
/// stderr convention at all. In particular `_pc(0)` exits 0, which is
/// indistinguishable from `_ok`/`AC`. Only the standard `quitp`/`quitpi`
/// exit-7 convention is recognized as partial credit.
fn parse_points_stderr(stderr: &str) -> Option<f64> {
    let rest = stderr.trim().strip_prefix("points ")?;
    let token = rest.split_whitespace().next()?;
    let value: f64 = token.parse().ok()?;
    Some(value.clamp(0.0, 100.0))
}

/// Format a points value (0..=100) for inclusion in a human-readable
/// checker/verdict message, trimming a trailing `.0` when the value is a
/// whole number.
pub(crate) fn format_points(points: f64) -> String {
    let rounded = (points * 100.0).round() / 100.0;
    if rounded.fract() == 0.0 {
        format!("{}", rounded as i64)
    } else {
        format!("{}", rounded)
    }
}

/// Convert a testlib/Python checker exit code (+ stderr, for the partial
/// score case) into a `CheckerVerdict`.
fn exit_code_to_checker_verdict(exit_code: i32, stderr: &str) -> CheckerVerdict {
    let no_ratio = |verdict: Verdict| CheckerVerdict {
        verdict,
        partial_ratio: None,
    };
    match exit_code {
        testlib_exit_codes::OK => no_ratio(Verdict::Accepted),
        testlib_exit_codes::WRONG_ANSWER => no_ratio(Verdict::WrongAnswer),
        testlib_exit_codes::PRESENTATION_ERROR => no_ratio(Verdict::PresentationError),
        testlib_exit_codes::FAIL => no_ratio(Verdict::Fail),
        testlib_exit_codes::DIRT => no_ratio(Verdict::WrongAnswer),
        testlib_exit_codes::UNEXPECTED_EOF => no_ratio(Verdict::WrongAnswer),
        testlib_exit_codes::POINTS_EXIT_CODE => match parse_points_stderr(stderr) {
            Some(points) => {
                let ratio = (points / 100.0).clamp(0.0, 1.0);
                let verdict = if ratio >= 1.0 {
                    Verdict::Accepted
                } else if ratio > 0.0 {
                    Verdict::Partial
                } else {
                    Verdict::WrongAnswer
                };
                CheckerVerdict {
                    verdict,
                    partial_ratio: Some(ratio),
                }
            }
            None => no_ratio(Verdict::SystemError),
        },
        _ => {
            warn!("Unknown checker exit code: {}", exit_code);
            if exit_code < 0 || exit_code > 127 {
                no_ratio(Verdict::SystemError)
            } else {
                no_ratio(Verdict::WrongAnswer)
            }
        }
    }
}

/// Build the checker_message for a `POINTS_EXIT_CODE` result whose stderr
/// could not be parsed as a points value — surfaces the fixed diagnostic
/// text required by spec, plus the raw stderr (if any) for debugging.
fn unparsable_points_message(raw_message: Option<String>) -> String {
    match raw_message {
        Some(m) => format!("checker returned points without parsable value: {}", m),
        None => "checker returned points without parsable value".to_string(),
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

    let cv = exit_code_to_checker_verdict(result.exit_code(), &result.stderr);
    let raw_message: Option<String> = if result.stderr.trim().is_empty() {
        None
    } else {
        Some(result.stderr.chars().take(4096).collect())
    };
    let checker_message = if cv.verdict == Verdict::SystemError
        && result.exit_code() == testlib_exit_codes::POINTS_EXIT_CODE
    {
        Some(unparsable_points_message(raw_message))
    } else {
        raw_message
    };

    Ok(CheckerResult {
        verdict: cv.verdict,
        checker_message,
        partial_ratio: cv.partial_ratio,
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
    let (verdict, checker_message, partial_ratio) = match result.status {
        ExecutionStatus::Exited(code) => {
            let cv = exit_code_to_checker_verdict(code, &result.stderr);
            let raw_message: Option<String> = if result.stderr.trim().is_empty() {
                None
            } else {
                Some(result.stderr.chars().take(4096).collect())
            };
            let msg = if cv.verdict == Verdict::SystemError
                && code == testlib_exit_codes::POINTS_EXIT_CODE
            {
                Some(unparsable_points_message(raw_message))
            } else {
                raw_message
            };
            (cv.verdict, msg, cv.partial_ratio)
        }
        ExecutionStatus::TimeLimitExceeded => (
            Verdict::SystemError,
            Some("Python checker timed out".to_string()),
            None,
        ),
        _ => {
            let msg = if result.stderr.trim().is_empty() {
                Some("Python checker crashed".to_string())
            } else {
                Some(result.stderr.chars().take(4096).collect())
            };
            (Verdict::SystemError, msg, None)
        }
    };

    Ok(CheckerResult {
        verdict,
        checker_message,
        partial_ratio,
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

/// Interpret an interactor's exit code (+ stderr) into a final
/// `(Verdict, checker_message)` pair.
///
/// Interactive problems produce a single pass/fail result per testcase (no
/// notion of a subtask group to aggregate partial credit across), so unlike
/// `run_checker`/`run_python_checker` — whose `Partial` verdict can flow
/// through to subtask aggregation — a `POINTS_EXIT_CODE` result with
/// `0 < ratio < 1` is *always* downgraded to `WrongAnswer` here,
/// unconditionally (legacy all-or-nothing semantics), regardless of whether
/// the underlying problem has subtasks. `ratio >= 1.0` still yields
/// `Accepted` and `ratio == 0.0` still yields `WrongAnswer` as before.
fn interpret_interactor_exit(exit_code: i32, stderr: &str) -> (Verdict, Option<String>) {
    let cv = exit_code_to_checker_verdict(exit_code, stderr);
    let raw_message: Option<String> = if stderr.trim().is_empty() {
        None
    } else {
        Some(stderr.chars().take(4096).collect())
    };

    match cv.verdict {
        Verdict::Partial => {
            let points = cv.partial_ratio.unwrap_or(0.0) * 100.0;
            let note = format!(
                "partial: {} points (interactive checker — scored as WA)",
                format_points(points)
            );
            let combined = match raw_message {
                Some(m) => format!("{} | {}", note, m),
                None => note,
            };
            (Verdict::WrongAnswer, Some(combined))
        }
        Verdict::SystemError if exit_code == testlib_exit_codes::POINTS_EXIT_CODE => (
            Verdict::SystemError,
            Some(unparsable_points_message(raw_message)),
        ),
        verdict => (verdict, raw_message),
    }
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
            ExecutionStatus::SystemError => (Verdict::SystemError, None),
            ExecutionStatus::Exited(0) => {
                // User program exited normally — use interactor's verdict
                interpret_interactor_exit(outcome.interactor_exit_code, &outcome.interactor_stderr)
            }
            ExecutionStatus::Signaled(_) | ExecutionStatus::Exited(_) => {
                // User program crashed or exited non-zero.
                // If interactor already rejected (non-zero exit), use its verdict.
                // Otherwise treat as RE.
                if outcome.interactor_exit_code == 0 {
                    (Verdict::RuntimeError, None)
                } else {
                    interpret_interactor_exit(
                        outcome.interactor_exit_code,
                        &outcome.interactor_stderr,
                    )
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
    fn test_exit_code_to_checker_verdict_non_points_codes() {
        assert_eq!(
            exit_code_to_checker_verdict(0, "").verdict,
            Verdict::Accepted
        );
        assert_eq!(
            exit_code_to_checker_verdict(1, "").verdict,
            Verdict::WrongAnswer
        );
        assert_eq!(
            exit_code_to_checker_verdict(2, "").verdict,
            Verdict::PresentationError
        );
        assert_eq!(exit_code_to_checker_verdict(3, "").verdict, Verdict::Fail);
        assert_eq!(
            exit_code_to_checker_verdict(4, "").verdict,
            Verdict::WrongAnswer
        );
        assert_eq!(
            exit_code_to_checker_verdict(8, "").verdict,
            Verdict::WrongAnswer
        );
        // None of the non-points codes carry a partial_ratio.
        assert_eq!(exit_code_to_checker_verdict(0, "").partial_ratio, None);
    }

    #[test]
    fn test_parse_points_stderr_quitp_with_message() {
        assert_eq!(parse_points_stderr("points 50 partial credit"), Some(50.0));
    }

    #[test]
    fn test_parse_points_stderr_quitp_fractional_no_message() {
        assert_eq!(parse_points_stderr("points 50.5"), Some(50.5));
    }

    #[test]
    fn test_parse_points_stderr_quitpi_points_info_not_parsed() {
        assert_eq!(parse_points_stderr("points points_info=abc"), None);
        // Also verify the bare points_info form without the "points " prefix
        // (defensive — not the real testlib format, but must not crash).
        assert_eq!(parse_points_stderr("points_info=abc"), None);
    }

    #[test]
    fn test_parse_points_stderr_non_points_message() {
        assert_eq!(parse_points_stderr("wrong answer"), None);
    }

    #[test]
    fn test_parse_points_stderr_clamps_above_100() {
        assert_eq!(parse_points_stderr("points 150"), Some(100.0));
    }

    #[test]
    fn test_exit_code_to_checker_verdict_points_full_is_accepted() {
        let cv = exit_code_to_checker_verdict(7, "points 100 all good");
        assert_eq!(cv.verdict, Verdict::Accepted);
        assert_eq!(cv.partial_ratio, Some(1.0));
    }

    #[test]
    fn test_exit_code_to_checker_verdict_points_partial_is_partial() {
        let cv = exit_code_to_checker_verdict(7, "points 50 half credit");
        assert_eq!(cv.verdict, Verdict::Partial);
        assert_eq!(cv.partial_ratio, Some(0.5));
    }

    #[test]
    fn test_exit_code_to_checker_verdict_points_zero_is_wrong_answer() {
        let cv = exit_code_to_checker_verdict(7, "points 0 nothing");
        assert_eq!(cv.verdict, Verdict::WrongAnswer);
        assert_eq!(cv.partial_ratio, Some(0.0));
    }

    #[test]
    fn test_exit_code_to_checker_verdict_points_unparsable_is_system_error() {
        let cv = exit_code_to_checker_verdict(7, "points points_info=abc");
        assert_eq!(cv.verdict, Verdict::SystemError);
        assert_eq!(cv.partial_ratio, None);
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
