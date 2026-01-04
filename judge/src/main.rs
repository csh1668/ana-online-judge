mod anigma;
mod checker;
mod compiler;
mod executer;
mod judger;
mod languages;
mod playground;
mod redis_manager;
mod sandbox;
mod storage;
mod utils;
mod validator;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use storage::StorageClient;
use tracing::{error, info};

use crate::anigma::{
    process_anigma_job, process_anigma_task1_job, AnigmaJudgeJob, AnigmaJudgeResult,
    AnigmaTask1JudgeJob,
};
use crate::checker::{CheckerManager, Verdict};
use crate::judger::{process_judge_job, JudgeJob, JudgeResult};
use crate::playground::{process_playground_job, PlaygroundJob, PlaygroundResult};
use crate::redis_manager::RedisManager;
use crate::validator::{process_validate_job, ValidateJob, ValidateResult, ValidatorManager};

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
    /// Anigma Task 2 Judge Job (ZIP 제출)
    #[serde(rename = "anigma")]
    Anigma(AnigmaJudgeJob),
    /// Anigma Task 1 Judge Job (input 파일 제출)
    #[serde(rename = "anigma_task1")]
    AnigmaTask1(AnigmaTask1JudgeJob),
    /// Playground execution job
    #[serde(rename = "playground")]
    Playground(PlaygroundJob),
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

                let result =
                    match process_judge_job(&job, &storage, &checker_manager, &mut redis).await {
                        Ok(result) => result,
                        Err(e) => {
                            error!("Failed to process judge job {}: {}", job.submission_id, e);
                            JudgeResult::system_error(job.submission_id, format!("{:#}", e))
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
                        ValidateResult::failed(job.problem_id, format!("{:#}", e))
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
            WorkerJob::Anigma(job) => {
                info!(
                    "Received anigma task2 job: submission_id={}, problem_id={}",
                    job.submission_id, job.problem_id
                );

                let result = match process_anigma_job(&job, &storage).await {
                    Ok(result) => result,
                    Err(e) => {
                        error!("Failed to process anigma job {}: {}", job.submission_id, e);
                        AnigmaJudgeResult::system_error(job.submission_id, format!("{:#}", e))
                    }
                };

                if let Err(e) = redis.store_anigma_result(&result).await {
                    error!("Failed to store anigma result: {}", e);
                }

                info!(
                    "Anigma task2 job completed: submission_id={}, verdict={}",
                    result.base.submission_id, result.base.verdict
                );
            }
            WorkerJob::AnigmaTask1(job) => {
                info!(
                    "Received anigma task1 job: submission_id={}, problem_id={}",
                    job.submission_id, job.problem_id
                );

                let result = match process_anigma_task1_job(&job, &storage).await {
                    Ok(result) => result,
                    Err(e) => {
                        error!(
                            "Failed to process anigma task1 job {}: {}",
                            job.submission_id, e
                        );
                        JudgeResult::system_error(job.submission_id, format!("{:#}", e))
                    }
                };

                if let Err(e) = redis.store_judge_result(&result).await {
                    error!("Failed to store anigma task1 result: {}", e);
                }

                info!(
                    "Anigma task1 job completed: submission_id={}, verdict={}",
                    result.submission_id, result.verdict
                );
            }
            WorkerJob::Playground(job) => {
                info!(
                    "Received playground job: session_id={}, target={}",
                    job.session_id, job.target_path
                );

                let result = match process_playground_job(&job).await {
                    Ok(result) => result,
                    Err(e) => {
                        error!("Failed to process playground job {}: {}", job.session_id, e);
                        PlaygroundResult {
                            session_id: job.session_id.clone(),
                            success: false,
                            stdout: String::new(),
                            stderr: format!("Internal server error: {:#}", e),
                            exit_code: 1,
                            time_ms: 0,
                            memory_kb: 0,
                            compile_output: None,
                            created_files: vec![],
                        }
                    }
                };

                // Store result using the key provided in the job
                if let Err(e) = redis
                    .store_playground_result(&job.result_key, &result)
                    .await
                {
                    error!("Failed to store playground result: {}", e);
                }

                info!(
                    "Playground job completed: session_id={}, success={}",
                    result.session_id, result.success
                );
            }
        }
    }
}
