//! Redis Manager - Centralized Redis connection and operations
//!
//! This module handles all Redis-related operations including:
//! - Worker ID allocation and lease management
//! - Job queue operations (BLPOP)
//! - Result storage and publishing

use std::time::Duration;

use anyhow::{Context, Result};
use redis::aio::MultiplexedConnection;
use redis::AsyncCommands;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tokio::task::JoinHandle;
use tracing::{info, warn};

use crate::jobs::anigma::AnigmaJudgeResult;
use crate::jobs::judger::JudgeResult;
use crate::jobs::playground::PlaygroundResult;
use crate::jobs::validator::ValidateResult;
use crate::jobs::workshop::generate::WorkshopGenerateResult;
use crate::jobs::workshop::invoke::WorkshopInvokeResult;
use crate::jobs::workshop::validate::WorkshopValidateResult;
use crate::jobs::WorkerJob;

/// Redis key constants
pub mod keys {
    /// Worker lease key prefix for distributed worker ID allocation
    pub const WORKER_LEASE_PREFIX: &str = "judge:worker:lease:";

    /// Judge job queue key
    pub const JUDGE_QUEUE: &str = "judge:queue";

    /// Judge result key prefix (for polling)
    pub const JUDGE_RESULT_PREFIX: &str = "judge:result:";

    /// Judge result channel (for pub/sub)
    pub const JUDGE_RESULT_CHANNEL: &str = "judge:results";

    /// Validation result key prefix (for polling)
    pub const VALIDATE_RESULT_PREFIX: &str = "validate:result:";

    /// Validation result channel (for pub/sub)
    pub const VALIDATE_RESULT_CHANNEL: &str = "validate:results";

    /// Anigma result key prefix (for polling)
    pub const ANIGMA_RESULT_PREFIX: &str = "anigma:result:";

    /// Anigma result channel (for pub/sub)
    pub const ANIGMA_RESULT_CHANNEL: &str = "anigma:results";

    /// Judge progress channel (for pub/sub)
    pub const JUDGE_PROGRESS_CHANNEL: &str = "judge:progress";

    /// Per-worker processing list (BLMOVE destination). Suffix = worker_id.
    pub const PROCESSING_PREFIX: &str = "judge:processing:";
    /// Dead letter list for poison/unparseable jobs
    pub const DEAD_QUEUE: &str = "judge:dead";

    // ---- Workshop (창작마당) ----
    /// `workshop_generate` result key prefix (keyed by `job_id`)
    pub const WORKSHOP_GENERATE_RESULT_PREFIX: &str = "workshop:generate:result:";
    /// `workshop_generate` result pub/sub channel
    pub const WORKSHOP_GENERATE_RESULT_CHANNEL: &str = "workshop:generate:results";
    /// `workshop_validate` result key prefix (keyed by `job_id`)
    pub const WORKSHOP_VALIDATE_RESULT_PREFIX: &str = "workshop:validate:result:";
    pub const WORKSHOP_VALIDATE_RESULT_CHANNEL: &str = "workshop:validate:results";
    /// `workshop_invoke` result key prefix (keyed by `job_id`)
    pub const WORKSHOP_INVOKE_RESULT_PREFIX: &str = "workshop:invoke:result:";
    /// `workshop_invoke` pub/sub channel for per-invocation fan-out.
    /// Actual per-invocation channel formatted as
    /// `workshop:{problemId}:invocation:{invocationId}` — see spec §5.
    pub const WORKSHOP_INVOKE_RESULT_CHANNEL: &str = "workshop:invoke:results";
}

/// Configuration constants
const MAX_WORKERS: u32 = 10;
const WORKER_LEASE_TTL_SECS: u64 = 120;
const RESULT_EXPIRY_SECS: u64 = 3600; // 1 hour

/// A job popped from the queue together with its raw payload.
/// `raw` must be passed back to `ack_job`/`requeue_job` verbatim — it is the
/// LREM match key in the processing list.
pub struct PoppedJob {
    pub job: WorkerJob,
    pub raw: String,
}

pub(crate) fn parse_job(raw: &str) -> Result<WorkerJob> {
    serde_json::from_str::<WorkerJob>(raw).context("Failed to parse job payload")
}

