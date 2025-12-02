mod languages;
mod sandbox;
mod storage;

use anyhow::{Context, Result};
use redis::aio::MultiplexedConnection;
use redis::{cmd, AsyncCommands};
use serde::{Deserialize, Serialize};
use storage::StorageClient;
use tokio::task::JoinHandle;
use tokio::time::{sleep, Duration};
use tracing::{error, info, warn};

use crate::sandbox::Verdict;

/// Job received from the Redis queue
#[derive(Debug, Serialize, Deserialize)]
pub struct JudgeJob {
    pub submission_id: i64,
    pub problem_id: i64,
    pub code: String,
    pub language: String,
    pub time_limit: u32, // ms
    pub ignore_time_limit_bonus: bool,
    pub memory_limit: u32, // MB
    pub ignore_memory_limit_bonus: bool,
    pub testcases: Vec<TestcaseInfo>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TestcaseInfo {
    pub id: i64,
    pub input_path: String,
    pub output_path: String,
}

/// Result of judging a submission
#[derive(Debug, Serialize, Deserialize)]
pub struct JudgeResult {
    pub submission_id: i64,
    pub verdict: String,
    pub execution_time: Option<u32>,
    pub memory_used: Option<u32>,
    pub testcase_results: Vec<TestcaseResult>,
    /// Compile error / Runtime error message
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TestcaseResult {
    pub testcase_id: i64,
    pub verdict: String,
    pub execution_time: Option<u32>,
    pub memory_used: Option<u32>,
    /// 실제 프로그램 출력 (디버깅/보안 테스트용, 최대 4KB)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
}

const QUEUE_NAME: &str = "judge:queue";
const RESULT_CHANNEL: &str = "judge:results";
const RESULT_KEY_PREFIX: &str = "judge:result:";

const MAX_WORKERS: u32 = 10; // Maximum number of workers (0-9)
const WORKER_LEASE_TTL_SECS: u64 = 120; // Lease renewal window for worker_id claims

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env().add_directive("judge=info".parse()?),
        )
        .init();

    dotenvy::dotenv().ok();

    // Load language configurations
    let languages_path =
        std::env::var("LANGUAGES_CONFIG").unwrap_or_else(|_| "languages.toml".into());
    languages::init_languages(&languages_path)?;
    info!("Loaded language configurations from {}", languages_path);

    let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://localhost:6379".into());

    info!("Starting Judge Worker...");

    let client = redis::Client::open(redis_url.clone())?;
    let mut conn = get_redis_connection(&client).await?;
    info!("Connected to Redis at {}", redis_url);

    // Allocate unique worker_id from Redis with a lease (0 to MAX_WORKERS-1)
    let worker_id = allocate_worker_id(&client).await?;
    info!(
        "Allocated worker_id={} from Redis (lease {}s)",
        worker_id, WORKER_LEASE_TTL_SECS
    );

    // Initialize sandbox configuration with dynamic worker_id
    let sandbox_config = sandbox::init_sandbox_config_with_worker_id(worker_id);
    info!(
        "Sandbox config: worker_id={}, compile_time_limit={}ms, compile_memory_limit={}MB",
        sandbox_config.worker_id,
        sandbox_config.compile_time_limit_ms,
        sandbox_config.compile_memory_limit_mb
    );

    // Keep worker_id lease alive
    let _lease_handle = spawn_lease_heartbeat(client.clone(), worker_id);

    // Ensure we have cgroup support; fail fast otherwise
    sandbox::ensure_cgroups_available().await?;
    info!("Confirmed isolate cgroup support is available");

    // Initialize storage client
    let storage = StorageClient::from_env().await?;
    info!("Connected to MinIO storage");

    info!("Waiting for jobs...");

    // Box ID counter for this worker
    let mut box_id_counter: u32 = 0;

