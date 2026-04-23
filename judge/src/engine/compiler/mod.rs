//! Compiler module - Source code compilation
//!
//! This module provides compilation functionality:
//! - User code compilation (sandboxed)
//! - Trusted code compilation (checkers, validators)
//!
//! The compiler module uses the sandbox module directly for sandboxed compilation.

pub mod include_flags;

use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use tracing::{debug, info};

use crate::engine::executer::{execute_sandboxed, ExecutionLimits, ExecutionSpec, ExecutionStatus};

/// Result of compiling a trusted program (checker/validator)
#[derive(Debug)]
pub struct TrustedCompileResult {
    pub stderr: String,
    pub success: bool,
}

/// Compile a C++ source file (for trusted components: checkers, validators) inside the sandbox.
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

    for include_path in include_paths {
        command.push(format!("-I{}", include_path.display()));
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

/// Compile source code inside the sandbox.
///
/// `compile_cmd` may contain the placeholder token `{include_flags}` which will
/// be substituted with the language-appropriate include flags (see
/// [`include_flags::format_include_flags`]). If the placeholder does not
/// appear, `include_dirs` is ignored for CLI flags — but env vars from
/// [`IncludeFlags::env_vars`] are **always** forwarded to the sandbox (for
/// Python / JavaScript).
///
/// Passing an empty `include_dirs` slice preserves the pre-workshop behavior
/// byte-for-byte.
pub async fn compile_in_sandbox(
    source_dir: &Path,
    compile_cmd: &[String],
    time_limit_ms: u32,
    memory_limit_mb: u32,
    language: &str,
    include_dirs: &[PathBuf],
) -> Result<CompileResult> {
    if compile_cmd.is_empty() {
        return Ok(CompileResult {
            success: true,
            message: None,
        });
    }

    let flags = include_flags::format_include_flags(language, include_dirs);
    let flag_fragment = flags.to_template_fragment();

    // Substitute `{include_flags}` placeholder in every token. Tokens that
    // don't contain the placeholder are untouched.
    let substituted: Vec<String> = compile_cmd
        .iter()
        .flat_map(|tok| {
            if tok == "{include_flags}" {
                // Whole-token placeholder: expand into multiple tokens.
                flags.tokens.clone()
            } else if tok.contains("{include_flags}") {
                // Embedded: string-replace (works for languages.toml single-quoted templates).
                vec![tok.replace("{include_flags}", &flag_fragment)]
            } else {
                vec![tok.clone()]
            }
        })
        .collect();

    debug!(
        "Compiling with {:?} (language={}, include_dirs={:?}) inside isolate sandbox",
        substituted, language, include_dirs
    );

    let spec = ExecutionSpec::new(source_dir)
        .with_command(&substituted)
        .with_limits(ExecutionLimits {
            time_ms: time_limit_ms,
            memory_mb: memory_limit_mb,
        })
        .with_env_vars(flags.env_vars.clone())
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
                ExecutionStatus::Signaled(_) => "Compiler crashed".to_string(),
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

/// Compile user code directly on the judge container host (bypassing isolate).
///
/// This exists for languages whose compilers are fundamentally incompatible
/// with isolate's namespace setup — specifically .NET: the dotnet host's
/// lazy assembly-loader (MSBuild, Roslyn csc) fails to resolve framework
/// assemblies like `System.Private.Xml` inside an isolate box even though
/// every required file is mounted. The judge container itself is the
/// security boundary; the caller is responsible for locking down the
/// toolchain config (see `files/csharp-template/` — NuGet.Config clears
/// package sources and csproj disables analyzers/source-generators) so
/// user submissions can't execute arbitrary code at compile time.
///
/// Output artifacts are left in `source_dir` (the compile wrapper's CWD).
/// Execution still happens inside isolate normally.
pub async fn compile_on_host(
    source_dir: &Path,
    compile_cmd: &[String],
    time_limit_ms: u32,
) -> Result<CompileResult> {
    use std::time::Duration;
    use tokio::process::Command;
    use tokio::time::timeout;

    if compile_cmd.is_empty() {
        return Ok(CompileResult {
            success: true,
            message: None,
        });
    }

    debug!(
        "Compiling on host (isolate bypassed) with {:?} in {:?}",
        compile_cmd, source_dir
    );

    let mut cmd = Command::new(&compile_cmd[0]);
    cmd.args(&compile_cmd[1..]);
    cmd.current_dir(source_dir);
    cmd.env_clear();
    cmd.env(
        "PATH",
        "/usr/local/cargo/bin:/usr/local/go/bin:/usr/local/bin:/usr/bin:/bin",
    );
    cmd.env("HOME", source_dir);
    cmd.env("LANG", "en_US.UTF-8");
    cmd.env("LC_ALL", "en_US.UTF-8");
    cmd.env("DOTNET_ROOT", "/usr/share/dotnet");
    cmd.env("DOTNET_CLI_TELEMETRY_OPTOUT", "1");
    cmd.env("DOTNET_NOLOGO", "1");
    cmd.env("DOTNET_SKIP_FIRST_TIME_EXPERIENCE", "1");

    // Generous wall-clock buffer — compile-phase timeout is already the
    // per-submission compile budget; add a fixed slack for process startup.
    let deadline = Duration::from_millis(time_limit_ms as u64 + 10_000);

    let output = match timeout(deadline, cmd.output()).await {
        Ok(r) => r.context("Failed to spawn host compiler")?,
        Err(_) => {
            return Ok(CompileResult {
                success: false,
                message: Some("Compilation timed out".to_string()),
            });
        }
    };

    if output.status.success() {
        Ok(CompileResult {
            success: true,
            message: None,
        })
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let msg = if !stderr.trim().is_empty() {
            stderr.into_owned()
        } else if !stdout.trim().is_empty() {
            stdout.into_owned()
        } else {
            format!(
                "Compilation failed with exit code {:?}",
                output.status.code()
            )
        };
        Ok(CompileResult {
            success: false,
            message: Some(msg),
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

            // Stage testlib.h alongside the source so the sandbox box has it
            // visible on its include path. Per compile_trusted_cpp's contract,
            // `&[Path::new(".")]` resolves to the box work_dir = comp_dir.
            if self.testlib_path.exists() {
                tokio::fs::copy(&self.testlib_path, comp_dir.join("testlib.h")).await?;
            }

            info!("Compiling {} for problem {}", self.name, problem_id);
            let result = compile_trusted_cpp(&source_path, &binary_path, &[Path::new(".")]).await?;

            if !result.success {
                anyhow::bail!("Failed to compile {}: {}", self.name, result.stderr);
            }

            info!("{} compiled successfully: {:?}", self.name, binary_path);
        }

        Ok(binary_path)
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
}
