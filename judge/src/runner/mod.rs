//! Runner module - Execution abstraction layer
//!
//! This module provides a unified interface for running programs:
//! - `SandboxedRunner`: For untrusted user code (uses isolate sandbox)
//! - `TrustedRunner`: For trusted programs like checkers/validators (direct execution)
//!
//! The runner module does NOT:
//! - Compare outputs or determine verdicts
//! - Cache compiled binaries
//! - Know about problem-specific logic

pub mod sandboxed;
pub mod trusted;

use anyhow::Result;
use async_trait::async_trait;
use std::path::Path;

/// Command specification for execution
#[derive(Debug, Clone)]
pub struct CommandSpec {
    /// Program path or name
    pub program: String,
    /// Arguments to the program
    pub args: Vec<String>,
    /// Environment variables (key=value)
    pub env: Vec<String>,
    /// Working directory
    pub work_dir: Option<std::path::PathBuf>,
}

impl CommandSpec {
    pub fn new(program: impl Into<String>) -> Self {
        Self {
            program: program.into(),
            args: Vec::new(),
            env: Vec::new(),
            work_dir: None,
        }
    }

    pub fn with_args(mut self, args: impl IntoIterator<Item = impl Into<String>>) -> Self {
        self.args = args.into_iter().map(|a| a.into()).collect();
        self
    }

    pub fn with_env(mut self, env: impl IntoIterator<Item = impl Into<String>>) -> Self {
        self.env = env.into_iter().map(|e| e.into()).collect();
        self
    }

    pub fn with_work_dir(mut self, dir: impl AsRef<Path>) -> Self {
        self.work_dir = Some(dir.as_ref().to_path_buf());
        self
    }

    /// Create from a command vector (first element is program, rest are args)
    pub fn from_vec(cmd: &[String]) -> Self {
        let mut iter = cmd.iter();
        let program = iter.next().map(|s| s.clone()).unwrap_or_default();
        let args: Vec<String> = iter.cloned().collect();
        Self {
            program,
            args,
            env: Vec::new(),
            work_dir: None,
        }
    }

    /// Convert to a vector of strings (program + args)
    pub fn to_vec(&self) -> Vec<String> {
        let mut v = vec![self.program.clone()];
        v.extend(self.args.clone());
        v
    }
}

/// Resource limits for execution
#[derive(Debug, Clone)]
pub struct RunLimits {
    /// Time limit in milliseconds
    pub time_ms: u32,
    /// Memory limit in MB
    pub memory_mb: u32,
}

impl RunLimits {
    pub fn new(time_ms: u32, memory_mb: u32) -> Self {
        Self { time_ms, memory_mb }
    }
}

impl Default for RunLimits {
    fn default() -> Self {
        Self {
            time_ms: 1000,
            memory_mb: 256,
        }
    }
}

/// Execution status (raw, no verdict interpretation)
#[derive(Debug, Clone, PartialEq)]
pub enum RunStatus {
    /// Program exited normally with given exit code
    Exited(i32),
    /// Time limit exceeded
    TimeLimitExceeded,
    /// Memory limit exceeded
    MemoryLimitExceeded,
    /// Killed by signal
    Signaled(i32),
    /// Runtime error (crash, etc.)
    RuntimeError,
    /// System/internal error
    SystemError,
}

impl RunStatus {
    /// Check if execution was successful (exited with code 0)
    pub fn is_success(&self) -> bool {
        matches!(self, RunStatus::Exited(0))
    }
}

/// Outcome of running a program
#[derive(Debug)]
pub struct RunOutcome {
    /// Exit code (0 if not applicable)
    pub exit_code: i32,
    /// CPU time used in milliseconds
    pub time_ms: u32,
    /// Memory used in KB
    pub memory_kb: u32,
    /// Stdout content
    pub stdout: String,
    /// Stderr content
    pub stderr: String,
    /// Execution status
    pub status: RunStatus,
}

impl RunOutcome {
    /// Check if execution was successful
    pub fn is_success(&self) -> bool {
        self.status.is_success()
    }
}

/// Runner trait for executing programs
#[async_trait]
pub trait Runner: Send + Sync {
    /// Run a command with the given limits and optional stdin
    async fn run(
        &self,
        cmd: &CommandSpec,
        limits: &RunLimits,
        stdin: Option<&str>,
    ) -> Result<RunOutcome>;
}

// Re-exports
pub use sandboxed::SandboxedRunner;
pub use trusted::TrustedRunner;


