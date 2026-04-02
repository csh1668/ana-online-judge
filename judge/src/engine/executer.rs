use crate::engine::sandbox::{
    self, is_cgroups_available, IoSpec, IsolateBox, IsolateStatus, Limits,
};
use anyhow::Context;
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
    /// Additional environment variables for the sandbox
    pub env_vars: Vec<(String, String)>,
    /// Share host network namespace (for storage proxy access)
    pub share_net: bool,
}

impl ExecutionSpec {
    pub fn new(work_dir: impl Into<std::path::PathBuf>) -> Self {
        Self {
            work_dir: work_dir.into(),
            command: vec![],
            limits: ExecutionLimits::default(),
            stdin: None,
            copy_out_dir: None,
            env_vars: vec![],
            share_net: false,
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

    pub fn with_env_vars(mut self, env_vars: Vec<(String, String)>) -> Self {
        self.env_vars = env_vars;
        self
    }

    pub fn with_share_net(mut self) -> Self {
        self.share_net = true;
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
    io.env_vars = spec.env_vars.clone();
    io.share_net = spec.share_net;

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
        IsolateStatus::RuntimeError => ExecutionStatus::Exited(outcome.meta.exit_code),
        IsolateStatus::InternalError => ExecutionStatus::SystemError,
    };

    // Check MLE: cgroup OOM kill or memory exceeds limit
    let status = if outcome.meta.cg_oom_killed
        || (outcome.meta.memory_kb > memory_limit_kb
            && !matches!(status, ExecutionStatus::MemoryLimitExceeded))
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

/// Result of an interactive execution (user program + interactor)
#[derive(Debug)]
pub struct InteractiveOutcome {
    /// User program execution status
    pub user_status: ExecutionStatus,
    /// User program CPU time in milliseconds
    pub user_time_ms: u32,
    /// User program memory used in KB
    pub user_memory_kb: u32,
    /// Interactor exit code (-1 if killed/timed out)
    pub interactor_exit_code: i32,
    /// Interactor stderr output (checker messages)
    pub interactor_stderr: String,
    /// Whether the overall interaction timed out
    pub timed_out: bool,
}

/// Execute a user program and interactor simultaneously with piped I/O.
///
/// The user program runs in an isolate sandbox. The interactor runs as a trusted
/// subprocess outside the sandbox. Their stdin/stdout are cross-connected:
/// - User stdout → Interactor stdin
/// - Interactor stdout → User stdin
pub async fn execute_interactive(
    user_spec: &ExecutionSpec,
    interactor_work_dir: &std::path::Path,
    interactor_command: &[String],
    interactor_env_vars: &[(String, String)],
    overall_timeout_secs: u64,
) -> anyhow::Result<InteractiveOutcome> {
    use tokio::io::AsyncReadExt;

    if !is_cgroups_available().await {
        anyhow::bail!("Cgroup support required for interactive execution");
    }

    // Set up isolate box for user program
    let box_id = next_box_id();
    let isolate_box = IsolateBox::new(box_id, true).await?;
    isolate_box.copy_dir_in(&user_spec.work_dir).await?;

    let sandbox_limits = Limits {
        time_ms: user_spec.limits.time_ms,
        memory_mb: user_spec.limits.memory_mb,
        processes: 64,
        open_files: 256,
        fsize_kb: 262144,
    };

    // Spawn user program in sandbox with piped I/O
    let (mut user_child, meta_file) = isolate_box
        .spawn_piped(&user_spec.command, &sandbox_limits, &user_spec.env_vars)
        .await?;

    // Spawn interactor as trusted subprocess
    let mut interactor_cmd = tokio::process::Command::new(&interactor_command[0]);
    interactor_cmd
        .args(&interactor_command[1..])
        .current_dir(interactor_work_dir)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    for (key, value) in interactor_env_vars {
        interactor_cmd.env(key, value);
    }
    let mut interactor_child = interactor_cmd
        .spawn()
        .context("Failed to spawn interactor")?;

    // Take pipe handles
    let user_stdin = user_child.stdin.take().unwrap();
    let user_stdout = user_child.stdout.take().unwrap();
    let inter_stdin = interactor_child.stdin.take().unwrap();
    let inter_stdout = interactor_child.stdout.take().unwrap();
    let mut inter_stderr = interactor_child.stderr.take().unwrap();

    // Connect pipes: user stdout → interactor stdin
    let copy_user_to_inter = tokio::spawn(async move {
        let mut reader = user_stdout;
        let mut writer = inter_stdin;
        let _ = tokio::io::copy(&mut reader, &mut writer).await;
    });

    // Connect pipes: interactor stdout → user stdin
    let copy_inter_to_user = tokio::spawn(async move {
        let mut reader = inter_stdout;
        let mut writer = user_stdin;
        let _ = tokio::io::copy(&mut reader, &mut writer).await;
    });

    // Read interactor stderr in background
    let stderr_task = tokio::spawn(async move {
        let mut buf = Vec::new();
        let _ = inter_stderr.read_to_end(&mut buf).await;
        String::from_utf8_lossy(&buf).to_string()
    });

    // Wait for everything with overall timeout
    let timeout = std::time::Duration::from_secs(overall_timeout_secs);
    let result = tokio::time::timeout(timeout, async {
        let (user_wait, inter_wait, _, _, stderr_result) = tokio::join!(
            user_child.wait(),
            interactor_child.wait(),
            copy_user_to_inter,
            copy_inter_to_user,
            stderr_task,
        );
        (user_wait, inter_wait, stderr_result)
    })
    .await;

    let (timed_out, interactor_exit_code, interactor_stderr) = match result {
        Ok((_, inter_wait, stderr_result)) => {
            let exit_code = inter_wait.ok().and_then(|s| s.code()).unwrap_or(-1);
            let stderr = stderr_result.ok().unwrap_or_default();
            (false, exit_code, stderr)
        }
        Err(_) => {
            // Timeout — kill both processes
            let _ = user_child.kill().await;
            let _ = interactor_child.kill().await;
            let _ = user_child.wait().await;
            let _ = interactor_child.wait().await;
            (true, -1, "Interactive execution timed out".to_string())
        }
    };

    // Read user program's execution results from meta file
    let (meta, _user_stderr) = isolate_box.read_piped_results(&meta_file).await?;
    isolate_box.cleanup().await?;

    // Convert IsolateStatus to ExecutionStatus
    let memory_limit_kb = user_spec.limits.memory_mb * 1024;
    let user_status = match meta.status {
        IsolateStatus::Ok if meta.exit_code == 0 => {
            if meta.memory_kb > memory_limit_kb {
                ExecutionStatus::MemoryLimitExceeded
            } else {
                ExecutionStatus::Exited(0)
            }
        }
        IsolateStatus::Ok => ExecutionStatus::Exited(meta.exit_code),
        IsolateStatus::TimeOut => ExecutionStatus::TimeLimitExceeded,
        IsolateStatus::Signal(sig) => ExecutionStatus::Signaled(sig),
        IsolateStatus::RuntimeError => ExecutionStatus::Exited(meta.exit_code),
        IsolateStatus::InternalError => ExecutionStatus::SystemError,
    };

    let user_status = if meta.memory_kb > memory_limit_kb
        && !matches!(user_status, ExecutionStatus::MemoryLimitExceeded)
    {
        ExecutionStatus::MemoryLimitExceeded
    } else {
        user_status
    };

    Ok(InteractiveOutcome {
        user_status,
        user_time_ms: meta.time_ms,
        user_memory_kb: meta.memory_kb,
        interactor_exit_code,
        interactor_stderr,
        timed_out,
    })
}
