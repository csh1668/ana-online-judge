//! `workshop_validate` — run a validator against a testcase input.

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
pub struct WorkshopValidateJob {
    pub job_id: String,
    pub problem_id: i64,
    pub user_id: i64,
    pub testcase_id: i64,
    /// Per spec §5 must be `"cpp"` or `"python"`.
    pub language: String,
    pub validator_source_path: String,
    pub input_path: String,
    #[serde(default)]
    pub resources: Vec<WorkshopResource>,
    pub time_limit_ms: u32,
    pub memory_limit_mb: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WorkshopValidateResult {
    pub job_id: String,
    pub problem_id: i64,
    pub testcase_id: i64,
    pub valid: bool,
    pub message: Option<String>,
    pub exit_code: i32,
    pub compile_message: Option<String>,
}

impl WorkshopValidateResult {
    pub fn system_error(job_id: String, problem_id: i64, testcase_id: i64, err: String) -> Self {
        Self {
            job_id,
            problem_id,
            testcase_id,
            valid: false,
            message: Some(err),
            exit_code: -1,
            compile_message: None,
        }
    }
}

pub async fn process_workshop_validate_job(
    job: &WorkshopValidateJob,
    storage: &StorageClient,
) -> Result<WorkshopValidateResult> {
    info!(
        "Processing workshop_validate: job_id={}, problem={}, tc_id={}, lang={}",
        job.job_id, job.problem_id, job.testcase_id, job.language
    );

    // Spec §5: only cpp / python allowed.
    let lang_lower = job.language.to_lowercase();
    if !matches!(
        lang_lower.as_str(),
        "cpp" | "c++" | "python" | "py" | "python3"
    ) {
        return Ok(WorkshopValidateResult::system_error(
            job.job_id.clone(),
            job.problem_id,
            job.testcase_id,
            format!(
                "Validator language must be cpp or python (got: {})",
                job.language
            ),
        ));
    }

    let lang_config = match languages::get_language_config(&job.language) {
        Some(c) => c,
        None => {
            return Ok(WorkshopValidateResult::system_error(
                job.job_id.clone(),
                job.problem_id,
                job.testcase_id,
                format!("Unknown language: {}", job.language),
            ));
        }
    };

    let temp_dir = tempfile::tempdir().context("Failed to create temp dir")?;
    let work_dir = temp_dir.path();

    // Fetch validator source
    let src_bytes = storage
        .download(&job.validator_source_path)
        .await
        .with_context(|| {
            format!(
                "Failed to download validator: {}",
                job.validator_source_path
            )
        })?;
    let src_path = work_dir.join(&lang_config.source_file);
    tokio::fs::write(&src_path, &src_bytes).await?;

    // Fetch resources (testlib.h etc.) → work_dir root (flat).
    fetch_resources_into(
        storage,
        work_dir,
        &job.resources,
        &[lang_config.source_file.as_str()],
    )
    .await
    .context("Failed to fetch resources")?;

    // Compile if needed
    if let Some(compile_cmd) = &lang_config.compile_command {
        let cfg = get_config();
        let include_dirs = vec![std::path::PathBuf::from(".")];

        // Compile cache. Java is skipped (multiple .class files).
        // Python's compile_command emits __pycache__ artifacts that aren't
        // a single binary — also skipped. Only true compiled languages
        // (C/C++/Rust/Go) cache here.
        let lang_lc = job.language.to_lowercase();
        let cache_eligible =
            lang_lc != "java" && !matches!(lang_lc.as_str(), "python" | "py" | "python3");
        let bin_path = work_dir.join("Main");
        let cache_hash = if cache_eligible {
            let mut resources = super::compile_cache::read_resource_files(work_dir).await?;
            resources.retain(|(name, _)| name != &lang_config.source_file);
            Some(super::compile_cache::compute_hash(
                &src_bytes,
                &resources,
                &job.language,
                compile_cmd,
            ))
        } else {
            None
        };

        let cache_hit = if let Some(h) = &cache_hash {
            super::compile_cache::try_restore("validator", h, &bin_path).await?
        } else {
            false
        };

        if !cache_hit {
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
                return Ok(WorkshopValidateResult {
                    job_id: job.job_id.clone(),
                    problem_id: job.problem_id,
                    testcase_id: job.testcase_id,
                    valid: false,
                    message: compile_result.message.clone(),
                    exit_code: -1,
                    compile_message: compile_result.message,
                });
            }
            if let Some(h) = &cache_hash {
                super::compile_cache::save("validator", h, &bin_path).await;
            }
        }
    }