    loop {
        // Block and wait for a job from the queue (BLPOP)
        let result: Option<(String, String)> = match conn.blpop(QUEUE_NAME, 0.0).await {
            Ok(res) => res,
            Err(e) => {
                warn!("Redis BLPOP failed: {}. Attempting to reconnect...", e);
                conn = get_redis_connection(&client).await?;
                continue;
            }
        };

        if let Some((_, job_data)) = result {
            match serde_json::from_str::<JudgeJob>(&job_data) {
                Ok(job) => {
                    info!(
                        "Received job: submission_id={}, language={}",
                        job.submission_id, job.language
                    );

                    // Get base box ID counter for this job
                    let current_counter = box_id_counter;
                    box_id_counter = box_id_counter.wrapping_add(1);

                    match process_job(&job, &storage, current_counter).await {
                        Ok(result) => {
                            let result_json = match serde_json::to_string(&result) {
                                Ok(json) => json,
                                Err(e) => {
                                    error!(
                                        "Failed to serialize result for submission {}: {}",
                                        result.submission_id, e
                                    );
                                    continue;
                                }
                            };

                            // Store result in Redis for polling (expires in 1 hour)
                            let result_key =
                                format!("{}{}", RESULT_KEY_PREFIX, result.submission_id);
                            if let Err(e) = conn
                                .set_ex::<_, _, ()>(&result_key, &result_json, 3600)
                                .await
                            {
                                warn!("Redis set_ex failed: {}. Reconnecting and retrying...", e);
                                match get_redis_connection(&client).await {
                                    Ok(new_conn) => {
                                        conn = new_conn;
                                        if let Err(e) = conn
                                            .set_ex::<_, _, ()>(&result_key, &result_json, 3600)
                                            .await
                                        {
                                            error!("Redis set_ex retry failed for submission {}: {}. Result may be lost.", result.submission_id, e);
                                        }
                                    }
                                    Err(e) => {
                                        error!("Redis reconnection failed: {}. Result for submission {} may be lost.", e, result.submission_id);
                                    }
                                }
                            }

                            // Also publish to results channel (for real-time updates if subscribed)
                            if let Err(e) =
                                conn.publish::<_, _, ()>(RESULT_CHANNEL, &result_json).await
                            {
                                warn!("Redis publish failed: {}. Reconnecting and retrying...", e);
                                match get_redis_connection(&client).await {
                                    Ok(new_conn) => {
                                        conn = new_conn;
                                        if let Err(e) = conn
                                            .publish::<_, _, ()>(RESULT_CHANNEL, &result_json)
                                            .await
                                        {
                                            error!(
                                                "Redis publish retry failed for submission {}: {}",
                                                result.submission_id, e
                                            );
                                        }
                                    }
                                    Err(e) => {
                                        error!("Redis reconnection failed during publish: {}", e);
                                    }
                                }
                            }

                            info!(
                                "Job completed: submission_id={}, verdict={}",
                                result.submission_id, result.verdict
                            );
                        }
                        Err(e) => {
                            error!("Failed to process job {}: {}", job.submission_id, e);
                            // Send system error result
                            let error_result = JudgeResult {
                                submission_id: job.submission_id,
                                verdict: "system_error".into(),
                                execution_time: None,
                                memory_used: None,
                                testcase_results: vec![],
                                error_message: Some(format!("{:#}", e)),
                            };

                            let result_json = match serde_json::to_string(&error_result) {
                                Ok(json) => json,
                                Err(e) => {
                                    error!(
                                        "Failed to serialize error result for submission {}: {}",
                                        job.submission_id, e
                                    );
                                    continue;
                                }
                            };

                            // Store error result in Redis
                            let result_key = format!("{}{}", RESULT_KEY_PREFIX, job.submission_id);
                            if let Err(e) = conn
                                .set_ex::<_, _, ()>(&result_key, &result_json, 3600)
                                .await
                            {
                                warn!("Redis set_ex (error case) failed: {}. Reconnecting and retrying...", e);
                                match get_redis_connection(&client).await {
                                    Ok(new_conn) => {
                                        conn = new_conn;
                                        if let Err(e) = conn
                                            .set_ex::<_, _, ()>(&result_key, &result_json, 3600)
                                            .await
                                        {
                                            error!("Redis set_ex retry (error case) failed for submission {}: {}", job.submission_id, e);
                                        }
                                    }
                                    Err(e) => {
                                        error!("Redis reconnection (error case) failed: {}", e);
                                    }
                                }
                            }

                            if let Err(e) =
                                conn.publish::<_, _, ()>(RESULT_CHANNEL, &result_json).await
                            {
                                warn!("Redis publish (error case) failed: {}. Reconnecting and retrying...", e);

                                match get_redis_connection(&client).await {
                                    Ok(new_conn) => {
                                        conn = new_conn;
                                        if let Err(e) = conn
                                            .publish::<_, _, ()>(RESULT_CHANNEL, &result_json)
                                            .await
                                        {
                                            error!("Redis publish retry (error case) failed for submission {}: {}", job.submission_id, e);
                                        }
                                    }
                                    Err(e) => {
                                        error!("Redis reconnection (error case) failed during publish: {}", e);
                                    }
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    warn!("Failed to parse job data: {}", e);
                }
            }
        }
    }
}

async fn process_job(
    job: &JudgeJob,
    storage: &StorageClient,
    base_counter: u32,
) -> Result<JudgeResult> {
    let lang_config = languages::get_language_config(&job.language)
        .ok_or_else(|| anyhow::anyhow!("Unsupported language: {}", job.language))?;

    let temp_dir = tempfile::tempdir()?;
    let source_path = temp_dir.path().join(&lang_config.source_file);

    std::fs::write(&source_path, &job.code)?;

    if let Some(compile_cmd) = &lang_config.compile_command {
        let compile_box_id = sandbox::calculate_box_id(base_counter, 0);

        let compile_result = sandbox::compile_with_isolate(
            compile_box_id,
            &source_path,
            compile_cmd,
            temp_dir.path(),
        )
        .await?;

        if !compile_result.success {
            return Ok(JudgeResult {
                submission_id: job.submission_id,
                verdict: Verdict::CompileError.to_string(),
                execution_time: None,
                memory_used: None,
                testcase_results: vec![],
                error_message: compile_result.message,
            });
        }
    }

    let mut testcase_results = Vec::with_capacity(job.testcases.len());
    let mut overall_verdict = Verdict::Accepted;
    let mut max_time = 0u32;
    let mut max_memory = 0u32;

    for (idx, tc) in job.testcases.iter().enumerate() {
        let input_content = storage
            .download_string(&tc.input_path)
            .await
            .with_context(|| format!("Failed to download testcase input: {}", tc.input_path))?;

        let expected_output = storage
            .download_string(&tc.output_path)
            .await
            .with_context(|| format!("Failed to download testcase output: {}", tc.output_path))?;

        let tc_box_id = sandbox::calculate_box_id(base_counter, (idx as u32) + 1);

        let adjusted_time_limit = {
            if job.ignore_time_limit_bonus {
                job.time_limit
            } else {
                lang_config.calculate_time_limit(job.time_limit)
            }
        };
        let adjusted_memory_limit = {
            if job.ignore_memory_limit_bonus {
                job.memory_limit
            } else {
                lang_config.calculate_memory_limit(job.memory_limit)
            }
        };

        let run_result = sandbox::run_with_isolate(
            tc_box_id,
            temp_dir.path(),
            &lang_config.run_command,
            &input_content,
            &expected_output,
            adjusted_time_limit,
            adjusted_memory_limit,
        )
        .await?;

        let output_preview = if run_result.output.is_empty() {
            None
        } else {
            let truncated: String = run_result.output.chars().take(4096).collect();
            Some(truncated)
        };

        max_time = max_time.max(run_result.time_ms);
        max_memory = max_memory.max(run_result.memory_kb);

        let tc_result = TestcaseResult {
            testcase_id: tc.id,
            verdict: run_result.verdict.to_string(),
            execution_time: Some(run_result.time_ms),
            memory_used: Some(run_result.memory_kb),
            output: output_preview,
        };

        testcase_results.push(tc_result);

        if run_result.verdict != Verdict::Accepted && overall_verdict == Verdict::Accepted {
            overall_verdict = run_result.verdict;
            break;
        }
    }

    // 조기 종료 되었을 경우 나머지 테스트 케이스는 스킵 처리
    for i in (testcase_results.len())..(job.testcases.len()) {
        let tc_result = TestcaseResult {
            testcase_id: job.testcases[i].id,
            verdict: Verdict::Skipped.to_string(),
            execution_time: None,
            memory_used: None,
            output: None,
        };

        testcase_results.push(tc_result);
    }

    info!(
        "Job summary: submission_id={}, verdict={}, max_time_ms={}, max_memory_kb={}",
        job.submission_id,
        overall_verdict.to_string(),
        max_time,
        max_memory
    );

    let execution_time = if overall_verdict == Verdict::Accepted {
        Some(max_time)
    } else {
        None
    };
    let memory_used = if overall_verdict == Verdict::Accepted {
        Some(max_memory)
    } else {
        None
    };

    Ok(JudgeResult {
        submission_id: job.submission_id,
        verdict: overall_verdict.to_string(),
        execution_time,
        memory_used,
        testcase_results,
        error_message: None,
    })
}

async fn allocate_worker_id(client: &redis::Client) -> Result<u32> {
    loop {
        let mut conn = get_redis_connection(client).await?;
        for worker_id in 0..MAX_WORKERS {
            let key = worker_lease_key(worker_id);
            let claimed: Option<String> = cmd("SET")
                .arg(&key)
                .arg("claimed")
                .arg("NX")
                .arg("EX")
                .arg(WORKER_LEASE_TTL_SECS as usize)
                .query_async(&mut conn)
                .await?;

            if claimed.is_some() {
                return Ok(worker_id);
            }
        }

        warn!(
            "No free worker_id (0-{}). Retrying in 1 second...",
            MAX_WORKERS - 1
        );
        sleep(Duration::from_secs(1)).await;
    }
}

fn worker_lease_key(worker_id: u32) -> String {
    format!("judge:worker:lease:{}", worker_id)
}

fn spawn_lease_heartbeat(client: redis::Client, worker_id: u32) -> JoinHandle<()> {
    tokio::spawn(async move {
        loop {
            sleep(Duration::from_secs(WORKER_LEASE_TTL_SECS / 2)).await;
            match get_redis_connection(&client).await {
                Ok(mut conn) => {
                    let key = worker_lease_key(worker_id);
                    if let Err(e) = cmd("EXPIRE")
                        .arg(&key)
                        .arg(WORKER_LEASE_TTL_SECS as usize)
                        .query_async::<()>(&mut conn)
                        .await
                    {
                        warn!("Failed to refresh worker_id lease {}: {}", worker_id, e);
                    }
                }
                Err(e) => {
                    warn!(
                        "Failed to refresh worker_id lease {} (connection): {}",
                        worker_id, e
                    );
                }
            }
        }
    })
}

async fn get_redis_connection(client: &redis::Client) -> Result<MultiplexedConnection> {
    loop {
        match client.get_multiplexed_async_connection().await {
            Ok(conn) => return Ok(conn),
            Err(e) => {
                warn!(
                    "Failed to connect to Redis: {}. Retrying in 3 seconds...",
                    e
                );
                sleep(Duration::from_secs(3)).await;
            }
        }
    }
}
