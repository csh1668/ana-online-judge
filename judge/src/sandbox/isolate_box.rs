//! Isolate box management
//!
//! Low-level wrapper around the isolate sandbox for secure code execution.
//! Manages box initialization, cleanup, and command execution.

use anyhow::{Context, Result};
use std::path::Path;
use std::sync::OnceLock;
use tokio::fs;
use tokio::process::Command;
use tracing::{debug, info};

use super::meta::{parse_meta, IsolateMeta, IsolateStatus};

/// Cached cgroup availability
static USE_CGROUPS: OnceLock<bool> = OnceLock::new();

/// Check if isolate cgroups are available
pub async fn is_cgroups_available() -> bool {
    if let Some(value) = USE_CGROUPS.get() {
        return *value;
    }

    // Try to initialize a test box with cgroups
    let test_result = Command::new("isolate")
        .args(["--box-id", "99", "--cg", "--init"])
        .output()
        .await;

    // Cleanup
    let _ = Command::new("isolate")
        .args(["--box-id", "99", "--cleanup"])
        .output()
        .await;

    let available = match test_result {
        Ok(r) => r.status.success(),
        Err(_) => false,
    };

    let _ = USE_CGROUPS.set(available);
    available
}

/// Ensure cgroups are available; return an error otherwise
pub async fn ensure_cgroups_available() -> Result<()> {
    if is_cgroups_available().await {
        Ok(())
    } else {
        anyhow::bail!("Isolate cgroup support is required but not available. Install isolate with cgroup support and ensure cgroups are enabled.")
    }
}

/// I/O specification for sandbox execution
#[derive(Debug, Default, Clone)]
pub struct IoSpec {
    /// Path to stdin file (will be copied into box)
    pub stdin_path: Option<std::path::PathBuf>,
    /// File name for stdout inside the box
    pub stdout_file: String,
    /// Whether to redirect stderr to stdout
    pub stderr_to_stdout: bool,
}

impl IoSpec {
    pub fn new() -> Self {
        Self {
            stdin_path: None,
            stdout_file: "stdout.txt".to_string(),
            stderr_to_stdout: true,
        }
    }

    pub fn with_stdin(mut self, path: impl AsRef<Path>) -> Self {
        self.stdin_path = Some(path.as_ref().to_path_buf());
        self
    }

    pub fn with_stderr_to_stdout(mut self, value: bool) -> Self {
        self.stderr_to_stdout = value;
        self
    }
}

/// Resource limits for sandbox execution
#[derive(Debug, Clone)]
pub struct Limits {
    /// Time limit in milliseconds
    pub time_ms: u32,
    /// Memory limit in MB
    pub memory_mb: u32,
    /// Maximum number of processes
    pub processes: u32,
    /// Maximum open files
    pub open_files: u32,
    /// Maximum file size in KB
    pub fsize_kb: u32,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            time_ms: 1000,
            memory_mb: 256,
            processes: 64,
            open_files: 256,
            fsize_kb: 262144, // 256MB
        }
    }
}

/// Raw outcome from sandbox execution (no verdict interpretation)
#[derive(Debug)]
pub struct SandboxOutcome {
    /// Parsed meta file contents
    pub meta: IsolateMeta,
    /// Stdout content
    pub stdout: String,
    /// Stderr content (if not redirected to stdout)
    pub stderr: String,
}

/// Isolate box manager
pub struct IsolateBox {
    box_id: u32,
    box_path: String,
    use_cgroups: bool,
}

impl IsolateBox {
    /// Create and initialize a new isolate box
    pub async fn new(box_id: u32, use_cgroups: bool) -> Result<Self> {
        // Clean up any existing box
        let _ = Command::new("isolate")
            .args(["--box-id", &box_id.to_string(), "--cleanup"])
            .output()
            .await;

        let box_id_str = box_id.to_string();
        let mut args = vec!["--box-id", &box_id_str];
        if use_cgroups {
            args.push("--cg");
        }
        args.push("--init");

        let output = Command::new("isolate")
            .args(&args)
            .output()
            .await
            .context("Failed to run isolate --init")?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("Failed to initialize isolate box: {}", stderr);
        }

        let box_path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        info!(
            "Initialized isolate box {} at {} (cgroups: {})",
            box_id, box_path, use_cgroups
        );

