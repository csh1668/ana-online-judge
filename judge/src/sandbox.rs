//! Sandbox execution using Isolate
//!
//! This module provides a wrapper around the Isolate sandbox for secure code execution.
//! Isolate uses Linux cgroups for resource limitation and namespace isolation.
//!
//! See: https://github.com/ioi/isolate

use anyhow::{Context, Result};
use std::path::Path;
use std::sync::OnceLock;
use tokio::fs;
use tokio::process::Command;
use tracing::{debug, info};

/// Sandbox configuration loaded from environment variables
#[derive(Debug, Clone)]
pub struct SandboxConfig {
    /// Compile time limit in milliseconds (default: 30000ms = 30s)
    pub compile_time_limit_ms: u32,
    /// Compile memory limit in MB (default: 2048MB)
    pub compile_memory_limit_mb: u32,
    /// Worker ID for box ID allocation
    pub worker_id: u32,
}

impl Default for SandboxConfig {
    fn default() -> Self {
        Self {
            compile_time_limit_ms: 30_000,
            compile_memory_limit_mb: 2048,
            worker_id: 0,
        }
    }
}

impl SandboxConfig {
    /// Load configuration (fixed defaults, env overrides removed)
    pub fn from_env() -> Self {
        Self {
            compile_time_limit_ms: 30_000,
            compile_memory_limit_mb: 2048,
            worker_id: 0, // Will be set dynamically via Redis
        }
    }

    /// Create config with a specific worker_id
    pub fn with_worker_id(worker_id: u32) -> Self {
        let mut config = Self::from_env();
        config.worker_id = worker_id;
        config
    }
}

/// Global sandbox configuration
static SANDBOX_CONFIG: OnceLock<SandboxConfig> = OnceLock::new();
/// Cached cgroup availability
static USE_CGROUPS: OnceLock<bool> = OnceLock::new();

/// Initialize sandbox configuration with dynamically assigned worker_id
pub fn init_sandbox_config_with_worker_id(worker_id: u32) -> &'static SandboxConfig {
    SANDBOX_CONFIG.get_or_init(|| SandboxConfig::with_worker_id(worker_id))
}

/// Get sandbox configuration
pub fn get_sandbox_config() -> &'static SandboxConfig {
    SANDBOX_CONFIG.get().unwrap_or_else(|| {
        // Fallback to default if not initialized (should not happen)
        static DEFAULT: OnceLock<SandboxConfig> = OnceLock::new();
        DEFAULT.get_or_init(SandboxConfig::default)
    })
}

/// Result of a compilation attempt
#[derive(Debug)]
#[allow(dead_code)]
pub struct CompileResult {
    pub success: bool,
    pub message: Option<String>,
}

/// Result of running a program
#[derive(Debug)]
pub struct RunResult {
    pub verdict: String,
    pub time_ms: u32,
    pub memory_kb: u32,
    pub output: String,
}

