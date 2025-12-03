mod checker;
mod compiler;
mod languages;
mod runner;
mod sandbox;
mod storage;
mod validator;

use anyhow::{Context, Result};
use redis::aio::MultiplexedConnection;
use redis::{cmd, AsyncCommands};
use serde::{Deserialize, Serialize};
use storage::StorageClient;
use tokio::task::JoinHandle;
use tokio::time::{sleep, Duration};
use tracing::{error, info, warn};

use crate::checker::{CheckerManager, Verdict, DEFAULT_CHECKER_TIMEOUT_SECS};
use crate::compiler::compile_in_sandbox;
use crate::runner::sandboxed::SandboxedRunner;
use crate::runner::{CommandSpec, RunLimits, RunStatus};
use crate::sandbox::{calculate_box_id, get_config, init_config_with_worker_id};
use crate::validator::{
    process_validate_job, store_validate_result, ValidateJob, ValidatorManager,
};

/// Problem type enum for judging strategy
#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ProblemType {
    #[default]
    Icpc,
    SpecialJudge,
}

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
    /// Problem type (icpc or special_judge)
    #[serde(default)]
    pub problem_type: ProblemType,
    /// Checker source path in MinIO (for special_judge)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checker_path: Option<String>,
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
        std::env::var("LANGUAGES_CONFIG").unwrap_or_else(|_| "./files/languages.toml".into());
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
    let sandbox_config = init_config_with_worker_id(worker_id);
    info!(
        "Sandbox config: worker_id={}",
        sandbox_config.worker_id,
    );

    // Keep worker_id lease alive
    let _lease_handle = spawn_lease_heartbeat(client.clone(), worker_id);

    // Ensure we have cgroup support; fail fast otherwise
    sandbox::ensure_cgroups_available().await?;
    info!("Confirmed isolate cgroup support is available");

    // Initialize storage client
    let storage = StorageClient::from_env().await?;
    info!("Connected to MinIO storage");

    // Initialize checker manager
    let testlib_path = std::env::var("TESTLIB_PATH").unwrap_or_else(|_| "./files/testlib.h".into());
    let checker_cache_dir =
        std::env::var("CHECKER_CACHE_DIR").unwrap_or_else(|_| "/tmp/checker_cache".into());
    let checker_manager = CheckerManager::new(&testlib_path, &checker_cache_dir);
    info!(
        "Checker manager initialized with testlib at {}",
        testlib_path
    );

    // Initialize validator manager
    let validator_cache_dir =
        std::env::var("VALIDATOR_CACHE_DIR").unwrap_or_else(|_| "/tmp/validator_cache".into());
    let validator_manager = ValidatorManager::new(&testlib_path, &validator_cache_dir);
    info!("Validator manager initialized");

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
            match serde_json::from_str::<WorkerJob>(&job_data) {
                Ok(worker_job) => match worker_job {
                    WorkerJob::Judge(job) => {
                        info!(
                            "Received judge job: submission_id={}, language={}",
                            job.submission_id, job.language
                        );

                        // Get base box ID counter for this job
                        let current_counter = box_id_counter;
                        box_id_counter = box_id_counter.wrapping_add(1);

                        match process_judge_job(&job, &storage, &checker_manager, current_counter)
                            .await
                        {
                            Ok(result) => {
                                if let Err(e) =
                                    store_judge_result(&mut conn, &client, &result).await
                                {
                                    error!("Failed to store judge result: {}", e);
                                }
                                info!(
                                    "Judge job completed: submission_id={}, verdict={}",
                                    result.submission_id, result.verdict
                                );
                            }
                            Err(e) => {
                                error!("Failed to process judge job {}: {}", job.submission_id, e);
                                let error_result = JudgeResult {
                                    submission_id: job.submission_id,
                                    verdict: "system_error".into(),
                                    execution_time: None,
                                    memory_used: None,
                                    testcase_results: vec![],
                                    error_message: Some(format!("{:#}", e)),
                                };
                                if let Err(e) =
                                    store_judge_result(&mut conn, &client, &error_result).await
                                {
                                    error!("Failed to store judge error result: {}", e);
                                }
                            }
                        }
                    }
                    WorkerJob::Validate(job) => {
                        info!(
                            "Received validate job: problem_id={}, testcases={}",
                            job.problem_id,
                            job.testcase_inputs.len()
                        );

                        match process_validate_job(&job, &storage, &validator_manager).await {
                            Ok(result) => {
                                if let Err(e) = store_validate_result(&mut conn, &result).await {
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
                            Err(e) => {
                                error!(
                                    "Failed to process validate job for problem {}: {}",
                                    job.problem_id, e
                                );
                                let error_result = validator::ValidateResult {
                                    problem_id: job.problem_id,
                                    success: false,
                                    testcase_results: vec![],
                                    error_message: Some(format!("{:#}", e)),
                                };
                                if let Err(e) = store_validate_result(&mut conn, &error_result).await
                                {
                                    error!(
                                        "Failed to store validation error result for problem {}: {}",
                                        job.problem_id, e
                                    );
                                }
                            }
                        }
                    }
                },
                Err(e) => {
                    warn!("Failed to parse job data: {}", e);
                }
            }
        }
    }
}

