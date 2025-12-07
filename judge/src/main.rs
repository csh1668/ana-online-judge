mod checker;
mod compiler;
mod executer;
mod judger;
mod languages;
mod redis_manager;
mod sandbox;
mod storage;
mod validator;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use storage::StorageClient;
use tracing::{error, info};

use crate::checker::CheckerManager;
use crate::judger::{process_judge_job, JudgeJob, JudgeResult};
use crate::redis_manager::RedisManager;
use crate::validator::{process_validate_job, ValidateJob, ValidatorManager};

/// Worker job enum - represents different types of jobs the worker can process
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "job_type")]
pub enum WorkerJob {
    /// Judge a user submission
    #[serde(rename = "judge")]
    Judge(JudgeJob),
    /// Validate testcases
    #[serde(rename = "validate")]
    Validate(ValidateJob),
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env().add_directive("judge=info".parse()?),
        )
        .init();

    dotenvy::dotenv().ok();

    languages::init_languages()?;
    info!("Loaded language configurations");

    // Initialize Redis manager (connects, allocates worker_id, starts heartbeat)
    let mut redis = RedisManager::from_env().await?;
    let worker_id = redis.worker_id();

    // Initialize sandbox configuration with dynamic worker_id
    sandbox::init_config(worker_id)?;
    sandbox::ensure_cgroups_available().await?;

    let storage = StorageClient::from_env().await?;
    info!("Connected to MinIO storage");

    let checker_manager = CheckerManager::new();
    info!("Checker manager initialized");
    let validator_manager = ValidatorManager::new();
    info!("Validator manager initialized");

    info!("Waiting for jobs...");

    loop {
        let job = redis.pop_job().await?;

        match job {
            WorkerJob::Judge(job) => {
                info!(
                    "Received judge job: submission_id={}, language={}",
                    job.submission_id, job.language
                );

                let result = match process_judge_job(&job, &storage, &checker_manager).await {
                    Ok(result) => result,
                    Err(e) => {
                        error!("Failed to process judge job {}: {}", job.submission_id, e);
                        JudgeResult {
                            submission_id: job.submission_id,
                            verdict: "system_error".into(),
                            execution_time: None,
                            memory_used: None,
                            testcase_results: vec![],
                            error_message: Some(format!("{:#}", e)),
                        }
                    }
                };

                if let Err(e) = redis.store_judge_result(&result).await {
                    error!("Failed to store judge result: {}", e);
                }

                info!(
                    "Judge job completed: submission_id={}, verdict={}",
                    result.submission_id, result.verdict
                );
            }
            WorkerJob::Validate(job) => {
                info!(
                    "Received validate job: problem_id={}, testcases={}",
                    job.problem_id,
                    job.testcase_inputs.len()
                );

                let result = match process_validate_job(&job, &storage, &validator_manager).await {
                    Ok(result) => result,
                    Err(e) => {
                        error!(
                            "Failed to process validate job for problem {}: {}",
                            job.problem_id, e
                        );
                        validator::ValidateResult {
                            problem_id: job.problem_id,
                            success: false,
                            testcase_results: vec![],
                            error_message: Some(format!("{:#}", e)),
                        }
                    }
                };

                if let Err(e) = redis.store_validate_result(&result).await {
                    error!(
                        "Failed to store validation result for problem {}: {}",
                        result.problem_id, e
                    );
                }

                info!(
                    "Validate job completed: problem_id={}, success={}",
                    result.problem_id, result.success
                );
            }
        }
    }
}