/// 같은 payload의 재큐 횟수를 추적하기 위한 지문. payload 자체를 키에 넣기엔
/// 크기가 커서 sha256으로 축약한다.
pub(crate) fn requeue_fingerprint(raw: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(raw.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// 같은 payload가 회수(reclaim)될 수 있는 최대 횟수. 이를 넘기면 poison job으로
/// 간주해 DLQ로 보낸다.
pub(crate) const MAX_REQUEUE: i64 = 2;

pub(crate) fn should_dead_letter(requeue_count: i64) -> bool {
    requeue_count > MAX_REQUEUE
}

/// Drain a single processing list back onto the front of the job queue,
/// dead-lettering any payload that has been reclaimed more than
/// `MAX_REQUEUE` times (poison job — repeatedly killing the worker that
/// picks it up). Returns the number of jobs reclaimed (dead-lettered jobs
/// are not counted as reclaimed).
///
/// Shared by [`reclaim_dead_worker_lists`] (other workers' lists, periodic)
/// and [`RedisManager::reclaim_orphaned_jobs`] (own list, startup-only) so
/// the LMOVE/poison-counting logic is implemented exactly once.
async fn reclaim_processing_list(conn: &mut MultiplexedConnection, processing_key: &str) -> u32 {
    let mut reclaimed = 0u32;
    loop {
        let raw: Option<String> = redis::cmd("LMOVE")
            .arg(processing_key)
            .arg(keys::JUDGE_QUEUE)
            .arg("RIGHT")
            .arg("LEFT")
            .query_async(conn)
            .await
            .unwrap_or(None);
        let Some(raw) = raw else { break };

        let counter_key = format!("judge:requeue:{}", requeue_fingerprint(&raw));
        let count: i64 = conn.incr(&counter_key, 1).await.unwrap_or(i64::MAX);
        let _ = conn.expire::<_, ()>(&counter_key, 3600).await;

        if should_dead_letter(count) {
            warn!("Poison job dead-lettered after {} requeues", count - 1);
            // 방금 큐 앞에 넣은 것을 다시 꺼내 DLQ로
            let _ = conn.lrem::<_, _, ()>(keys::JUDGE_QUEUE, 1, &raw).await;
            let _ = conn.lpush::<_, _, ()>(keys::DEAD_QUEUE, &raw).await;
        } else {
            reclaimed += 1;
        }
    }
    reclaimed
}

/// Move jobs stuck in *other* dead workers' processing lists back to the
/// queue. A worker is dead when its lease key is missing. Scans every
/// worker id 0..MAX_WORKERS; never touches the caller's own list (that is
/// [`RedisManager::reclaim_orphaned_jobs`]'s startup-only responsibility,
/// since a live worker's own lease always exists).
///
/// Used both by the periodic background task ([`spawn_orphan_reclaimer`])
/// and by [`RedisManager::reclaim_orphaned_jobs`], so this is the single
/// implementation of the "scan for dead leases" behavior.
pub(crate) async fn reclaim_dead_worker_lists(conn: &mut MultiplexedConnection) -> u32 {
    let mut reclaimed = 0u32;
    for id in 0..MAX_WORKERS {
        let lease_key = format!("{}{}", keys::WORKER_LEASE_PREFIX, id);
        let alive: bool = conn.exists(&lease_key).await.unwrap_or(true);
        if alive {
            continue;
        }
        reclaimed += reclaim_processing_list(conn, &RedisManager::processing_key(id)).await;
    }
    if reclaimed > 0 {
        info!("Reclaimed {} orphaned job(s) from dead workers", reclaimed);
    }
    reclaimed
}

/// 60초마다 죽은 워커의 processing 리스트를 회수하는 백그라운드 태스크.
/// 자체 RedisManager 없이 REDIS_URL로 별도 연결을 만든다.
pub fn spawn_orphan_reclaimer() -> JoinHandle<()> {
    tokio::spawn(async move {
        let url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://localhost:6379".into());
        loop {
            tokio::time::sleep(Duration::from_secs(60)).await;
            let Ok(client) = redis::Client::open(url.as_str()) else {
                continue;
            };
            let Ok(mut conn) = client.get_multiplexed_async_connection().await else {
                continue;
            };
            reclaim_dead_worker_lists(&mut conn).await;
        }
    })
}

/// Centralized Redis manager for all Redis operations
pub struct RedisManager {
    worker_id: u32,
    client: redis::Client,
    conn: MultiplexedConnection,
    lease_handle: JoinHandle<()>,
}

impl RedisManager {
    /// Create a new RedisManager with the given Redis URL.
    ///
    /// This will:
    /// 1. Connect to Redis
    /// 2. Allocate a unique worker ID (0 to MAX_WORKERS-1)
    /// 3. Start a background task to keep the worker lease alive
    async fn with_url(redis_url: &str) -> Result<Self> {
        let client = redis::Client::open(redis_url).context("Failed to create Redis client")?;

        let conn = get_connection_with_retry(&client).await?;
        // URL 의 user:password 부분을 제거한 뒤 로그에 출력 — admin 로그 뷰어에 비밀번호가
        // 그대로 노출되지 않도록 함.
        info!(
            "Connected to Redis at {}",
            redact_url_credentials(redis_url)
        );

        let worker_id = allocate_worker_id(&client).await?;
        info!(
            "Allocated worker_id={} (lease {}s)",
            worker_id, WORKER_LEASE_TTL_SECS
        );

        let lease_handle = spawn_lease_heartbeat(client.clone(), worker_id);

        Ok(Self {
            worker_id,
            client,
            conn,
            lease_handle,
        })
    }

    /// Create a new RedisManager using the REDIS_URL environment variable.
    /// Defaults to "redis://localhost:6379" if not set.
    pub async fn from_env() -> Result<Self> {
        let url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://localhost:6379".into());
        Self::with_url(&url).await
    }

    /// Get the allocated worker ID
    pub fn worker_id(&self) -> u32 {
        self.worker_id
    }

    pub fn processing_key(worker_id: u32) -> String {
        format!("{}{}", keys::PROCESSING_PREFIX, worker_id)
    }

    /// Pop one job into this worker's processing list (BLMOVE, 5s timeout).
    /// Returns Ok(None) on timeout so the caller can check for shutdown.
    /// The job stays in the processing list until `ack_job`/`requeue_job`.
    pub async fn try_pop_job(&mut self) -> Result<Option<PoppedJob>> {
        let processing = Self::processing_key(self.worker_id);
        let raw: Option<String> = match redis::cmd("BLMOVE")
            .arg(keys::JUDGE_QUEUE)
            .arg(&processing)
            .arg("LEFT")
            .arg("RIGHT")
            .arg(5.0)
            .query_async(&mut self.conn)
            .await
        {
            Ok(res) => res,
            Err(e) => {
                warn!("Redis BLMOVE failed: {}. Reconnecting...", e);
                self.reconnect().await?;
                return Ok(None);
            }
        };

        let Some(raw) = raw else { return Ok(None) };

        match parse_job(&raw) {
            Ok(job) => Ok(Some(PoppedJob { job, raw })),
            Err(e) => {
                warn!("Unparseable job moved to {}: {}", keys::DEAD_QUEUE, e);
                // poison payload: processing 리스트에서 제거하고 DLQ로 보존
                let _ = self.conn.lrem::<_, _, ()>(&processing, 1, &raw).await;
                let _ = self.conn.lpush::<_, _, ()>(keys::DEAD_QUEUE, &raw).await;
                Ok(None)
            }
        }
    }

    /// Acknowledge a completed job: remove it from the processing list.
    pub async fn ack_job(&mut self, raw: &str) -> Result<()> {
        let processing = Self::processing_key(self.worker_id);
        if let Err(e) = self.conn.lrem::<_, _, ()>(&processing, 1, raw).await {
            warn!("Failed to ack job: {}. Reconnecting...", e);
            self.reconnect().await?;
            self.conn.lrem::<_, _, ()>(&processing, 1, raw).await?;
        }
        Ok(())
    }

    /// Increment the per-submission job retry counter (1h TTL). Returns the
    /// new count. Used by main to decide requeue vs system_error.
    pub async fn incr_job_retry(&mut self, submission_id: i64) -> Result<i64> {
        let key = format!("judge:job_retry:{}", submission_id);
        let count: i64 = self.conn.incr(&key, 1).await?;
        let _ = self.conn.expire::<_, ()>(&key, 3600).await;
        Ok(count)
    }

    /// Put a failed job back at the front of the queue and drop it from the
    /// processing list.
    pub async fn requeue_job(&mut self, raw: &str) -> Result<()> {
        let processing = Self::processing_key(self.worker_id);
        self.conn.lpush::<_, _, ()>(keys::JUDGE_QUEUE, raw).await?;
        self.conn.lrem::<_, _, ()>(&processing, 1, raw).await?;
        Ok(())
    }

    /// Move jobs stuck in dead workers' processing lists back to the queue.
    /// A worker is dead when its lease key is missing. `include_own=true` is
    /// startup-only: also reclaims this worker's own processing list, in
    /// case a previous incarnation with the same worker_id left jobs behind
    /// (a live worker's own lease always exists, so it is otherwise skipped
    /// by the dead-lease scan). Returns the number of jobs reclaimed.
    pub async fn reclaim_orphaned_jobs(&mut self, include_own: bool) -> Result<u32> {
        let mut reclaimed = reclaim_dead_worker_lists(&mut self.conn).await;
        if include_own {
            let own_processing = Self::processing_key(self.worker_id);
            reclaimed += reclaim_processing_list(&mut self.conn, &own_processing).await;
        }
        Ok(reclaimed)
    }

    /// Store a judge result in Redis.
    ///
    /// The result is stored with a 1-hour expiration and also published
    /// to a channel for real-time subscribers.
    pub async fn store_judge_result(&mut self, result: &JudgeResult) -> Result<()> {
        self.store_result(
            &format!("{}{}", keys::JUDGE_RESULT_PREFIX, result.submission_id),
            Some(keys::JUDGE_RESULT_CHANNEL),
            result,
        )
        .await
    }

    /// Store a validation result in Redis.
    ///
    /// The result is stored with a 1-hour expiration and also published
    /// to a channel for real-time subscribers.
    pub async fn store_validate_result(&mut self, result: &ValidateResult) -> Result<()> {
        self.store_result(
            &format!("{}{}", keys::VALIDATE_RESULT_PREFIX, result.problem_id),
            Some(keys::VALIDATE_RESULT_CHANNEL),
            result,
        )
        .await
    }

    /// Store an anigma result in Redis.
    pub async fn store_anigma_result(&mut self, result: &AnigmaJudgeResult) -> Result<()> {
        self.store_result(
            &format!(
                "{}{}",
                keys::ANIGMA_RESULT_PREFIX,
                result.base.submission_id
            ),
            Some(keys::ANIGMA_RESULT_CHANNEL),
            result,
        )
        .await
    }

    /// Store a playground result in Redis.
    /// Playground results are just pushed to a specific list or set to a key, usually waited by BLPOP on client side.
    /// But here the client uses BLPOP, so we should RPUSH to the key.
    /// Wait, if client uses BLPOP, then we should RPUSH.
    /// The key is passed in the job.
    pub async fn store_playground_result(
        &mut self,
        key: &str,
        result: &PlaygroundResult,
    ) -> Result<()> {
        let json = serde_json::to_string(result)?;

        // Use RPUSH so client's BLPOP can pick it up
        if let Err(e) = self.conn.rpush::<_, _, ()>(key, &json).await {
            warn!("Failed to push playground result: {}. Reconnecting...", e);
            self.reconnect().await?;
            self.conn.rpush::<_, _, ()>(key, &json).await?;
        }

        // Set expiry for the key so it doesn't linger forever if client disconnects
        let _ = self.conn.expire::<_, ()>(key, 300).await; // 5 minutes

        Ok(())
    }

    /// Store a workshop generate result in Redis.
    pub async fn store_workshop_generate_result(
        &mut self,
        result: &WorkshopGenerateResult,
    ) -> Result<()> {
        // Publish to the shared channel AND to a per-problem channel so SSE
        // subscribers can filter by problem.
        self.store_result(
            &format!("{}{}", keys::WORKSHOP_GENERATE_RESULT_PREFIX, result.job_id),
            Some(keys::WORKSHOP_GENERATE_RESULT_CHANNEL),
            result,
        )
        .await?;

        // Per-problem fan-out (mirrors invoke pattern in spec §5).
        let per_problem_channel = format!("workshop:{}:generate", result.problem_id);
        let json = serde_json::to_string(result)?;
        if let Err(e) = self.publish_with_retry(&per_problem_channel, &json).await {
            warn!(
                "workshop_generate per-problem publish ultimately failed for {}: {}",
                per_problem_channel, e
            );
        }
        Ok(())
    }

    /// Store a workshop validate result in Redis.
    pub async fn store_workshop_validate_result(
        &mut self,
        result: &WorkshopValidateResult,
    ) -> Result<()> {
        self.store_result(
            &format!("{}{}", keys::WORKSHOP_VALIDATE_RESULT_PREFIX, result.job_id),
            Some(keys::WORKSHOP_VALIDATE_RESULT_CHANNEL),
            result,
        )
        .await?;

        let per_problem_channel = format!("workshop:{}:validate", result.problem_id);
        let json = serde_json::to_string(result)?;
        if let Err(e) = self.publish_with_retry(&per_problem_channel, &json).await {
            warn!(
                "workshop_validate per-problem publish ultimately failed for {}: {}",
                per_problem_channel, e
            );
        }
        Ok(())
    }

    /// Store a workshop invoke result in Redis.
    ///
    /// Publishes to `workshop:{problemId}:invocation:{invocationId}` as
    /// specified in spec §5, plus the global `workshop:invoke:results` channel
    /// and a polling key.
    pub async fn store_workshop_invoke_result(
        &mut self,
        result: &WorkshopInvokeResult,
    ) -> Result<()> {
        self.store_result(
            &format!("{}{}", keys::WORKSHOP_INVOKE_RESULT_PREFIX, result.job_id),
            Some(keys::WORKSHOP_INVOKE_RESULT_CHANNEL),
            result,
        )
        .await?;

        let invocation_channel = format!(
            "workshop:{}:invocation:{}",
            result.problem_id, result.invocation_id
        );
        let json = serde_json::to_string(result)?;
        if let Err(e) = self.publish_with_retry(&invocation_channel, &json).await {
            warn!(
                "workshop_invoke per-invocation publish ultimately failed for {}: {}",
                invocation_channel, e
            );
        }
        Ok(())
    }

    /// Publish judge progress update
    pub async fn publish_progress(
        &mut self,
        submission_id: i64,
        current: usize,
        total: usize,
    ) -> Result<()> {
        let percentage = if total > 0 {
            ((current as f32 / total as f32) * 100.0) as u32
        } else {
            0
        };

        let progress = serde_json::json!({
            "submission_id": submission_id,
            "percentage": percentage,
        });

        let json = serde_json::to_string(&progress)?;

        // Ignore errors - progress updates are non-critical
        let _ = self
            .conn
            .publish::<_, _, ()>(keys::JUDGE_PROGRESS_CHANNEL, &json)
            .await;

        Ok(())
    }

    /// Internal helper to store and publish a result
    async fn store_result<T: Serialize>(
        &mut self,
        key: &str,
        channel: Option<&str>,
        result: &T,
    ) -> Result<()> {
        let json = serde_json::to_string(result)?;

        // Try to store, reconnect on failure
        if let Err(e) = self
            .conn
            .set_ex::<_, _, ()>(key, &json, RESULT_EXPIRY_SECS)
            .await
        {
            warn!("Failed to store result: {}. Reconnecting...", e);
            self.reconnect().await?;
            self.conn
                .set_ex::<_, _, ()>(key, &json, RESULT_EXPIRY_SECS)
                .await?;
        }

        // Publish to channel (ignore errors as there may be no subscribers)
        if let Some(chan) = channel {
            let _ = self.conn.publish::<_, _, ()>(chan, &json).await;
        }

        Ok(())
    }

    /// Publish a message to a channel, reconnecting and retrying once on
    /// failure. Used for realtime workshop SSE channels where dropping a
    /// publish causes the live view to stay stale even after the result
    /// itself was persisted via [`store_result`].
    async fn publish_with_retry(&mut self, channel: &str, payload: &str) -> Result<()> {
        if let Err(e) = self.conn.publish::<_, _, ()>(channel, payload).await {
            warn!("Failed to publish to {}: {}. Reconnecting...", channel, e);
            self.reconnect().await?;
            self.conn.publish::<_, _, ()>(channel, payload).await?;
        }
        Ok(())
    }

    /// Reconnect to Redis
    async fn reconnect(&mut self) -> Result<()> {
        self.conn = get_connection_with_retry(&self.client).await?;
        Ok(())
    }

    /// Delete this worker's lease key and stop the heartbeat so a replacement
    /// worker (or the reclaimer) can immediately take over the id.
    pub async fn release_lease(&mut self) -> Result<()> {
        self.lease_handle.abort();
        let key = format!("{}{}", keys::WORKER_LEASE_PREFIX, self.worker_id);
        self.conn.del::<_, ()>(&key).await?;
        Ok(())
    }
}

impl Drop for RedisManager {
    fn drop(&mut self) {
        self.lease_handle.abort();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_job_accepts_valid_judge_job() {
        let raw = r#"{"job_type":"playground","session_id":"s1","result_key":"k","target_path":"Main.py","files":[],"time_limit":5000,"memory_limit":512}"#;
        // playground job이 필드가 가장 적어 fixture로 적합. 실제 PlaygroundJob 필드에 맞춰 조정.
        assert!(parse_job(raw).is_ok());
    }

    #[test]
    fn parse_job_rejects_malformed_payload() {
        assert!(parse_job("not json").is_err());
        assert!(parse_job(r#"{"job_type":"unknown_type"}"#).is_err());
    }

    #[test]
    fn processing_key_is_per_worker() {
        assert_eq!(RedisManager::processing_key(3), "judge:processing:3");
    }

    #[test]
    fn requeue_fingerprint_is_stable_hex() {
        let a = requeue_fingerprint("payload");
        assert_eq!(a, requeue_fingerprint("payload"));
        assert_eq!(a.len(), 64);
        assert_ne!(a, requeue_fingerprint("payload2"));
    }

    #[test]
    fn dead_letter_after_max_requeue() {
        assert!(!should_dead_letter(1));
        assert!(!should_dead_letter(2));
        assert!(should_dead_letter(3));
    }
}

/// Get a Redis connection with retry logic
async fn get_connection_with_retry(client: &redis::Client) -> Result<MultiplexedConnection> {
    loop {
        match client.get_multiplexed_async_connection().await {
            Ok(conn) => return Ok(conn),
            Err(e) => {
                warn!(
                    "Failed to connect to Redis: {}. Retrying in 3 seconds...",
                    e
                );
                tokio::time::sleep(Duration::from_secs(3)).await;
            }
        }
    }
}

/// Allocate a unique worker ID using Redis SET NX with expiration
async fn allocate_worker_id(client: &redis::Client) -> Result<u32> {
    loop {
        let mut conn = get_connection_with_retry(client).await?;

        for worker_id in 0..MAX_WORKERS {
            let key = format!("{}{}", keys::WORKER_LEASE_PREFIX, worker_id);
            let claimed: Option<String> = redis::cmd("SET")
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
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
}

/// `scheme://user:password@host:port/...` 형태의 URL 에서 user:password 부분을 제거한다.
/// 로그/모니터링 출력에서 자격증명 노출을 막기 위함.
fn redact_url_credentials(url: &str) -> String {
    if let Some(scheme_end) = url.find("://") {
        let after_scheme = &url[scheme_end + 3..];
        if let Some(at_pos) = after_scheme.find('@') {
            return format!("{}://{}", &url[..scheme_end], &after_scheme[at_pos + 1..]);
        }
    }
    url.to_string()
}

/// Spawn a background task to keep the worker lease alive
fn spawn_lease_heartbeat(client: redis::Client, worker_id: u32) -> JoinHandle<()> {
    tokio::spawn(async move {
        let interval = Duration::from_secs(WORKER_LEASE_TTL_SECS / 2);

        loop {
            tokio::time::sleep(interval).await;

            match get_connection_with_retry(&client).await {
                Ok(mut conn) => {
                    let key = format!("{}{}", keys::WORKER_LEASE_PREFIX, worker_id);
                    if let Err(e) = redis::cmd("EXPIRE")
                        .arg(&key)
                        .arg(WORKER_LEASE_TTL_SECS as usize)
                        .query_async::<()>(&mut conn)
                        .await
                    {
                        warn!("Failed to refresh worker lease {}: {}", worker_id, e);
                    }
                }
                Err(e) => {
                    warn!(
                        "Failed to refresh worker lease {} (connection): {}",
                        worker_id, e
                    );
                }
            }
        }
    })
}