/// Store judge result in Redis
async fn store_judge_result(
    conn: &mut MultiplexedConnection,
    client: &redis::Client,
    result: &JudgeResult,
) -> Result<()> {
    let result_json = serde_json::to_string(result)?;
    let result_key = format!("{}{}", RESULT_KEY_PREFIX, result.submission_id);

    // Store result in Redis for polling (expires in 1 hour)
    if let Err(e) = conn
        .set_ex::<_, _, ()>(&result_key, &result_json, 3600)
        .await
    {
        warn!("Redis set_ex failed: {}. Reconnecting and retrying...", e);
        let mut new_conn = get_redis_connection(client).await?;
        new_conn
            .set_ex::<_, _, ()>(&result_key, &result_json, 3600)
            .await?;
        *conn = new_conn;
    }

    // Also publish to results channel (for real-time updates if subscribed)
    if let Err(e) = conn
        .publish::<_, _, ()>(RESULT_CHANNEL, &result_json)
        .await
    {
        warn!("Redis publish failed: {}. Reconnecting and retrying...", e);
        let mut new_conn = get_redis_connection(client).await?;
        new_conn
            .publish::<_, _, ()>(RESULT_CHANNEL, &result_json)
            .await?;
        *conn = new_conn;
    }

    Ok(())
}