        Ok(Self {
            box_id,
            box_path,
            use_cgroups,
        })
    }

    /// Get the box ID
    pub fn box_id(&self) -> u32 {
        self.box_id
    }

    /// Get the path to the box directory
    pub fn path(&self) -> &str {
        &self.box_path
    }

    /// Get the path to the box/box subdirectory (working directory for programs)
    pub fn work_dir(&self) -> String {
        format!("{}/box", self.box_path)
    }

    /// Copy a file into the box's working directory
    pub async fn copy_in(&self, source: &Path, dest_name: &str) -> Result<()> {
        let dest = format!("{}/{}", self.work_dir(), dest_name);
        fs::copy(source, &dest)
            .await
            .with_context(|| format!("Failed to copy {:?} to {}", source, dest))?;
        Ok(())
    }

    /// Copy a directory's contents into the box's working directory
    pub async fn copy_dir_in(&self, source_dir: &Path) -> Result<()> {
        let mut entries = fs::read_dir(source_dir).await?;
        while let Some(entry) = entries.next_entry().await? {
            let dest = format!("{}/{}", self.work_dir(), entry.file_name().to_string_lossy());
            fs::copy(entry.path(), &dest).await?;
        }
        Ok(())
    }

    /// Copy a file out of the box's working directory
    pub async fn copy_out(&self, source_name: &str, dest: &Path) -> Result<()> {
        let source = format!("{}/{}", self.work_dir(), source_name);
        fs::copy(&source, dest)
            .await
            .with_context(|| format!("Failed to copy {} to {:?}", source, dest))?;
        Ok(())
    }

    /// Read a file from the box's working directory
    pub async fn read_file(&self, name: &str) -> Result<String> {
        let path = format!("{}/{}", self.work_dir(), name);
        fs::read_to_string(&path)
            .await
            .with_context(|| format!("Failed to read {}", path))
    }

    /// Run a command in the isolate box
    pub async fn run(
        &self,
        command: &[String],
        limits: &Limits,
        io: &IoSpec,
    ) -> Result<SandboxOutcome> {
        let meta_file = format!("/tmp/isolate_meta_{}.txt", self.box_id);
        let stdout_path = format!("{}/{}", self.work_dir(), io.stdout_file);

        let time_limit_secs = (limits.time_ms as f64) / 1000.0;
        let wall_time_secs = time_limit_secs * 2.0 + 1.0;
        let memory_limit_kb = limits.memory_mb * 1024;

        let mut args = vec!["--box-id".to_string(), self.box_id.to_string()];

        // Add cgroup options if available
        if self.use_cgroups {
            args.push("--cg".to_string());
            args.push(format!("--cg-mem={}", memory_limit_kb));
        }

        args.extend([
            format!("--time={}", time_limit_secs),
            format!("--wall-time={}", wall_time_secs),
            format!("--meta={}", meta_file),
            format!("--stdout={}", io.stdout_file),
            format!("--processes={}", limits.processes),
            format!("--open-files={}", limits.open_files),
            format!("--fsize={}", limits.fsize_kb),
            // Mount directories needed for runtime
            "--dir=/usr".to_string(),
            "--dir=/lib".to_string(),
            "--dir=/lib64".to_string(),
            "--dir=/etc:noexec".to_string(),
            "--dir=/tmp:tmp".to_string(),
            // Environment variables
            "--env=PATH=/usr/local/bin:/usr/bin:/bin".to_string(),
            "--env=HOME=/box".to_string(),
            "--env=JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64".to_string(),
        ]);

        if io.stderr_to_stdout {
            args.push("--stderr-to-stdout".to_string());
        }

        // Handle stdin
        if let Some(stdin_path) = &io.stdin_path {
            let dest = format!("{}/stdin.txt", self.work_dir());
            fs::copy(stdin_path, &dest).await?;
            args.push("--stdin=stdin.txt".to_string());
        }

        args.push("--run".to_string());
        args.push("--".to_string());

        // Prepend /usr/bin/ to the command if it's not an absolute path
        let mut cmd_iter = command.iter();
        if let Some(cmd) = cmd_iter.next() {
            if cmd.starts_with('/') || cmd.starts_with("./") {
                args.push(cmd.clone());
            } else {
                args.push(format!("/usr/bin/{}", cmd));
            }
            args.extend(cmd_iter.cloned());
        }

        debug!("Running isolate with args: {:?}", args);

        let _output = Command::new("isolate")
            .args(&args)
            .output()
            .await
            .context("Failed to run isolate")?;

        // Parse meta file
        let meta_content = fs::read_to_string(&meta_file).await.unwrap_or_default();
        let meta = parse_meta(&meta_content);

        // Read stdout
        let stdout = fs::read_to_string(&stdout_path).await.unwrap_or_default();

        // Cleanup meta file
        let _ = fs::remove_file(&meta_file).await;

        Ok(SandboxOutcome {
            meta,
            stdout,
            stderr: String::new(), // stderr redirected to stdout
        })
    }

    /// Cleanup the isolate box
    pub async fn cleanup(self) -> Result<()> {
        Command::new("isolate")
            .args(["--box-id", &self.box_id.to_string(), "--cleanup"])
            .output()
            .await?;
        info!("Cleaned up isolate box {}", self.box_id);
        Ok(())
    }
}

/// Check if program exited successfully (for use after run)
pub fn is_success(meta: &IsolateMeta) -> bool {
    matches!(meta.status, IsolateStatus::Ok) && meta.exit_code == 0
}

/// Check if time limit was exceeded
pub fn is_tle(meta: &IsolateMeta) -> bool {
    matches!(meta.status, IsolateStatus::TimeOut)
}

/// Check if memory limit was exceeded
pub fn is_mle(meta: &IsolateMeta, memory_limit_kb: u32) -> bool {
    meta.memory_kb > memory_limit_kb
}


