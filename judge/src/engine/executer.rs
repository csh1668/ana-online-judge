use crate::engine::sandbox::{
    self, is_cgroups_available, IoSpec, IsolateBox, IsolateStatus, Limits,
};
use std::sync::atomic::{AtomicU32, Ordering};
use tokio::fs;

/// Global counter for box ID allocation within worker's range
static BOX_ID_COUNTER: AtomicU32 = AtomicU32::new(0);

/// Get next box ID for isolate sandbox using worker-aware allocation
/// Each worker (0-9) gets a dedicated range of 1000 box IDs to prevent collisions
pub fn next_box_id() -> u32 {
    let counter = BOX_ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    // calculate_box_id(counter, 0)
    let config = sandbox::get_config();
    let box_id = config.worker_id * 1000 + (counter % 1000);

    box_id
}

#[derive(Debug, Clone, PartialEq)]
pub enum ExecutionStatus {
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

#[derive(Debug)]
pub struct ExecutionOutcome {
    /// Execution status
    pub status: ExecutionStatus,
    /// CPU time used in milliseconds
    pub time_ms: u32,
    /// Memory used in KB
    pub memory_kb: u32,
    /// Stdout content (as string, may have UTF-8 conversion losses)
    pub stdout: String,
    /// Stdout content (as raw bytes, preserves binary data)
    pub stdout_bytes: Vec<u8>,
    /// Stderr content
    pub stderr: String,
}

impl ExecutionOutcome {
    pub fn is_success(&self) -> bool {
        matches!(self.status, ExecutionStatus::Exited(0))
    }

    /// Get exit code from status (0 if not applicable)
    pub fn exit_code(&self) -> i32 {
        match self.status {
            ExecutionStatus::Exited(code) => code,
            _ => -1,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ExecutionLimits {
    /// Time limit in milliseconds
    pub time_ms: u32,
    /// Memory limit in MB
    pub memory_mb: u32,
}

impl Default for ExecutionLimits {
    fn default() -> Self {
        Self {
            time_ms: 1000,
            memory_mb: 512,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ExecutionSpec {
    pub work_dir: std::path::PathBuf,
    pub command: Vec<String>,
    pub limits: ExecutionLimits,
    pub stdin: Option<String>,
    /// Directory to copy output files to after sandboxed execution
    pub copy_out_dir: Option<std::path::PathBuf>,
}

impl ExecutionSpec {
    pub fn new(work_dir: impl Into<std::path::PathBuf>) -> Self {
        Self {
            work_dir: work_dir.into(),
            command: vec![],
            limits: ExecutionLimits::default(),
            stdin: None,
            copy_out_dir: None,
        }
    }
    pub fn with_command(mut self, command: impl IntoIterator<Item = impl Into<String>>) -> Self {
        self.command = command.into_iter().map(Into::into).collect();
        self
    }
    pub fn with_limits(mut self, limits: ExecutionLimits) -> Self {
        self.limits = limits;
        self
    }

    pub fn with_stdin(mut self, stdin: impl Into<String>) -> Self {
        self.stdin = Some(stdin.into());
        self
    }

    pub fn with_copy_out_dir(mut self, dir: impl Into<std::path::PathBuf>) -> Self {
        self.copy_out_dir = Some(dir.into());
        self
    }
}

pub async fn execute_sandboxed(spec: &ExecutionSpec) -> anyhow::Result<ExecutionOutcome> {
    if spec.command.is_empty() {
        return Err(anyhow::anyhow!("No command specified for execution"));
    }

    // Check cgroups availability
    if !is_cgroups_available().await {
        anyhow::bail!("Cgroup support is required for sandboxed execution");
    }

    // Initialize isolate box with auto-assigned box_id
    let box_id = next_box_id();
    let isolate_box = IsolateBox::new(box_id, true).await?;

    // Copy all files from work_dir to box
    isolate_box.copy_dir_in(&spec.work_dir).await?;

    // Prepare stdin if provided
    let stdin_path = if let Some(content) = &spec.stdin {
        let temp_file = tempfile::NamedTempFile::new()?;
        fs::write(temp_file.path(), content).await?;
        Some(temp_file)
    } else {
        None
    };

    // Build IO spec
    let mut io = IoSpec::new();
    if let Some(ref temp_file) = stdin_path {
        io = io.with_stdin(temp_file.path());
    }

    // Build sandbox limits
    let sandbox_limits = Limits {
        time_ms: spec.limits.time_ms,
        memory_mb: spec.limits.memory_mb,
        processes: 64,
        open_files: 256,
        fsize_kb: 262144,
    };

    // Run command in sandbox
    let outcome = isolate_box.run(&spec.command, &sandbox_limits, &io).await?;

    // Copy output files if copy_out_dir is specified
    if let Some(ref copy_out_dir) = spec.copy_out_dir {
        let box_work_dir = isolate_box.work_dir();
        let mut entries = fs::read_dir(&box_work_dir).await?;
        while let Some(entry) = entries.next_entry().await? {
            let metadata = entry.metadata().await?;
            if metadata.is_dir() {
                continue;
            }
            let file_name = entry.file_name();
            let dest = copy_out_dir.join(&file_name);
            fs::copy(entry.path(), &dest).await?;
        }
    }

    // Cleanup isolate box
    isolate_box.cleanup().await?;

    // Convert IsolateStatus to ExecutionStatus
    let memory_limit_kb = spec.limits.memory_mb * 1024;
    let status = match outcome.meta.status {
        IsolateStatus::Ok if outcome.meta.exit_code == 0 => {
            if outcome.meta.memory_kb > memory_limit_kb {
                ExecutionStatus::MemoryLimitExceeded
            } else {
                ExecutionStatus::Exited(0)
            }
        }
        IsolateStatus::Ok => ExecutionStatus::Exited(outcome.meta.exit_code),
        IsolateStatus::TimeOut => ExecutionStatus::TimeLimitExceeded,
        IsolateStatus::Signal(sig) => ExecutionStatus::Signaled(sig),
        IsolateStatus::RuntimeError => ExecutionStatus::RuntimeError,
        IsolateStatus::InternalError => ExecutionStatus::SystemError,
    };

    // Check MLE for other statuses too
    let status = if outcome.meta.memory_kb > memory_limit_kb
        && !matches!(status, ExecutionStatus::MemoryLimitExceeded)
    {
        ExecutionStatus::MemoryLimitExceeded
    } else {
        status
    };

    Ok(ExecutionOutcome {
        status,
        time_ms: outcome.meta.time_ms,
        memory_kb: outcome.meta.memory_kb,
        stdout: outcome.stdout,
        stdout_bytes: outcome.stdout_bytes,
        stderr: outcome.stderr,
    })
}