async fn process_judge_job(
    job: &JudgeJob,
    storage: &StorageClient,
    checker_manager: &CheckerManager,
    base_counter: u32,
) -> Result<JudgeResult> {
    let lang_config = languages::get_language_config(&job.language)
        .ok_or_else(|| anyhow::anyhow!("Unsupported language: {}", job.language))?;

    let temp_dir = tempfile::tempdir()?;
    let source_path = temp_dir.path().join(&lang_config.source_file);

    std::fs::write(&source_path, &job.code)?;

    // Compile if needed
    if let Some(compile_cmd) = &lang_config.compile_command {
        let compile_box_id = calculate_box_id(base_counter, 0);
        let config = get_config();

        let compile_result = compile_in_sandbox(
            compile_box_id,
            temp_dir.path(),
            compile_cmd,
            config.compile_time_limit_ms,
            config.compile_memory_limit_mb,
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

    // Get checker path if this is a special judge problem
    let checker_binary = if job.problem_type == ProblemType::SpecialJudge {
        match &job.checker_path {
            Some(path) => {
                match checker_manager
                    .get_checker(storage, path, job.problem_id)
                    .await
                {
                    Ok(binary_path) => Some(binary_path),
                    Err(e) => {
                        return Ok(JudgeResult {
                            submission_id: job.submission_id,
                            verdict: Verdict::SystemError.to_string(),
                            execution_time: None,
                            memory_used: None,
                            testcase_results: vec![],
                            error_message: Some(format!("Failed to compile checker: {}", e)),
                        });
                    }
                }
            }
            None => {
                return Ok(JudgeResult {
                    submission_id: job.submission_id,
                    verdict: Verdict::SystemError.to_string(),
                    execution_time: None,
                    memory_used: None,
                    testcase_results: vec![],
                    error_message: Some("Special judge problem requires a checker".to_string()),
                });
            }
        }
    } else {
        None
    };

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

        let tc_box_id = calculate_box_id(base_counter, (idx as u32) + 1);

        let adjusted_time_limit = if job.ignore_time_limit_bonus {
            job.time_limit
        } else {
            lang_config.calculate_time_limit(job.time_limit)
        };
        let adjusted_memory_limit = if job.ignore_memory_limit_bonus {
            job.memory_limit
        } else {
            lang_config.calculate_memory_limit(job.memory_limit)
        };

        // Run user's program using SandboxedRunner
        let sandboxed_runner = SandboxedRunner::new(tc_box_id, temp_dir.path());
        let cmd = CommandSpec::from_vec(&lang_config.run_command);
        let limits = RunLimits::new(adjusted_time_limit, adjusted_memory_limit);

        let run_result = sandboxed_runner
            .execute(&cmd, &limits, Some(&input_content))
            .await?;

        let output_preview = if run_result.stdout.is_empty() {
            None
        } else {
            let truncated: String = run_result.stdout.chars().take(4096).collect();
            Some(truncated)
        };

        max_time = max_time.max(run_result.time_ms);
        max_memory = max_memory.max(run_result.memory_kb);

        // Determine verdict based on run status and problem type
        let verdict = match run_result.status {
            RunStatus::Exited(0) => {
                // Program ran successfully, check output
                if let Some(ref checker_path) = checker_binary {
                    // Special judge: run checker
                    let checker_temp_dir = tempfile::tempdir()?;
                    let input_path = checker_temp_dir.path().join("input.txt");
                    let output_path = checker_temp_dir.path().join("output.txt");
                    let answer_path = checker_temp_dir.path().join("answer.txt");

                    tokio::fs::write(&input_path, &input_content).await?;
                    tokio::fs::write(&output_path, &run_result.stdout).await?;
                    tokio::fs::write(&answer_path, &expected_output).await?;

                    match checker::run_checker(
                        checker_path,
                        &input_path,
                        &output_path,
                        &answer_path,
                        DEFAULT_CHECKER_TIMEOUT_SECS,
                    )
                    .await
                    {
                        Ok(checker_result) => checker_result.verdict,
                        Err(e) => {
                            warn!("Checker failed for testcase {}: {}", tc.id, e);
                            Verdict::SystemError
                        }
                    }
                } else {
                    // ICPC: simple string comparison
                    if compare_output(&run_result.stdout, &expected_output) {
                        Verdict::Accepted
                    } else {
                        Verdict::WrongAnswer
                    }
                }
            }
            RunStatus::Exited(_) => Verdict::RuntimeError,
            RunStatus::TimeLimitExceeded => Verdict::TimeLimitExceeded,
            RunStatus::MemoryLimitExceeded => Verdict::MemoryLimitExceeded,
            RunStatus::Signaled(_) => Verdict::RuntimeError,
            RunStatus::RuntimeError => Verdict::RuntimeError,
            RunStatus::SystemError => Verdict::SystemError,
        };

        let tc_result = TestcaseResult {
            testcase_id: tc.id,
            verdict: verdict.to_string(),
            execution_time: Some(run_result.time_ms),
            memory_used: Some(run_result.memory_kb),
            output: output_preview,
        };

        testcase_results.push(tc_result);

        if verdict != Verdict::Accepted && overall_verdict == Verdict::Accepted {
            overall_verdict = verdict;
            break;
        }
    }

    // Mark remaining testcases as skipped if early termination
    for i in testcase_results.len()..job.testcases.len() {
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

/// Compare program output with expected output
fn compare_output(actual: &str, expected: &str) -> bool {
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
