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
    let mut command = vec![
        "g++".to_string(),
        "-O2".to_string(),
        "-std=c++17".to_string(),
        "-o".to_string(),
        output_path.to_str().unwrap_or("").to_string(),
        source_path.to_str().unwrap_or("").to_string(),
    ];

    // Add include paths
    for include_path in include_paths {
        command.push(format!("-I{}", include_path.to_str().unwrap_or("")));
    }

    debug!("Compiling trusted C++ with command: {:?}", command);

    let spec = ExecutionSpec::new(source_path.parent().unwrap_or(Path::new(".")))
        .with_command(&command)
        .with_limits(ExecutionLimits {
            time_ms: 60_000, // 60 seconds for compilation
            memory_mb: 2048,
        });

    let result = execute_trusted(&spec)
        .await
        .context("Failed to run g++ compiler")?;

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

/// Compile user-submitted code (sandboxed)
pub async fn compile_user_code(
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

    debug!("Compiling user code with {:?} in sandbox", compile_cmd);

    compile_in_sandbox(
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
    // pub fn new(testlib_path: impl AsRef<Path>, cache_dir: impl AsRef<Path>) -> Self {
    pub fn new() -> Self {
        let _ = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/files/testlib.h"));

        let testlib_path = std::env::current_dir()
            .map(|cwd| cwd.join("files/testlib.h"))
            .unwrap_or_else(|_| PathBuf::from("files/testlib.h"));
        let cache_dir = "/tmp/checker_cache";

        Self {
            testlib_path,
            cache_dir: cache_dir.into(),
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
    pub fn new() -> Self {
        // CWD 기준 절대 경로로 변환
        let testlib_path = std::env::current_dir()
            .map(|cwd| cwd.join("files/testlib.h"))
            .unwrap_or_else(|_| PathBuf::from("files/testlib.h"));

        Self {
            testlib_path,
            cache_dir: "/tmp/validator_cache".into(),
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
            let result = compile_validator(&source_path, &binary_path, &self.testlib_path).await?;

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
