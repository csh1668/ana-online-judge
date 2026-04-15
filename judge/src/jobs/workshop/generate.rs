//! `workshop_generate` — run a generator to produce testcase input.
//!
//! Seed auto-injection (per spec §6): the `seed` field (problem-level hex) is
//! **always appended** to `args` before invocation.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

use crate::core::languages;
use crate::engine::compiler::compile_in_sandbox;
use crate::engine::executer::{execute_sandboxed, ExecutionLimits, ExecutionSpec, ExecutionStatus};
use crate::engine::sandbox::get_config;
use crate::infra::storage::StorageClient;

use super::{fetch_resources_into, WorkshopResource};

#[derive(Debug, Serialize, Deserialize)]
pub struct WorkshopGenerateJob {
    pub job_id: String,
    pub problem_id: i64,
    pub user_id: i64,
    pub testcase_index: i32,
    pub language: String,
    pub source_path: String,
    pub args: Vec<String>,
    pub seed: String,
    #[serde(default)]
    pub resources: Vec<WorkshopResource>,
    pub output_path: String,
    pub time_limit_ms: u32,
    pub memory_limit_mb: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WorkshopGenerateResult {
    pub job_id: String,
    pub problem_id: i64,
    pub testcase_index: i32,
    pub success: bool,
    pub output_path: Option<String>,
    pub stdout_preview: Option<String>,
    pub stderr: String,
    pub exit_code: i32,
    pub time_ms: u32,
    pub memory_kb: u32,
    pub compile_message: Option<String>,
}

impl WorkshopGenerateResult {
    pub fn system_error(job_id: String, problem_id: i64, testcase_index: i32, err: String) -> Self {
        Self {
            job_id,
            problem_id,
            testcase_index,
            success: false,
            output_path: None,
            stdout_preview: None,
            stderr: err,
            exit_code: -1,
            time_ms: 0,
            memory_kb: 0,
            compile_message: None,
        }
    }
}

const STDOUT_PREVIEW_BYTES: usize = 4096;

pub async fn process_workshop_generate_job(
    job: &WorkshopGenerateJob,
    storage: &StorageClient,
) -> Result<WorkshopGenerateResult> {
    info!(
        "Processing workshop_generate: job_id={}, problem={}, tc_index={}, lang={}",
        job.job_id, job.problem_id, job.testcase_index, job.language
    );

    let lang_config = match languages::get_language_config(&job.language) {
        Some(c) => c,
        None => {
            return Ok(WorkshopGenerateResult::system_error(
                job.job_id.clone(),
                job.problem_id,
                job.testcase_index,
                format!("Unsupported generator language: {}", job.language),
            ));
        }
    };

    // 1. Prepare work dir: temp dir + source file + flat resources at root.
    let temp_dir = tempfile::tempdir().context("Failed to create temp dir")?;
    let work_dir = temp_dir.path();

    // Download generator source → work_dir/<source_file>
    let source_bytes = storage
        .download(&job.source_path)
        .await
        .with_context(|| format!("Failed to download generator source: {}", job.source_path))?;
    let source_path = work_dir.join(&lang_config.source_file);
    tokio::fs::write(&source_path, &source_bytes)
        .await
        .with_context(|| format!("Failed to write generator source to {:?}", source_path))?;

    // Fetch all workshop resources → work_dir root (flat).
    fetch_resources_into(storage, work_dir, &job.resources)
        .await
        .context("Failed to fetch workshop resources")?;

    // 2. Compile (if compile_command present).
    if let Some(compile_cmd) = &lang_config.compile_command {
        let cfg = get_config();

        // Resources live flat in work_dir root, which is mounted as the
        // sandbox box's /box. Include path is therefore `.`.
        let include_dirs = vec![std::path::PathBuf::from(".")];

        let compile_result = compile_in_sandbox(
            work_dir,
            compile_cmd,
            cfg.compile_time_limit_ms,
            cfg.compile_memory_limit_mb,
            &job.language,
            &include_dirs,
        )
        .await?;

        if !compile_result.success {
            return Ok(WorkshopGenerateResult {
                job_id: job.job_id.clone(),
                problem_id: job.problem_id,
                testcase_index: job.testcase_index,
                success: false,
                output_path: None,
                stdout_preview: None,
                stderr: String::new(),
                exit_code: -1,
                time_ms: 0,
                memory_kb: 0,
                compile_message: compile_result.message,
            });
        }
    }

    // 3. Build run command: lang_config.run_command + user args + seed.
    //    Also inject include_flags env vars for Python/JS (at runtime only
    //    those are needed; compiled languages already embedded them).
    let mut run_cmd: Vec<String> = lang_config.run_command.clone();
    run_cmd.extend(job.args.iter().cloned());
    run_cmd.push(job.seed.clone());

    let include_dirs = vec![std::path::PathBuf::from(".")];
    let runtime_flags =
        crate::engine::compiler::include_flags::format_include_flags(&job.language, &include_dirs);

    // 4. Execute in sandbox.
    let spec = ExecutionSpec::new(work_dir)
        .with_command(&run_cmd)
        .with_limits(ExecutionLimits {
            time_ms: job.time_limit_ms,
            memory_mb: job.memory_limit_mb,
        })
        .with_env_vars(runtime_flags.env_vars);

    let outcome = execute_sandboxed(&spec)
        .await
        .context("Failed to run generator in sandbox")?;

    // Normalize verdict fields.
    let (success, exit_code) = match outcome.status {
        ExecutionStatus::Exited(0) => (true, 0),
        ExecutionStatus::Exited(code) => (false, code),
        ExecutionStatus::TimeLimitExceeded => (false, -1),
        ExecutionStatus::MemoryLimitExceeded => (false, -1),
        ExecutionStatus::Signaled(sig) => (false, -(sig.abs())),
        ExecutionStatus::SystemError => (false, -1),
    };

    let stdout_preview = if outcome.stdout.is_empty() {
        None
    } else {
        Some(
            outcome
                .stdout
                .chars()
                .take(STDOUT_PREVIEW_BYTES)
                .collect::<String>(),
        )
    };

    // 5. On success, upload stdout as the testcase input.
    let output_path = if success {
        // Upload raw bytes to preserve binary-accurate content if any.
        if let Err(e) = storage
            .upload(&job.output_path, outcome.stdout_bytes.clone())
            .await
        {
            warn!("Failed to upload generator output: {:#}", e);
            return Ok(WorkshopGenerateResult {
                job_id: job.job_id.clone(),
                problem_id: job.problem_id,
                testcase_index: job.testcase_index,
                success: false,
                output_path: None,
                stdout_preview,
                stderr: format!("Failed to upload output: {:#}", e),
                exit_code,
                time_ms: outcome.time_ms,
                memory_kb: outcome.memory_kb,
                compile_message: None,
            });
        }
        Some(job.output_path.clone())
    } else {
        None
    };

    Ok(WorkshopGenerateResult {
        job_id: job.job_id.clone(),
        problem_id: job.problem_id,
        testcase_index: job.testcase_index,
        success,
        output_path,
        stdout_preview,
        stderr: outcome.stderr,
        exit_code,
        time_ms: outcome.time_ms,
        memory_kb: outcome.memory_kb,
        compile_message: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serde_roundtrip_job() {
        let job = WorkshopGenerateJob {
            job_id: "abc".into(),
            problem_id: 1,
            user_id: 2,
            testcase_index: 3,
            language: "cpp".into(),
            source_path: "workshop/1/drafts/2/generators/gen.cpp".into(),
            args: vec!["10".into(), "20".into()],
            seed: "a3f7c2".into(),
            resources: vec![WorkshopResource {
                name: "testlib.h".into(),
                storage_path: "workshop/1/drafts/2/resources/testlib.h".into(),
            }],
            output_path: "workshop/1/drafts/2/testcases/testcase_3.input.txt".into(),
            time_limit_ms: 30_000,
            memory_limit_mb: 1024,
        };
        let json = serde_json::to_string(&job).unwrap();
        let back: WorkshopGenerateJob = serde_json::from_str(&json).unwrap();
        assert_eq!(back.job_id, "abc");
        assert_eq!(back.args.len(), 2);
        assert_eq!(back.seed, "a3f7c2");
    }

    #[test]
    fn serde_roundtrip_result_success() {
        let r = WorkshopGenerateResult {
            job_id: "x".into(),
            problem_id: 1,
            testcase_index: 1,
            success: true,
            output_path: Some("key".into()),
            stdout_preview: Some("out".into()),
            stderr: String::new(),
            exit_code: 0,
            time_ms: 10,
            memory_kb: 1000,
            compile_message: None,
        };
        let json = serde_json::to_string(&r).unwrap();
        let back: WorkshopGenerateResult = serde_json::from_str(&json).unwrap();
        assert!(back.success);
        assert_eq!(back.time_ms, 10);
    }

    #[test]
    fn system_error_helper_marks_failure() {
        let r = WorkshopGenerateResult::system_error("j".into(), 1, 2, "boom".into());
        assert!(!r.success);
        assert_eq!(r.stderr, "boom");
        assert!(r.output_path.is_none());
    }
}
