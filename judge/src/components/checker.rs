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
use crate::engine::executer::{
    ExecutionLimits, ExecutionSpec, ExecutionStatus, InteractiveOutcome,
};
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
    // Rust's f64::parse accepts "nan"/"inf"/"-inf" tokens, but a non-finite
    // points value must never reach callers: it would flow into
    // TestcaseOutcome/TestcaseResult.partial_ratio and later
    // serde_json::to_string(&JudgeResult), which errors on non-finite
    // floats — silently dropping the judge result publish entirely. Treat
    // it the same as an unparsable value (caller maps None -> SystemError).
    if !value.is_finite() {
        return None;
    }
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
pub(crate) fn get_aoj_checker_sdk_path() -> PathBuf {
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

/// Compute the overall wall-clock timeout (seconds) for an interactive
/// execution, from the user's (already language-multiplier-adjusted) time
/// limit in milliseconds.
///
/// `= user_wall_secs + 10`, where `user_wall_secs` mirrors isolate's own
/// `--wall-time` formula (`2×TL_sec + 1`, see `IsolateBox::run`/`spawn_piped`)
/// rounded UP to the next whole second — this is an outer safety net that
/// must never expire strictly before the user box's own wall-time limit
/// does, so truncation (which could undercut a fractional TL) is not
/// acceptable here. The fixed +10s buffer covers interactor
/// startup/shutdown and pipe-draining overhead on top of that.
///
/// Applies uniformly to both the Python (host-process) and C++
/// (second-isolate-box) interactor paths. Previously each used
/// `timeout_secs.max(user_wall_secs) + 5` where `timeout_secs` was always
/// `DEFAULT_CHECKER_TIMEOUT_SECS` (30) — since `user_wall_secs` rarely
/// exceeds 30s for realistic TLs, that formula was effectively a constant
/// ~35s regardless of the problem's actual TL, which both over-waited on
/// short-TL problems (slow to surface a truly-stuck interactor) and
/// under-waited on very long-TL ones.
pub fn interactive_overall_timeout_secs(user_time_ms: u32) -> u64 {
    let user_time_ms = user_time_ms as u64;
    // ceil(2 * TL_sec) + 1
    let user_wall_secs = (2 * user_time_ms).div_ceil(1000) + 1;
    user_wall_secs + 10
}

/// Determine the final `(Verdict, checker_message)` for a completed
/// interactive execution (`InteractiveOutcome`) — shared by the Python
/// (host-process) and C++ (second-isolate-box) interactor paths, since both
/// `execute_interactive`/`execute_interactive_cpp` funnel into the same
/// `InteractiveOutcome` shape.
///
/// Priority order (user execution issues take priority over the
/// interactor's opinion — an interactor reading from a program that just
/// got killed can produce a misleading verdict of its own):
/// 1. Overall wall-clock timeout (neither side finished within
///    `interactive_overall_timeout_secs`) -> `SystemError`.
/// 2. `TimeLimitExceeded` / `MemoryLimitExceeded` / `SystemError` -> passed
///    through directly.
/// 3. `Signaled(25)` (SIGXFSZ, from `RUN_FSIZE_KB`) -> `OutputLimitExceeded`
///    — P3-10 parity: the non-interactive path
///    (`run_single_testcase`/`ExecutionStatus::Signaled(25)` match arm in
///    judger.rs) already classifies this; the interactive path previously
///    fell through to the generic `Signaled(_)` -> RuntimeError arm below,
///    an unintended asymmetry between the two execution paths for the same
///    underlying isolate kill.
/// 4. `Exited(0)` -> defer entirely to the interactor's own verdict via
///    `interpret_interactor_exit` (testlib exit code mapping, `POINTS_EXIT_CODE`
///    partial credit downgraded to WA per P3-8's all-or-nothing interactive
///    semantics — see that function's doc comment).
/// 5. Any other crash/nonzero exit -> `RuntimeError`, UNLESS the interactor
///    already rejected (its own exit code is nonzero), in which case its
///    verdict wins — it likely diagnoses *why* (e.g. malformed output that
///    also crashed the user program mid-protocol). Note that a nonzero
///    `interactor_exit_code` here is not always a genuine testlib rejection:
///    both execution paths use `-1` as a placeholder for "the interactor
///    itself never produced a real exit code" (Python: killed by signal,
///    `.code().unwrap_or(-1)`; C++: box B's meta `status` was `TimeOut` /
///    `Signal` / `InternalError` rather than `Ok`/`RuntimeError` — see
///    `execute_interactive_cpp`'s `interactor_exit_code` derivation). `-1`
///    still routes through `interpret_interactor_exit` below like any other
///    nonzero code, but `exit_code_to_checker_verdict`'s `exit_code < 0`
///    catch-all resolves it to `SystemError`, not a real WA/PE/etc.
///    diagnosis — so "its verdict wins" above should be read as "its
///    verdict (possibly just SystemError-via-unknown-code) wins", not as
///    proof the interactor actually inspected and rejected the output.
fn interpret_interactive_outcome(outcome: &InteractiveOutcome) -> (Verdict, Option<String>) {
    if outcome.timed_out {
        return (
            Verdict::SystemError,
            Some("Interactive execution timed out".to_string()),
        );
    }
    match outcome.user_status {
        ExecutionStatus::TimeLimitExceeded => (Verdict::TimeLimitExceeded, None),
        ExecutionStatus::MemoryLimitExceeded => (Verdict::MemoryLimitExceeded, None),
        ExecutionStatus::SystemError => (Verdict::SystemError, None),
        ExecutionStatus::Signaled(25) => (Verdict::OutputLimitExceeded, None),
        ExecutionStatus::Exited(0) => {
            interpret_interactor_exit(outcome.interactor_exit_code, &outcome.interactor_stderr)
        }
        ExecutionStatus::Signaled(_) | ExecutionStatus::Exited(_) => {
            // User program crashed or exited non-zero.
            // If interactor already rejected (non-zero exit), use its verdict.
            // Otherwise treat as RE.
            if outcome.interactor_exit_code == 0 {
                (Verdict::RuntimeError, None)
            } else {
                interpret_interactor_exit(outcome.interactor_exit_code, &outcome.interactor_stderr)
            }
        }
    }
}

/// Run an interactive Python checker (interactor) alongside a user program.
///
/// The user program runs in sandbox with piped I/O.
/// The interactor runs as a trusted subprocess, communicating with the user via pipes.
///
/// **JUDGER-ONLY — DO NOT call this for non-admin-authored interactors.**
/// This function executes `checker_source` as a **trusted host subprocess**,
/// with no isolate sandbox around it at all — it runs directly in the
/// privileged judge container. That trust model only holds for the main
/// judger (`jobs/judger.rs`'s `ProblemType::Interactive` path), where the
/// interactor is problem-author content and only admins can author problems.
/// It does **not** hold for 창작마당/workshop invocations
/// (`jobs/workshop/invoke.rs`), where any logged-in user (bounded only by
/// `workshopQuota`, default 5) can author and run an interactor — calling
/// this here would let an ordinary user execute arbitrary Python on the
/// judge host (RCE). Workshop's Python interactor arm must use
/// `run_python_interactor_sandboxed` instead, which runs the interactor in
/// its own second isolate box exactly like `run_cpp_interactor` already does
/// for the C++ interactor arm.
pub async fn run_interactive_checker(
    checker_source: &str,
    input_content: &str,
    user_work_dir: &Path,
    user_command: &[String],
    user_limits: &ExecutionLimits,
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

    // Build user execution spec. fsize is tightened to RUN_FSIZE_KB, same as
    // judger's non-interactive run_single_testcase — the pipes connecting
    // user stdout to the interactor are unaffected by RLIMIT_FSIZE (that
    // only bounds files the sandboxed process writes on disk inside the
    // box), so this only guards against a user program flooding box-local
    // file writes, not the interactive stdout stream itself.
    let user_spec = crate::engine::executer::ExecutionSpec::new(user_work_dir)
        .with_command(user_command.iter().map(|s| s.as_str()))
        .with_limits(user_limits.clone())
        .with_env_vars(env_vars.to_vec())
        .with_fsize(crate::engine::executer::RUN_FSIZE_KB);

    let overall_timeout = interactive_overall_timeout_secs(user_limits.time_ms);

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

    let (verdict, checker_message) = interpret_interactive_outcome(&outcome);

    Ok(InteractiveCheckerResult {
        verdict,
        user_time_ms: outcome.user_time_ms,
        user_memory_kb: outcome.user_memory_kb,
        checker_message,
    })
}

/// Run a compiled C++ testlib interactor (`registerInteraction`) alongside a
/// user program.
///
/// Unlike the Python interactor (`run_interactive_checker`, a trusted host
/// subprocess), the C++ interactor is untrusted user-problem-authored code
/// and runs in its own **second isolate sandbox box** — see
/// `engine::executer::execute_interactive_cpp` for the two-box, cross-piped
/// execution.
///
/// Box staging is flat (`IsolateBox::copy_dir_in` is non-recursive): the
/// interactor binary and `input.txt` are copied side by side into one temp
/// dir, invoked as `./interactor input.txt output.txt` — the standard
/// testlib interactor argv convention (`output.txt` is a box-local path the
/// interactor may use for scratch output; `registerInteraction` does not
/// require it to be read back by anything outside the box).
pub async fn run_cpp_interactor(
    interactor_binary: &Path,
    input_content: &str,
    user_work_dir: &Path,
    user_command: &[String],
    user_limits: &ExecutionLimits,
    env_vars: &[(String, String)],
) -> Result<InteractiveCheckerResult> {
    info!("Running C++ interactor");

    let temp_dir = tempfile::tempdir()?;
    let work_dir = temp_dir.path();

    tokio::fs::copy(interactor_binary, work_dir.join("interactor"))
        .await
        .context("Failed to stage interactor binary")?;
    tokio::fs::write(work_dir.join("input.txt"), input_content).await?;

    let interactor_command = vec![
        "./interactor".to_string(),
        "input.txt".to_string(),
        "output.txt".to_string(),
    ];

    // Interactor box (isolate box B)'s OWN `time_ms`/`--wall-time` cap —
    // NOT the timeout that actually enforces the interaction's deadline in
    // practice. `overall_timeout` below (`interactive_overall_timeout_secs`,
    // derived from the user's TL) always fires strictly before box B's own
    // wall-time (`2×time_ms+1`, isolate's own formula) for every TL: even at
    // TL=1000ms, box B's `time_ms` floors at `max(2000, 10_000)=10_000ms` ->
    // its own wall-time is `21s`, while `overall_timeout` is `13s`. So this
    // is a defensive, redundant secondary cap (belt-and-suspenders against
    // isolate itself somehow outliving the outer `tokio::time::timeout` —
    // it should never be the thing that actually fires), not the real
    // deadline. memory 1024MB per spec; fsize keeps the 262144KB (256MB)
    // default since this is not a user execution (RUN_FSIZE_KB only applies
    // to the user's own box).
    let interactor_limits = ExecutionLimits {
        time_ms: (user_limits.time_ms.saturating_mul(2)).max(10_000),
        memory_mb: 1024,
    };

    let user_spec = crate::engine::executer::ExecutionSpec::new(user_work_dir)
        .with_command(user_command.iter().map(|s| s.as_str()))
        .with_limits(user_limits.clone())
        .with_env_vars(env_vars.to_vec())
        .with_fsize(crate::engine::executer::RUN_FSIZE_KB);

    let overall_timeout = interactive_overall_timeout_secs(user_limits.time_ms);

    let outcome = crate::engine::executer::execute_interactive_cpp(
        &user_spec,
        work_dir,
        &interactor_command,
        &interactor_limits,
        overall_timeout,
    )
    .await
    .context("Failed to run C++ interactor")?;

    debug!(
        "C++ interactor result: user_status={:?}, user_time={}ms, user_mem={}kb, \
         interactor_exit={}, timed_out={}",
        outcome.user_status,
        outcome.user_time_ms,
        outcome.user_memory_kb,
        outcome.interactor_exit_code,
        outcome.timed_out,
    );

    let (verdict, checker_message) = interpret_interactive_outcome(&outcome);

    Ok(InteractiveCheckerResult {
        verdict,
        user_time_ms: outcome.user_time_ms,
        user_memory_kb: outcome.user_memory_kb,
        checker_message,
    })
}

/// Run a Python interactor (`aoj_checker.py`'s `Interactive` class)
/// alongside a user program, with the interactor itself sandboxed in a
/// **second isolate box** — the workshop/창작마당 counterpart to
/// `run_cpp_interactor`.
///
/// Why this exists as a separate function from `run_interactive_checker`
/// (rather than that function taking a "sandboxed?" flag): `run_interactive_checker`
/// is judger-only and its interactor runs as a trusted bare
/// `tokio::process::Command` on the host — see its doc comment. Workshop
/// invocations (`jobs/workshop/invoke.rs`) let any logged-in user (bounded
/// only by `workshopQuota`, default 5) author and run a Python interactor,
/// so that trust model does not hold there: an ordinary user's interactor
/// source must never execute unsandboxed on the privileged judge host (that
/// would be host-level RCE). This function instead funnels the interactor
/// through `engine::executer::execute_interactive_cpp` — the same two-box,
/// cross-piped machinery `run_cpp_interactor` uses for the C++ interactor
/// arm — so a malicious/buggy Python interactor is just as contained as a
/// malicious/buggy C++ one.
///
/// Box staging is flat (`IsolateBox::copy_dir_in` is non-recursive, same
/// constraint `run_cpp_interactor` documents): `checker.py`, the
/// `aoj_checker.py` SDK, and `input.txt` are copied side by side into one
/// temp dir. The interactor is invoked as `python3 -W ignore checker.py
/// input.txt` — filenames relative to the box's work dir (matching the flat
/// staging), the same `python3 -W ignore <script>` interpreter invocation
/// `run_python_checker`/`run_interactive_checker` use elsewhere, and the
/// `checker.py <input_file>` argv convention `aoj_checker.Interactive.__init__`
/// requires (see `files/aoj_checker.py`). `python3` resolves inside the box
/// via isolate's `--dir=/usr` mount + `/usr/bin/` command-prepending
/// (`IsolateBox::spawn_piped`) — the same mechanism that already runs every
/// Python *solution* submission sandboxed, so no new mount/env plumbing is
/// needed here.
///
/// Box B's limits mirror `run_cpp_interactor`'s exactly: `time_ms =
/// max(user_TL×2, 10_000)` ms (a defensive secondary cap — the real deadline
/// is `overall_timeout_secs` below, see `run_cpp_interactor`'s doc comment),
/// `memory_mb = 1024`, stack sized to match memory
/// (`execute_interactive_cpp`'s `sandbox_memory_mb_b * 1024`), fsize at
/// isolate's default (not a user execution, so not tightened to
/// `RUN_FSIZE_KB`).
/// The box-relative argv used to invoke a flat-staged Python interactor:
/// `python3 -W ignore checker.py input.txt`. Pulled out as a pure function
/// (no I/O) so the staging/command-construction contract is unit-testable
/// without spinning up isolate — see `run_python_interactor_sandboxed`'s doc
/// comment for why these are box-relative filenames rather than host paths,
/// and why this matches `aoj_checker.Interactive.__init__`'s
/// `checker.py <input_file>` argv convention.
fn python_interactor_argv() -> Vec<String> {
    vec![
        "python3".to_string(),
        "-W".to_string(),
        "ignore".to_string(),
        "checker.py".to_string(),
        "input.txt".to_string(),
    ]
}

/// Box B (interactor box)'s own `ExecutionLimits`, derived from the user's
/// (already language-multiplier-adjusted) time limit: `time_ms =
/// max(user_time_ms×2, 10_000)`, `memory_mb = 1024` — identical formula to
/// `run_cpp_interactor`'s inline construction. Pulled out as a pure function
/// purely for unit testability; kept as a private duplicate rather than a
/// shared helper both call, consistent with this module's existing choice
/// to keep the C++ and Python interactor arms self-contained (see
/// `run_python_interactor_sandboxed`'s doc comment).
fn python_interactor_box_limits(user_time_ms: u32) -> ExecutionLimits {
    ExecutionLimits {
        time_ms: (user_time_ms.saturating_mul(2)).max(10_000),
        memory_mb: 1024,
    }
}

pub async fn run_python_interactor_sandboxed(
    checker_source: &str,
    input_content: &str,
    user_work_dir: &Path,
    user_command: &[String],
    user_limits: &ExecutionLimits,
    env_vars: &[(String, String)],
) -> Result<InteractiveCheckerResult> {
    info!("Running Python interactor (sandboxed, second isolate box)");

    let temp_dir = tempfile::tempdir()?;
    let work_dir = temp_dir.path();

    let sdk_path = get_aoj_checker_sdk_path();
    tokio::fs::copy(&sdk_path, work_dir.join("aoj_checker.py"))
        .await
        .context("Failed to stage aoj_checker.py SDK")?;
    tokio::fs::write(work_dir.join("checker.py"), checker_source).await?;
    tokio::fs::write(work_dir.join("input.txt"), input_content).await?;

    let interactor_command = python_interactor_argv();
    let interactor_limits = python_interactor_box_limits(user_limits.time_ms);

    let user_spec = crate::engine::executer::ExecutionSpec::new(user_work_dir)
        .with_command(user_command.iter().map(|s| s.as_str()))
        .with_limits(user_limits.clone())
        .with_env_vars(env_vars.to_vec())
        .with_fsize(crate::engine::executer::RUN_FSIZE_KB);

    let overall_timeout = interactive_overall_timeout_secs(user_limits.time_ms);

    let outcome = crate::engine::executer::execute_interactive_cpp(
        &user_spec,
        work_dir,
        &interactor_command,
        &interactor_limits,
        overall_timeout,
    )
    .await
    .context("Failed to run sandboxed Python interactor")?;

    debug!(
        "Sandboxed Python interactor result: user_status={:?}, user_time={}ms, user_mem={}kb, \
         interactor_exit={}, timed_out={}",
        outcome.user_status,
        outcome.user_time_ms,
        outcome.user_memory_kb,
        outcome.interactor_exit_code,
        outcome.timed_out,
    );

    let (verdict, checker_message) = interpret_interactive_outcome(&outcome);

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
    fn test_parse_points_stderr_rejects_nan() {
        // "nan" parses as f64 successfully but must not survive here: a
        // non-finite partial_ratio would later fail
        // serde_json::to_string(&JudgeResult), silently dropping the
        // published judge result.
        assert_eq!(parse_points_stderr("points nan"), None);
    }

    #[test]
    fn test_parse_points_stderr_rejects_infinity() {
        assert_eq!(parse_points_stderr("points inf"), None);
        assert_eq!(parse_points_stderr("points -inf"), None);
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

    // --- interactive_overall_timeout_secs (P3-11 Task 2) ---
    //
    // = user_wall_secs (isolate's own `--wall-time` formula: 2×TL_sec + 1)
    // + a fixed 10s buffer. Replaces the old
    // `timeout_secs.max(user_wall_secs) + 5` formula, which — since
    // `timeout_secs` was always `DEFAULT_CHECKER_TIMEOUT_SECS` (30) — was
    // effectively a constant ~35s regardless of the problem's actual TL.

    #[test]
    fn test_interactive_overall_timeout_secs_tl_1000ms() {
        assert_eq!(interactive_overall_timeout_secs(1000), 13);
    }

    #[test]
    fn test_interactive_overall_timeout_secs_tl_5000ms() {
        assert_eq!(interactive_overall_timeout_secs(5000), 21);
    }

    #[test]
    fn test_interactive_overall_timeout_secs_rounds_up_fractional_seconds() {
        // TL=1200ms -> isolate wall = 2*1.2+1 = 3.4s; this is an outer safety
        // timeout, so it must round UP (never truncate below the isolate
        // wall-time it is meant to comfortably exceed).
        assert_eq!(interactive_overall_timeout_secs(1200), 3 + 1 + 10);
    }

    // --- interpret_interactive_outcome: user Signaled(25) -> OLE (P3-10 parity) ---

    fn outcome_with_user_status(status: ExecutionStatus) -> InteractiveOutcome {
        InteractiveOutcome {
            user_status: status,
            user_time_ms: 0,
            user_memory_kb: 0,
            interactor_exit_code: 0,
            interactor_stderr: String::new(),
            timed_out: false,
        }
    }

    #[test]
    fn test_interpret_interactive_outcome_user_signaled_25_is_output_limit_exceeded() {
        let outcome = outcome_with_user_status(ExecutionStatus::Signaled(25));
        let (verdict, _) = interpret_interactive_outcome(&outcome);
        assert_eq!(verdict, Verdict::OutputLimitExceeded);
    }

    #[test]
    fn test_interpret_interactive_outcome_user_signaled_other_is_runtime_error_when_interactor_ok()
    {
        let outcome = outcome_with_user_status(ExecutionStatus::Signaled(11));
        let (verdict, _) = interpret_interactive_outcome(&outcome);
        assert_eq!(verdict, Verdict::RuntimeError);
    }

    #[test]
    fn test_interpret_interactive_outcome_timed_out_is_system_error() {
        let mut outcome = outcome_with_user_status(ExecutionStatus::Exited(0));
        outcome.timed_out = true;
        let (verdict, msg) = interpret_interactive_outcome(&outcome);
        assert_eq!(verdict, Verdict::SystemError);
        assert!(msg.unwrap().contains("timed out"));
    }

    #[test]
    fn test_interpret_interactive_outcome_user_ok_defers_to_interactor_exit_code() {
        let mut outcome = outcome_with_user_status(ExecutionStatus::Exited(0));
        outcome.interactor_exit_code = 1; // testlib _wa
        let (verdict, _) = interpret_interactive_outcome(&outcome);
        assert_eq!(verdict, Verdict::WrongAnswer);
    }

    // --- run_python_interactor_sandboxed's pure helpers (workshop security
    // fix): staging/command construction, tested without isolate. ---

    #[test]
    fn test_python_interactor_argv_matches_sdk_convention() {
        // Must match aoj_checker.Interactive.__init__'s `checker.py
        // <input_file>` argv convention (files/aoj_checker.py) — box-relative
        // filenames, since IsolateBox::copy_dir_in flat-stages by basename.
        assert_eq!(
            python_interactor_argv(),
            vec!["python3", "-W", "ignore", "checker.py", "input.txt"]
        );
    }

    #[test]
    fn test_python_interactor_box_limits_floors_at_10s() {
        // Short TL (e.g. 1000ms user TL -> 2000ms) still floors to 10_000ms,
        // matching run_cpp_interactor's identical formula.
        let limits = python_interactor_box_limits(1000);
        assert_eq!(limits.time_ms, 10_000);
        assert_eq!(limits.memory_mb, 1024);
    }

    #[test]
    fn test_python_interactor_box_limits_scales_with_long_tl() {
        // Long TL (6000ms) exceeds the 10s floor: 2*6000 = 12_000ms.
        let limits = python_interactor_box_limits(6000);
        assert_eq!(limits.time_ms, 12_000);
        assert_eq!(limits.memory_mb, 1024);
    }

    #[tokio::test]
    async fn test_python_interactor_staging_writes_expected_files() {
        // Mirrors the staging block in run_python_interactor_sandboxed
        // without invoking isolate: checker.py + aoj_checker.py SDK +
        // input.txt must land flat (no subdirectories — copy_dir_in doesn't
        // recurse) with the expected content.
        let temp_dir = tempfile::tempdir().unwrap();
        let work_dir = temp_dir.path();

        let checker_source = "from aoj_checker import Interactive\n";
        let input_content = "42\n";

        let sdk_path = get_aoj_checker_sdk_path();
        tokio::fs::copy(&sdk_path, work_dir.join("aoj_checker.py"))
            .await
            .unwrap();
        tokio::fs::write(work_dir.join("checker.py"), checker_source)
            .await
            .unwrap();
        tokio::fs::write(work_dir.join("input.txt"), input_content)
            .await
            .unwrap();

        let checker_written = tokio::fs::read_to_string(work_dir.join("checker.py"))
            .await
            .unwrap();
        assert_eq!(checker_written, checker_source);

        let input_written = tokio::fs::read_to_string(work_dir.join("input.txt"))
            .await
            .unwrap();
        assert_eq!(input_written, input_content);

        let sdk_written = tokio::fs::read_to_string(work_dir.join("aoj_checker.py"))
            .await
            .unwrap();
        assert!(sdk_written.contains("class Interactive"));

        // All three files are direct children of work_dir (flat), not nested
        // in a subdirectory.
        let mut entries = tokio::fs::read_dir(work_dir).await.unwrap();
        let mut names = Vec::new();
        while let Some(e) = entries.next_entry().await.unwrap() {
            assert!(e.metadata().await.unwrap().is_file());
            names.push(e.file_name().to_string_lossy().to_string());
        }
        names.sort();
        assert_eq!(names, vec!["aoj_checker.py", "checker.py", "input.txt"]);
    }

    #[test]
    fn test_interpret_interactive_outcome_interactor_points_partial_downgraded_to_wa() {
        // P3-8 rule: interactive problems have no subtask aggregation, so a
        // POINTS_EXIT_CODE (7) partial result is always downgraded to WA.
        let mut outcome = outcome_with_user_status(ExecutionStatus::Exited(0));
        outcome.interactor_exit_code = 7;
        outcome.interactor_stderr = "points 50 half credit".to_string();
        let (verdict, msg) = interpret_interactive_outcome(&outcome);
        assert_eq!(verdict, Verdict::WrongAnswer);
        assert!(msg.unwrap().contains("50"));
    }
}
