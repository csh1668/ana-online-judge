//! Sandboxed runner implementation using isolate
//!
//! Executes untrusted user code in an isolated environment with resource limits.

use anyhow::Result;
use async_trait::async_trait;
use std::path::Path;
use tokio::fs;

use super::{CommandSpec, RunLimits, RunOutcome, RunStatus, Runner};
use crate::sandbox::{is_cgroups_available, IoSpec, IsolateBox, IsolateStatus, Limits};

/// Runner that executes code in isolate sandbox
pub struct SandboxedRunner {
    /// Box ID for this runner
    box_id: u32,
    /// Directory containing compiled program and supporting files
    work_dir: std::path::PathBuf,
}

impl SandboxedRunner {
    /// Create a new sandboxed runner
    pub fn new(box_id: u32, work_dir: impl AsRef<Path>) -> Self {
        Self {
            box_id,
            work_dir: work_dir.as_ref().to_path_buf(),
        }
    }

    /// Run a command in the sandbox
    pub async fn execute(
        &self,
        cmd: &CommandSpec,
        limits: &RunLimits,
        stdin_content: Option<&str>,
    ) -> Result<RunOutcome> {
        let use_cgroups = if is_cgroups_available().await {
            true
        } else {
            anyhow::bail!("Cgroup support is required for sandboxed execution");
        };

        // Initialize isolate box
        let isolate_box = IsolateBox::new(self.box_id, use_cgroups).await?;

        // Copy all files from work_dir to box
        isolate_box.copy_dir_in(&self.work_dir).await?;

        // Prepare stdin if provided
        let stdin_path = if let Some(content) = stdin_content {
            let temp_file = tempfile::NamedTempFile::new()?;
            fs::write(temp_file.path(), content).await?;
            Some(temp_file)
        } else {
            None
        };

        // Build IO spec
        let mut io = IoSpec::new().with_stderr_to_stdout(true);
        if let Some(ref temp_file) = stdin_path {
            io = io.with_stdin(temp_file.path());
        }

        // Build limits
        let sandbox_limits = Limits {
            time_ms: limits.time_ms,
            memory_mb: limits.memory_mb,
            processes: 64,
            open_files: 256,
            fsize_kb: 262144,
        };

        // Run command
        let command = cmd.to_vec();
        let outcome = isolate_box.run(&command, &sandbox_limits, &io).await?;

        // Cleanup
        isolate_box.cleanup().await?;

        // Convert to RunOutcome
        let memory_limit_kb = limits.memory_mb * 1024;
        let status = match outcome.meta.status {
            IsolateStatus::Ok if outcome.meta.exit_code == 0 => {
                if outcome.meta.memory_kb > memory_limit_kb {
                    RunStatus::MemoryLimitExceeded
                } else {
                    RunStatus::Exited(0)
                }
            }
            IsolateStatus::Ok => RunStatus::Exited(outcome.meta.exit_code),
            IsolateStatus::TimeOut => RunStatus::TimeLimitExceeded,
            IsolateStatus::Signal(sig) => RunStatus::Signaled(sig),
            IsolateStatus::RuntimeError => RunStatus::RuntimeError,
            IsolateStatus::InternalError => RunStatus::SystemError,
        };

        // Check MLE for other statuses too
        let status = if outcome.meta.memory_kb > memory_limit_kb
            && !matches!(status, RunStatus::MemoryLimitExceeded)
        {
            RunStatus::MemoryLimitExceeded
        } else {
            status
        };

        Ok(RunOutcome {
            exit_code: outcome.meta.exit_code,
            time_ms: outcome.meta.time_ms,
            memory_kb: outcome.meta.memory_kb,
            stdout: outcome.stdout,
            stderr: outcome.stderr,
            status,
        })
    }
}

#[async_trait]
impl Runner for SandboxedRunner {
    async fn run(
        &self,
        cmd: &CommandSpec,
        limits: &RunLimits,
        stdin: Option<&str>,
    ) -> Result<RunOutcome> {
        self.execute(cmd, limits, stdin).await
    }
}
