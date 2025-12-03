//! Trusted runner implementation
//!
//! Executes trusted programs (checkers, validators) directly without sandbox.

use anyhow::{Context, Result};
use async_trait::async_trait;
use std::path::Path;
use std::process::Stdio;
use tokio::fs;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tracing::debug;

use super::{CommandSpec, RunLimits, RunOutcome, RunStatus, Runner};

/// Runner that executes trusted code directly without sandbox
pub struct TrustedRunner {
    /// Default timeout in seconds
    default_timeout_secs: u64,
}

impl TrustedRunner {
    /// Create a new trusted runner with default timeout
    pub fn new(default_timeout_secs: u64) -> Self {
        Self {
            default_timeout_secs,
        }
    }

    /// Run a program directly
    pub async fn execute(
        &self,
        program_path: &Path,
        args: &[&str],
        stdin_content: Option<&str>,
        timeout_secs: u64,
    ) -> Result<RunOutcome> {
        debug!(
            "Running trusted program: {:?} with args: {:?}",
            program_path, args
        );

        let mut cmd = Command::new(program_path);
        cmd.args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);

        let mut child = cmd.spawn().context("Failed to spawn trusted program")?;

        // Write stdin if provided
        if let Some(input) = stdin_content {
            if let Some(mut stdin) = child.stdin.take() {
                stdin.write_all(input.as_bytes()).await?;
            }
        }

        // Wait with timeout
        let output = tokio::time::timeout(
            std::time::Duration::from_secs(timeout_secs),
            child.wait_with_output(),
        )
        .await
        .context("Trusted program execution timed out")?
        .context("Failed to wait for trusted program")?;

        let exit_code = output.status.code().unwrap_or(-1);
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        let status = if output.status.success() {
            RunStatus::Exited(0)
        } else {
            RunStatus::Exited(exit_code)
        };

        Ok(RunOutcome {
            exit_code,
            time_ms: 0, // Not measured for trusted execution
            memory_kb: 0, // Not measured for trusted execution
            stdout,
            stderr,
            status,
        })
    }

    /// Run a testlib.h checker
    /// Arguments: <input_file> <output_file> <answer_file>
    pub async fn run_checker(
        &self,
        checker_path: &Path,
        input_path: &Path,
        output_path: &Path,
        answer_path: &Path,
        timeout_secs: u64,
    ) -> Result<RunOutcome> {
        let args = [
            input_path.to_str().unwrap_or(""),
            output_path.to_str().unwrap_or(""),
            answer_path.to_str().unwrap_or(""),
        ];

        self.execute(checker_path, &args, None, timeout_secs).await
    }

    /// Run a testlib.h validator
    /// Validator reads from stdin
    pub async fn run_validator(
        &self,
        validator_path: &Path,
        input_path: &Path,
        timeout_secs: u64,
    ) -> Result<RunOutcome> {
        let input_content = fs::read_to_string(input_path)
            .await
            .context("Failed to read input file for validator")?;

        self.execute(validator_path, &[], Some(&input_content), timeout_secs)
            .await
    }
}

impl Default for TrustedRunner {
    fn default() -> Self {
        Self::new(30)
    }
}

#[async_trait]
impl Runner for TrustedRunner {
    async fn run(
        &self,
        cmd: &CommandSpec,
        _limits: &RunLimits,
        stdin: Option<&str>,
    ) -> Result<RunOutcome> {
        let args: Vec<&str> = cmd.args.iter().map(|s| s.as_str()).collect();
        self.execute(
            std::path::Path::new(&cmd.program),
            &args,
            stdin,
            self.default_timeout_secs,
        )
        .await
    }
}

/// Compile a C++ source file (for checkers/validators) without sandbox
pub async fn compile_trusted_cpp(
    source_path: &Path,
    output_path: &Path,
    include_paths: &[&Path],
) -> Result<TrustedCompileResult> {
    let mut args = vec![
        "-O2",
        "-std=c++17",
        "-o",
        output_path.to_str().unwrap_or(""),
        source_path.to_str().unwrap_or(""),
    ];

    // Add include paths
    let include_args: Vec<String> = include_paths
        .iter()
        .map(|p| format!("-I{}", p.to_str().unwrap_or("")))
        .collect();

    for arg in &include_args {
        args.push(arg);
    }

    debug!("Compiling trusted C++ with args: {:?}", args);

    let output = Command::new("g++")
        .args(&args)
        .output()
        .await
        .context("Failed to run g++ compiler")?;

    let exit_code = output.status.code().unwrap_or(-1);
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    Ok(TrustedCompileResult {
        exit_code,
        stdout,
        stderr,
        success: output.status.success(),
    })
}

/// Result of compiling a trusted program
#[derive(Debug)]
pub struct TrustedCompileResult {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub success: bool,
}


