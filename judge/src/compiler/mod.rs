//! Compiler module - Source code compilation
//!
//! This module provides compilation functionality:
//! - User code compilation (sandboxed)
//! - Trusted code compilation (checkers, validators)
//!
//! The compiler module uses the sandbox module directly for sandboxed compilation.

use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use tokio::fs;
use tracing::{debug, info};

use crate::languages::LanguageConfig;
use crate::runner::trusted::{compile_trusted_cpp, TrustedCompileResult};
use crate::sandbox::{ensure_cgroups_available, get_config, IsolateBox};

/// Result of a compilation attempt
#[derive(Debug)]
pub struct CompileResult {
    pub success: bool,
    pub message: Option<String>,
}

/// Build artifact from compilation
#[derive(Debug)]
pub struct BuildArtifact {
    /// Path to the binary or main executable
    pub binary_path: PathBuf,
    /// Working directory containing all build outputs
    pub work_dir: PathBuf,
}

/// Compile source code inside the sandbox
pub async fn compile_in_sandbox(
    box_id: u32,
    source_dir: &Path,
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

    let use_cgroups = ensure_cgroups_available().await.is_ok();
    if !use_cgroups {
        anyhow::bail!("Cgroup support is required for compilation");
    }

    debug!(
        "Compiling with {:?} inside isolate sandbox (box_id={})",
        compile_cmd, box_id
    );

    let isolate_box = IsolateBox::new(box_id, use_cgroups).await?;

    // Copy source files to box
    isolate_box.copy_dir_in(source_dir).await?;

    // Build compile limits
    let time_limit_secs = (time_limit_ms as f64) / 1000.0;
    let wall_time_secs = time_limit_secs * 2.0 + 5.0;

    // Run compilation with special settings
    let meta_file = format!("/tmp/isolate_compile_meta_{}.txt", box_id);
    let stderr_file = "compile_stderr.txt";

    let mut args = vec!["--box-id".to_string(), box_id.to_string()];

    if use_cgroups {
        let compile_memory_kb = memory_limit_mb * 1024;
        args.push("--cg".to_string());
        args.push(format!("--cg-mem={}", compile_memory_kb));
    }

    args.extend([
        format!("--time={}", time_limit_secs),
        format!("--wall-time={}", wall_time_secs),
        format!("--meta={}", meta_file),
        format!("--stderr={}", stderr_file),
        "--processes=128".to_string(),
        "--open-files=256".to_string(),
        "--fsize=262144".to_string(),
        "--dir=/usr".to_string(),
        "--dir=/lib".to_string(),
        "--dir=/lib64".to_string(),
        "--dir=/etc:noexec".to_string(),
        "--dir=/tmp:tmp".to_string(),
        "--env=PATH=/usr/local/bin:/usr/bin:/bin".to_string(),
        "--env=HOME=/box".to_string(),
        "--env=JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64".to_string(),
    ]);

    args.push("--run".to_string());
    args.push("--".to_string());

    // Add compile command
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

    let output = tokio::process::Command::new("isolate")
        .args(&args)
        .output()
        .await
        .context("Failed to run isolate for compilation")?;

    // Read stderr
    let stderr_path = format!("{}/{}", isolate_box.work_dir(), stderr_file);
    let stderr_content = fs::read_to_string(&stderr_path).await.unwrap_or_default();

    // Parse meta file
    let meta_content = fs::read_to_string(&meta_file).await.unwrap_or_default();

    // Cleanup meta file
    let _ = fs::remove_file(&meta_file).await;

    // Parse meta for status
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

    // Copy compiled files back to source_dir
    if success {
        let box_work_dir = isolate_box.work_dir();
        let mut entries = fs::read_dir(&box_work_dir).await?;
        while let Some(entry) = entries.next_entry().await? {
            let metadata = entry.metadata().await?;
            if metadata.is_dir() {
                continue;
            }
            let file_name = entry.file_name();
            let dest = source_dir.join(&file_name);
            if !dest.exists() || metadata.modified()? > dest.metadata()?.modified()? {
                fs::copy(entry.path(), &dest).await?;
            }
        }
    }

    // Cleanup
    isolate_box.cleanup().await?;

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

/// Compile user-submitted code (sandboxed)
pub async fn compile_user_code(
    box_id: u32,
    source_dir: &Path,
    lang_config: &LanguageConfig,
) -> Result<CompileResult> {
    let compile_cmd = match &lang_config.compile_command {
        Some(cmd) => cmd,
        None => {
            // Interpreted language, no compilation needed
            return Ok(CompileResult {
                success: true,
                message: None,
            });
        }
    };

    let config = get_config();

    debug!(
        "Compiling user code with {:?} in sandbox box_id={}",
        compile_cmd, box_id
    );

    compile_in_sandbox(
        box_id,
        source_dir,
        compile_cmd,
        config.compile_time_limit_ms,
        config.compile_memory_limit_mb,
    )
    .await
}

/// Compile a C++ checker/validator (trusted, no sandbox)
pub async fn compile_checker(
    source_path: &Path,
    output_path: &Path,
    testlib_path: &Path,
) -> Result<TrustedCompileResult> {
    info!("Compiling checker: {:?} -> {:?}", source_path, output_path);

    let include_dir = testlib_path.parent().unwrap_or(Path::new("."));
    compile_trusted_cpp(source_path, output_path, &[include_dir]).await
}

/// Compile a C++ validator (trusted, no sandbox)
pub async fn compile_validator(
    source_path: &Path,
    output_path: &Path,
    testlib_path: &Path,
) -> Result<TrustedCompileResult> {
    info!(
        "Compiling validator: {:?} -> {:?}",
        source_path, output_path
    );

    let include_dir = testlib_path.parent().unwrap_or(Path::new("."));
    compile_trusted_cpp(source_path, output_path, &[include_dir]).await
}

/// Manager for checker compilation and caching
pub struct CheckerCompiler {
    /// Path to testlib.h header file
    testlib_path: PathBuf,
    /// Local cache directory for compiled checkers
    cache_dir: PathBuf,
}

impl CheckerCompiler {
    pub fn new(testlib_path: impl AsRef<Path>, cache_dir: impl AsRef<Path>) -> Self {
        // ensure testlib_path exists
        if !testlib_path.as_ref().exists() {
            panic!(
                "testlib.h not found at path: {:?}",
                testlib_path.as_ref()
            );
        }

        Self {
            testlib_path: testlib_path.as_ref().to_path_buf(),
            cache_dir: cache_dir.as_ref().to_path_buf(),
        }
    }

    /// Get the path to a compiled checker, compiling if necessary
    pub async fn get_or_compile(&self, source_content: &str, problem_id: i64) -> Result<PathBuf> {
        let checker_dir = self.cache_dir.join(format!("checker_{}", problem_id));
        tokio::fs::create_dir_all(&checker_dir).await?;

        let source_path = checker_dir.join("checker.cpp");
        let binary_path = checker_dir.join("checker");

        // Check if source has changed or binary doesn't exist
        let need_compile = if binary_path.exists() && source_path.exists() {
            let cached_source = tokio::fs::read_to_string(&source_path)
                .await
                .unwrap_or_default();
            if cached_source != source_content {
                info!(
                    "Checker source has changed, recompiling for problem {}",
                    problem_id
                );
                true
            } else {
                debug!(
                    "Checker source unchanged, using cached binary for problem {}",
                    problem_id
                );
                false
            }
        } else {
            true
        };

        if need_compile {
            tokio::fs::write(&source_path, source_content).await?;

            info!("Compiling checker for problem {}", problem_id);
            let result = compile_checker(&source_path, &binary_path, &self.testlib_path).await?;

            if !result.success {
                anyhow::bail!("Failed to compile checker: {}", result.stderr);
            }

            info!("Checker compiled successfully: {:?}", binary_path);
        }

        Ok(binary_path)
    }

    /// Clear cached checker for a problem
    pub async fn clear_cache(&self, problem_id: i64) -> Result<()> {
        let checker_dir = self.cache_dir.join(format!("checker_{}", problem_id));
        if checker_dir.exists() {
            tokio::fs::remove_dir_all(&checker_dir).await?;
        }
        Ok(())
    }
}

/// Manager for validator compilation and caching
pub struct ValidatorCompiler {
    /// Path to testlib.h header file
    testlib_path: PathBuf,
    /// Local cache directory for compiled validators
    cache_dir: PathBuf,
}

impl ValidatorCompiler {
    pub fn new(testlib_path: impl AsRef<Path>, cache_dir: impl AsRef<Path>) -> Self {
        Self {
            testlib_path: testlib_path.as_ref().to_path_buf(),
            cache_dir: cache_dir.as_ref().to_path_buf(),
        }
    }

    /// Get the path to a compiled validator, compiling if necessary
    pub async fn get_or_compile(&self, source_content: &str, problem_id: i64) -> Result<PathBuf> {
        let validator_dir = self.cache_dir.join(format!("validator_{}", problem_id));
        tokio::fs::create_dir_all(&validator_dir).await?;

        let source_path = validator_dir.join("validator.cpp");
        let binary_path = validator_dir.join("validator");

        // Check if source has changed or binary doesn't exist
        let need_compile = if binary_path.exists() && source_path.exists() {
            let cached_source = tokio::fs::read_to_string(&source_path)
                .await
                .unwrap_or_default();
            if cached_source != source_content {
                info!(
                    "Validator source has changed, recompiling for problem {}",
                    problem_id
                );
                true
            } else {
                debug!(
                    "Validator source unchanged, using cached binary for problem {}",
                    problem_id
                );
                false
            }
        } else {
            true
        };

        if need_compile {
            tokio::fs::write(&source_path, source_content).await?;

            info!("Compiling validator for problem {}", problem_id);
            let result =
                compile_validator(&source_path, &binary_path, &self.testlib_path).await?;

            if !result.success {
                anyhow::bail!("Failed to compile validator: {}", result.stderr);
            }

            info!("Validator compiled successfully: {:?}", binary_path);
        }

        Ok(binary_path)
    }

    /// Clear cached validator for a problem
    pub async fn clear_cache(&self, problem_id: i64) -> Result<()> {
        let validator_dir = self.cache_dir.join(format!("validator_{}", problem_id));
        if validator_dir.exists() {
            tokio::fs::remove_dir_all(&validator_dir).await?;
        }
        Ok(())
    }
}
