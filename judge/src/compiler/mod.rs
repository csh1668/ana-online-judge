//! Compiler module - Source code compilation
//!
//! This module provides compilation functionality:
//! - User code compilation (sandboxed)
//! - Trusted code compilation (checkers, validators)
//!
//! The compiler module uses the sandbox module directly for sandboxed compilation.

use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use tracing::{debug, info};

use crate::executer::{
    execute_sandboxed, execute_trusted, ExecutionLimits, ExecutionSpec, ExecutionStatus,
};
use crate::languages::LanguageConfig;
use crate::sandbox::get_config;

/// Result of compiling a trusted program (checker/validator)
#[derive(Debug)]
pub struct TrustedCompileResult {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub success: bool,
}

/// Compile a C++ source file (for checkers/validators) without sandbox
pub async fn compile_trusted_cpp(
    source_path: &Path,
    output_path: &Path,
    include_paths: &[&Path],
) -> Result<TrustedCompileResult> {
    let source_filename = source_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("source.cpp");
    let output_filename = output_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("output");

    let mut command = vec![
        "g++".to_string(),
        "-O2".to_string(),
        "-std=c++17".to_string(),
        "-o".to_string(),
        output_filename.to_string(),
        source_filename.to_string(),
    ];

    // Add include paths (these must be relative or handled if they are outside work_dir)
    // Note: for testlib.h, we usually provide it in the same directory
    for _ in include_paths {
        command.push("-I.".to_string());
    }

    debug!(
        "Compiling trusted C++ in sandbox with command: {:?}",
        command
    );

    let spec = ExecutionSpec::new(source_path.parent().unwrap_or(Path::new(".")))
        .with_command(&command)
        .with_limits(ExecutionLimits {
            time_ms: 60_000, // 60 seconds for compilation
            memory_mb: 2048,
        })
        .with_copy_out_dir(output_path.parent().unwrap_or(Path::new(".")));

    let result = execute_sandboxed(&spec)
        .await
        .context("Failed to run g++ compiler in sandbox")?;

    let success = result.is_success();
    Ok(TrustedCompileResult {
        exit_code: result.exit_code(),
        stdout: result.stdout,
        stderr: result.stderr,
        success,
    })
}

/// Result of a compilation attempt
#[derive(Debug)]
pub struct CompileResult {
    pub success: bool,
    pub message: Option<String>,
}

/// Compile source code inside the sandbox
pub async fn compile_in_sandbox(
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

    debug!("Compiling with {:?} inside isolate sandbox", compile_cmd);

    // Build execution spec for compilation
    let spec = ExecutionSpec::new(source_dir)
        .with_command(compile_cmd)
        .with_limits(ExecutionLimits {
            time_ms: time_limit_ms,
            memory_mb: memory_limit_mb,
        })
        .with_copy_out_dir(source_dir);

    let result = execute_sandboxed(&spec).await?;

    let success = matches!(result.status, ExecutionStatus::Exited(0));

    if success {
        Ok(CompileResult {
            success: true,
            message: None,
        })
    } else {
        let error_msg = if !result.stderr.is_empty() {
            result.stderr
        } else if !result.stdout.is_empty() {
            result.stdout
        } else {
            match result.status {
                ExecutionStatus::TimeLimitExceeded => "Compilation timed out".to_string(),
                ExecutionStatus::Signaled(_) | ExecutionStatus::RuntimeError => {
                    "Compiler crashed".to_string()
                }
                ExecutionStatus::Exited(code) => {
                    format!("Compilation failed with exit code {}", code)
                }
                _ => "Compilation failed".to_string(),
            }
        };

        Ok(CompileResult {
            success: false,
            message: Some(error_msg),
        })
    }
}

/// Generic compiler for trusted components (checkers, validators)
pub struct TrustedCompiler {
    /// Name of the component (e.g., "checker", "validator")
    name: String,
    /// Path to testlib.h header file
    testlib_path: PathBuf,
    /// Local cache directory
    cache_dir: PathBuf,
}

impl TrustedCompiler {
    pub fn new(name: &str, cache_dir_name: &str) -> Self {
        let testlib_path = std::env::current_dir()
            .map(|cwd| cwd.join("files/testlib.h"))
            .unwrap_or_else(|_| PathBuf::from("files/testlib.h"));

        // Ensure cache directory exists is handled lazily or here?
        // We'll use /tmp/<cache_dir_name> based on original code
        let cache_dir = PathBuf::from("/tmp").join(cache_dir_name);

        Self {
            name: name.to_string(),
            testlib_path,
            cache_dir,
        }
    }

    /// Get the path to a compiled binary, compiling if necessary
    pub async fn get_or_compile(&self, source_content: &str, problem_id: i64) -> Result<PathBuf> {
        let comp_dir = self.cache_dir.join(format!("{}_{}", self.name, problem_id));
        tokio::fs::create_dir_all(&comp_dir).await?;

        let source_filename = format!("{}.cpp", self.name);
        let source_path = comp_dir.join(&source_filename);
        let binary_path = comp_dir.join(&self.name);

        // Check if source has changed or binary doesn't exist
        let need_compile = if binary_path.exists() && source_path.exists() {
            let cached_source = tokio::fs::read_to_string(&source_path)
                .await
                .unwrap_or_default();
            if cached_source != source_content {
                info!(
                    "{} source has changed, recompiling for problem {}",
                    self.name, problem_id
                );
                true
            } else {
                debug!(
                    "{} source unchanged, using cached binary for problem {}",
                    self.name, problem_id
                );
                false
            }
        } else {
            true
        };

        if need_compile {
            tokio::fs::write(&source_path, source_content).await?;

            info!("Compiling {} for problem {}", self.name, problem_id);
            // Use the generic trusted cpp compiler
            let include_dir = self.testlib_path.parent().unwrap_or(Path::new("."));
            let result = compile_trusted_cpp(&source_path, &binary_path, &[include_dir]).await?;

            if !result.success {
                anyhow::bail!("Failed to compile {}: {}", self.name, result.stderr);
            }

            info!("{} compiled successfully: {:?}", self.name, binary_path);
        }

        Ok(binary_path)
    }

    /// Clear cache for a problem
    pub async fn clear_cache(&self, problem_id: i64) -> Result<()> {
        let comp_dir = self.cache_dir.join(format!("{}_{}", self.name, problem_id));
        if comp_dir.exists() {
            tokio::fs::remove_dir_all(&comp_dir).await?;
        }
        Ok(())
    }
}

/// Manager for checker compilation and caching
pub struct CheckerCompiler {
    inner: TrustedCompiler,
}

impl CheckerCompiler {
    pub fn new() -> Self {
        Self {
            inner: TrustedCompiler::new("checker", "checker_cache"),
        }
    }

    pub async fn get_or_compile(&self, source_content: &str, problem_id: i64) -> Result<PathBuf> {
        self.inner.get_or_compile(source_content, problem_id).await
    }

    pub async fn clear_cache(&self, problem_id: i64) -> Result<()> {
        self.inner.clear_cache(problem_id).await
    }
}

/// Manager for validator compilation and caching
pub struct ValidatorCompiler {
    inner: TrustedCompiler,
}

impl ValidatorCompiler {
    pub fn new() -> Self {
        Self {
            inner: TrustedCompiler::new("validator", "validator_cache"),
        }
    }

    pub async fn get_or_compile(&self, source_content: &str, problem_id: i64) -> Result<PathBuf> {
        self.inner.get_or_compile(source_content, problem_id).await
    }

    pub async fn clear_cache(&self, problem_id: i64) -> Result<()> {
        self.inner.clear_cache(problem_id).await
    }
}