    // Download testcase input to feed as stdin
    let input_content = storage
        .download_string(&job.input_path)
        .await
        .with_context(|| format!("Failed to download input: {}", job.input_path))?;

    // Build run command (run_command is e.g. ["./Main"] for cpp, ["python3", "-W", "ignore", "Main.py"] for python).
    let run_cmd: Vec<String> = lang_config.run_command.clone();

    let include_dirs = vec![std::path::PathBuf::from(".")];
    let runtime_flags =
        crate::engine::compiler::include_flags::format_include_flags(&job.language, &include_dirs);

    let spec = ExecutionSpec::new(work_dir)
        .with_command(&run_cmd)
        .with_limits(ExecutionLimits {
            time_ms: job.time_limit_ms,
            memory_mb: job.memory_limit_mb,
        })
        .with_stdin(&input_content)
        .with_env_vars(runtime_flags.env_vars);

    let outcome = execute_sandboxed(&spec)
        .await
        .context("Failed to run validator in sandbox")?;

    // Validator is judged by exit code: 0 = valid, anything else = invalid (testlib convention).
    let (valid, exit_code) = match outcome.status {
        ExecutionStatus::Exited(0) => (true, 0),
        ExecutionStatus::Exited(code) => (false, code),
        _ => (false, -1),
    };

    let message = if !outcome.stderr.is_empty() {
        Some(outcome.stderr.trim().to_string())
    } else if !valid && !outcome.stdout.is_empty() {
        // Fallback — some validators write to stdout
        Some(outcome.stdout.trim().chars().take(2048).collect::<String>())
    } else {
        None
    };

    if !valid {
        warn!(
            "workshop_validate failed: job_id={}, exit_code={}, msg={:?}",
            job.job_id, exit_code, message
        );
    }

    Ok(WorkshopValidateResult {
        job_id: job.job_id.clone(),
        problem_id: job.problem_id,
        testcase_id: job.testcase_id,
        valid,
        message,
        exit_code,
        compile_message: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serde_roundtrip_job() {
        let job = WorkshopValidateJob {
            job_id: "v1".into(),
            problem_id: 10,
            user_id: 3,
            testcase_id: 99,
            language: "cpp".into(),
            validator_source_path: "workshop/10/drafts/3/validator.cpp".into(),
            input_path: "workshop/10/drafts/3/testcases/testcase_1.input.txt".into(),
            resources: vec![],
            time_limit_ms: 30_000,
            memory_limit_mb: 1024,
        };
        let json = serde_json::to_string(&job).unwrap();
        let back: WorkshopValidateJob = serde_json::from_str(&json).unwrap();
        assert_eq!(back.testcase_id, 99);
    }

    #[test]
    fn serde_roundtrip_result() {
        let r = WorkshopValidateResult {
            job_id: "r1".into(),
            problem_id: 10,
            testcase_id: 99,
            valid: false,
            message: Some("n must be >= 1".into()),
            exit_code: 3,
            compile_message: None,
        };
        let json = serde_json::to_string(&r).unwrap();
        let back: WorkshopValidateResult = serde_json::from_str(&json).unwrap();
        assert!(!back.valid);
        assert_eq!(back.exit_code, 3);
    }
}