/// Check if isolate cgroups are available
async fn is_cgroups_available() -> bool {
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

/// Check if isolate is available (without cgroups)
// async fn is_isolate_available() -> bool {
//     match Command::new("isolate").arg("--version").output().await {
//         Ok(output) => {
//             if output.status.success() {
//                 // Try to initialize a test box without cgroups
//                 let test_result = Command::new("isolate")
//                     .args(["--box-id", "99", "--init"])
//                     .output()
//                     .await;
                
//                 // Cleanup
//                 let _ = Command::new("isolate")
//                     .args(["--box-id", "99", "--cleanup"])
//                     .output()
//                     .await;

//                 match test_result {
//                     Ok(r) => r.status.success(),
//                     Err(_) => false,
//                 }
//             } else {
//                 false
//             }
//         }
//         Err(_) => false,
//     }
// }

/// Isolate box manager
pub struct IsolateBox {
    box_id: u32,
    box_path: String,
    use_cgroups: bool,
}

impl IsolateBox {
    pub async fn new(box_id: u32, use_cgroups: bool) -> Result<Self> {
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
        info!("Initialized isolate box {} at {} (cgroups: {})", box_id, box_path, use_cgroups);

        Ok(Self { box_id, box_path, use_cgroups })
    }

    /// Get the path to the box directory
    #[allow(dead_code)]
    pub fn path(&self) -> &str {
        &self.box_path
    }

    /// Get the path to the box/box subdirectory (where files should be placed)
    pub fn work_dir(&self) -> String {
        format!("{}/box", self.box_path)
    }

    /// Run a command in the isolate box
    pub async fn run(
        &self,
        command: &[String],
        stdin_file: Option<&Path>,
        time_limit_ms: u32,
        memory_limit_mb: u32,
    ) -> Result<RunResult> {
        let meta_file = format!("/tmp/isolate_meta_{}.txt", self.box_id);
        let stdout_file = format!("{}/stdout.txt", self.work_dir());

        let time_limit_secs = (time_limit_ms as f64) / 1000.0;
        let wall_time_secs = time_limit_secs * 2.0 + 1.0; // Wall time = 2x CPU time + 1s buffer
        let memory_limit_kb = memory_limit_mb * 1024;

        let mut args = vec![
            "--box-id".to_string(),
            self.box_id.to_string(),
        ];
        
        // Add cgroup options if available
        if self.use_cgroups {
            args.push("--cg".to_string());
            args.push(format!("--cg-mem={}", memory_limit_kb));
        }
        // Without cgroups: rely on time limits and language-specific options (e.g., JVM -Xmx)
        
        args.extend([
            format!("--time={}", time_limit_secs),
            format!("--wall-time={}", wall_time_secs),
            format!("--meta={}", meta_file),
            "--stdout=stdout.txt".to_string(),
            "--stderr-to-stdout".to_string(),
            "--processes=64".to_string(),
            "--open-files=256".to_string(),
            "--fsize=262144".to_string(), // 256MB max file size
            // Mount directories needed for runtime (Java, Python, etc.)
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

        if let Some(stdin) = stdin_file {
            // Copy stdin file to box
            let dest = format!("{}/stdin.txt", self.work_dir());
            fs::copy(stdin, &dest).await?;
            args.push("--stdin=stdin.txt".to_string());
        }

        args.push("--run".to_string());
        args.push("--".to_string());
        
        // Prepend /usr/bin/ to the command if it's not an absolute path or relative path
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

        // Parse meta file for results
        let meta_content = fs::read_to_string(&meta_file)
            .await
            .unwrap_or_default();
        
        let (verdict, time_ms, memory_kb) = parse_meta(&meta_content, time_limit_ms, memory_limit_kb);

        // Read stdout
        let stdout_content = fs::read_to_string(&stdout_file)
            .await
            .unwrap_or_default();

        // Cleanup meta file
        let _ = fs::remove_file(&meta_file).await;

        Ok(RunResult {
            verdict,
            time_ms,
            memory_kb,
            output: stdout_content,
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

    /// Compile source code inside the isolate sandbox
    pub async fn compile(
        &self,
        compile_cmd: &[String],
        time_limit_ms: u32,
        memory_limit_mb: u32,
    ) -> Result<CompileResult> {
        if compile_cmd.is_empty() {
            return Ok(CompileResult {
                success: true,
                message: None,
            });
        }

        let meta_file = format!("/tmp/isolate_compile_meta_{}.txt", self.box_id);
        let stderr_file = format!("{}/compile_stderr.txt", self.work_dir());

        let time_limit_secs = (time_limit_ms as f64) / 1000.0;
        let wall_time_secs = time_limit_secs * 2.0 + 5.0; // Extra buffer for compilation

        let mut args = vec![
            "--box-id".to_string(),
            self.box_id.to_string(),
        ];

        // Add cgroup options if available
        if self.use_cgroups {
            let compile_memory_kb = memory_limit_mb * 1024;
            args.push("--cg".to_string());
            args.push(format!("--cg-mem={}", compile_memory_kb));
        }
        // Without cgroups: rely on wall-time limit for protection

        args.extend([
            format!("--time={}", time_limit_secs),
            format!("--wall-time={}", wall_time_secs),
            format!("--meta={}", meta_file),
            "--stderr=compile_stderr.txt".to_string(),
            "--processes=128".to_string(),
            "--open-files=256".to_string(),
            "--fsize=262144".to_string(), // 256MB max file size
            // Mount directories needed for compilation (Java, C, C++, Python, etc.)
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

        args.push("--run".to_string());
        args.push("--".to_string());
        
        // Prepend /usr/bin/ to the command if it's not an absolute path
        let mut cmd_iter = compile_cmd.iter();
        if let Some(cmd) = cmd_iter.next() {
            if cmd.starts_with('/') || cmd.starts_with("./") {
                args.push(cmd.clone());
            } else {
                args.push(format!("/usr/bin/{}", cmd));
            }
            args.extend(cmd_iter.cloned());
        }

        debug!("Compiling in isolate with args: {:?}", args);

        let output = Command::new("isolate")
            .args(&args)
            .output()
            .await
            .context("Failed to run isolate for compilation")?;

        // Read stderr (compilation errors)
        let stderr_content = fs::read_to_string(&stderr_file)
            .await
            .unwrap_or_default();

        // Parse meta file
        let meta_content = fs::read_to_string(&meta_file)
            .await
            .unwrap_or_default();

        // Cleanup meta file
        let _ = fs::remove_file(&meta_file).await;

        // Check if compilation succeeded
        let mut status = String::new();
        let mut exit_code = 0i32;

        for line in meta_content.lines() {
            let parts: Vec<&str> = line.splitn(2, ':').collect();
            if parts.len() != 2 {
                continue;
            }
            match parts[0].trim() {
                "status" => status = parts[1].trim().to_string(),
                "exitcode" => exit_code = parts[1].trim().parse().unwrap_or(0),
                _ => {}
            }
        }

        let success = status.is_empty() && exit_code == 0 && output.status.success();

        if success {
            Ok(CompileResult {
                success: true,
                message: None,
            })
        } else {
            let error_msg = if !stderr_content.is_empty() {
                stderr_content
            } else if status == "TO" {
                "Compilation timed out".to_string()
            } else if status == "SG" || status == "RE" {
                "Compiler crashed".to_string()
            } else {
                format!("Compilation failed with exit code {}", exit_code)
            };

            Ok(CompileResult {
                success: false,
                message: Some(error_msg),
            })
        }
    }
}

/// Parse isolate meta file to extract verdict and resource usage
fn parse_meta(content: &str, _time_limit_ms: u32, memory_limit_kb: u32) -> (String, u32, u32) {
    let mut time_ms = 0u32;
    let mut memory_kb = 0u32;
    let mut status = String::new();
    let mut exit_code = 0i32;

    for line in content.lines() {
        let parts: Vec<&str> = line.splitn(2, ':').collect();
        if parts.len() != 2 {
            continue;
        }

        let key = parts[0].trim();
        let value = parts[1].trim();

        match key {
            "time" => {
                if let Ok(t) = value.parse::<f64>() {
                    time_ms = (t * 1000.0) as u32;
                }
            }
            "cg-mem" | "max-rss" => {
                // cg-mem for cgroups, max-rss for non-cgroups
                if let Ok(m) = value.parse::<u32>() {
                    // max-rss is in KB, cg-mem is in KB too
                    if memory_kb == 0 || m > memory_kb {
                        memory_kb = m;
                    }
                }
            }
            "status" => {
                status = value.to_string();
            }
            "exitcode" => {
                exit_code = value.parse().unwrap_or(0);
            }
            _ => {}
        }
    }

    let verdict = match status.as_str() {
        "TO" => "time_limit_exceeded".to_string(),
        "SG" => "runtime_error".to_string(), // Signal (crash)
        "RE" => "runtime_error".to_string(),
        "XX" => "system_error".to_string(),
        "" if exit_code == 0 => "ok".to_string(), // Success, need to compare output
        "" => "runtime_error".to_string(),
        _ => "runtime_error".to_string(),
    };

    // Check if memory limit exceeded
    let verdict = if memory_kb > memory_limit_kb {
        "memory_limit_exceeded".to_string()
    } else {
        verdict
    };

    (verdict, time_ms, memory_kb)
}

/// Compile source code with isolate sandbox (secure)
pub async fn compile_with_isolate(
    box_id: u32,
    source_path: &Path,
    compile_cmd: &[String],
    work_dir: &Path,
) -> Result<CompileResult> {
    if compile_cmd.is_empty() {
        return Err(anyhow::anyhow!("Compile command is empty"));
    }

    let config = get_sandbox_config();

    let use_cgroups = if is_cgroups_available().await {
        true
    } else {
        anyhow::bail!("Cgroup support is required for compilation but is unavailable");
    };

    debug!("Compiling {:?} with {:?} inside isolate sandbox", source_path, compile_cmd);

    let isolate_box = IsolateBox::new(box_id, use_cgroups).await?;
    let box_work_dir = isolate_box.work_dir();

    // Copy source files to box
    let mut entries = fs::read_dir(work_dir).await?;
    while let Some(entry) = entries.next_entry().await? {
        let dest = format!("{}/{}", box_work_dir, entry.file_name().to_string_lossy());
        fs::copy(entry.path(), &dest).await?;
    }

    // Run compilation inside sandbox
    let result = isolate_box.compile(
        compile_cmd,
        config.compile_time_limit_ms,
        config.compile_memory_limit_mb,
    ).await?;

    // Copy compiled files back to work_dir
    if result.success {
        let mut box_entries = fs::read_dir(&box_work_dir).await?;
        while let Some(entry) = box_entries.next_entry().await? {
            let metadata = entry.metadata().await?;
            // Skip directories (e.g., __pycache__)
            if metadata.is_dir() {
                continue;
            }
            let file_name = entry.file_name();
            let dest = work_dir.join(&file_name);
            // Only copy new/modified files (skip source files we already have)
            if !dest.exists() || metadata.modified()? > dest.metadata()?.modified()? {
                fs::copy(entry.path(), &dest).await?;
            }
        }
    }

    // Cleanup
    isolate_box.cleanup().await?;

    Ok(result)
}

/// Compare program output with expected output
pub fn compare_output(actual: &str, expected: &str) -> bool {
    // Normalize outputs: trim trailing whitespace from each line and trailing newlines
    let normalize = |s: &str| -> Vec<String> {
        s.lines()
            .map(|line| line.trim_end().to_string())
            .collect::<Vec<_>>()
    };

    let actual_lines = normalize(actual);
    let expected_lines = normalize(expected);

    // Remove trailing empty lines
    let trim_trailing = |lines: Vec<String>| -> Vec<String> {
        let mut lines = lines;
        while lines.last().map(|s| s.is_empty()).unwrap_or(false) {
            lines.pop();
        }
        lines
    };

    let actual_lines = trim_trailing(actual_lines);
    let expected_lines = trim_trailing(expected_lines);

    actual_lines == expected_lines
}

/// Calculate unique box ID for a worker to prevent collisions
/// Isolate only supports box IDs 0-9999, so we use modulo to stay in range.
/// Each worker (0-9) gets a range of 1000 box IDs.
pub fn calculate_box_id(base_counter: u32, testcase_idx: u32) -> u32 {
    let config = get_sandbox_config();
    // Limit worker_id to 0-9 range (10 workers max for box ID allocation)
    let effective_worker_id = config.worker_id % 10;
    let worker_offset = effective_worker_id * 1000;
    // Use modulo to cycle within worker's range (0-999)
    worker_offset + ((base_counter * 10 + testcase_idx) % 1000)
}

/// Run a program with isolate sandbox (REQUIRED)
pub async fn run_with_isolate(
    box_id: u32,
    work_dir: &Path,
    run_cmd: &[String],
    input_content: &str,
    expected_output: &str,
    time_limit_ms: u32,
    memory_limit_mb: u32,
) -> Result<RunResult> {

    let use_cgroups = if is_cgroups_available().await {
        true
    } else {
        anyhow::bail!("Cgroup support is required for execution but is unavailable");
    };

    if use_cgroups {
        debug!("Using isolate sandbox with cgroups (box_id={})", box_id);
    } else {
        debug!("Using isolate sandbox without cgroups (box_id={})", box_id);
    }
    
    // Initialize isolate box
    let isolate_box = IsolateBox::new(box_id, use_cgroups).await?;

    // Copy compiled program to box
    let box_work_dir = isolate_box.work_dir();
    
    // Copy all files from work_dir to box
    let mut entries = fs::read_dir(work_dir).await?;
    while let Some(entry) = entries.next_entry().await? {
        let dest = format!("{}/{}", box_work_dir, entry.file_name().to_string_lossy());
        fs::copy(entry.path(), &dest).await?;
    }

    // Write input to temp file
    let input_file = tempfile::NamedTempFile::new()?;
    fs::write(input_file.path(), input_content).await?;

    // Run program
    let result = isolate_box.run(
        run_cmd,
        Some(input_file.path()),
        time_limit_ms,
        memory_limit_mb,
    ).await?;

    // Cleanup
    isolate_box.cleanup().await?;

    // Determine final verdict
    let verdict = if result.verdict == "ok" {
        if compare_output(&result.output, expected_output) {
            "accepted".to_string()
        } else {
            "wrong_answer".to_string()
        }
    } else {
        result.verdict
    };

    Ok(RunResult {
        verdict,
        time_ms: result.time_ms,
        memory_kb: result.memory_kb,
        output: result.output,
    })
}
