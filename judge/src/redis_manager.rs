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
use tokio::task::JoinHandle;
use tracing::{info, warn};

use crate::judger::JudgeResult;
use crate::validator::ValidateResult;
use crate::WorkerJob;

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
}

/// Configuration constants
const MAX_WORKERS: u32 = 10;
const WORKER_LEASE_TTL_SECS: u64 = 120;
const RESULT_EXPIRY_SECS: u64 = 3600; // 1 hour

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
        info!("Connected to Redis at {}", redis_url);

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

    /// Block and wait for the next job from the queue.
    ///
    /// This uses BLPOP to efficiently wait for jobs without polling.
    /// Automatically reconnects on connection failure.
    pub async fn pop_job(&mut self) -> Result<WorkerJob> {
        loop {
            let result: Option<(String, String)> =
                match redis::AsyncCommands::blpop(&mut self.conn, keys::JUDGE_QUEUE, 0.0).await {
                    Ok(res) => res,
                    Err(e) => {
                        warn!("Redis BLPOP failed: {}. Reconnecting...", e);
                        self.reconnect().await?;
                        continue;
                    }
                };

            if let Some((_, job_data)) = result {
                match serde_json::from_str::<WorkerJob>(&job_data) {
                    Ok(job) => return Ok(job),
                    Err(e) => {
                        warn!("Failed to parse job data: {}. Data: {}", e, job_data);
                        continue;
                    }
                }
            }
        }
    }

    /// Store a judge result in Redis.
    ///
    /// The result is stored with a 1-hour expiration and also published
    /// to a channel for real-time subscribers.
    pub async fn store_judge_result(&mut self, result: &JudgeResult) -> Result<()> {
        self.store_result(
            &format!("{}{}", keys::JUDGE_RESULT_PREFIX, result.submission_id),
            keys::JUDGE_RESULT_CHANNEL,
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
            keys::VALIDATE_RESULT_CHANNEL,
            result,
        )
        .await
    }

    /// Internal helper to store and publish a result
    async fn store_result<T: Serialize>(
        &mut self,
        key: &str,
        channel: &str,
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
        let _ = self.conn.publish::<_, _, ()>(channel, &json).await;

        Ok(())
    }

    /// Reconnect to Redis
    async fn reconnect(&mut self) -> Result<()> {
        self.conn = get_connection_with_retry(&self.client).await?;
        Ok(())
    }
}

impl Drop for RedisManager {
    fn drop(&mut self) {
        self.lease_handle.abort();
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
