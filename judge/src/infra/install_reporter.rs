//! Lease-free Redis handle for language install progress: the live log
//! (`judge:install:<id>:log`), the final result (`judge:install:<id>:result`)
//! and install-script lookup. Shared by the install/uninstall job path (built
//! from the worker's [`RedisManager`] connection) and the background boot
//! self-heal, which must not allocate a worker lease of its own.
//!
//! [`RedisManager`]: super::redis_manager::RedisManager

use anyhow::{Context, Result};
use redis::aio::MultiplexedConnection;
use redis::AsyncCommands;
use tracing::warn;

use super::redis_manager::{get_connection_with_retry, keys};
use crate::jobs::language_install::LanguageInstallResult;

const INSTALL_KEY_TTL_SECS: u64 = 86_400;
const MAX_LOG_LINES: isize = 10_000;

pub struct InstallReporter {
    client: redis::Client,
    conn: MultiplexedConnection,
}

impl InstallReporter {
    pub(crate) fn new(client: redis::Client, conn: MultiplexedConnection) -> Self {
        Self { client, conn }
    }

    /// Connect using `REDIS_URL` (retrying until Redis is reachable). No
    /// worker id, no lease, no heartbeat.
    pub async fn connect_from_env() -> Result<Self> {
        let url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://localhost:6379".into());
        let client = redis::Client::open(url.as_str()).context("Failed to create Redis client")?;
        let conn = get_connection_with_retry(&client).await?;
        Ok(Self::new(client, conn))
    }

    async fn reconnect(&mut self) -> Result<()> {
        self.conn = get_connection_with_retry(&self.client).await?;
        Ok(())
    }

    fn log_key(id: &str) -> String {
        format!("{}{id}:log", keys::INSTALL_PREFIX)
    }

    fn result_key(id: &str) -> String {
        format!("{}{id}:result", keys::INSTALL_PREFIX)
    }

    pub async fn get_install_script(&mut self, id: &str) -> Result<Option<String>> {
        let v: Option<String> = self.conn.hget(keys::LANGUAGES_SCRIPTS, id).await?;
        Ok(v)
    }

    pub async fn clear_install_log(&mut self, id: &str) {
        let _ = self.conn.del::<_, ()>(Self::log_key(id)).await;
    }

    /// Best-effort: log lines are informational, never fail the install.
    pub async fn append_install_log(&mut self, id: &str, line: &str) {
        let key = Self::log_key(id);
        let _ = self.conn.rpush::<_, _, ()>(&key, line).await;
        let _ = self.conn.ltrim::<_, ()>(&key, -MAX_LOG_LINES, -1).await;
        let _ = self
            .conn
            .expire::<_, ()>(&key, INSTALL_KEY_TTL_SECS as i64)
            .await;
        let _ = self.conn.publish::<_, _, ()>(&key, line).await;
    }

    /// SET EX 86400 `judge:install:<id>:result` and PUBLISH on the channel of
    /// the same name (each retried once after a reconnect).
    pub async fn store_language_install_result(&mut self, r: &LanguageInstallResult) -> Result<()> {
        let key = Self::result_key(&r.language_id);
        let json = serde_json::to_string(r)?;
        if let Err(e) = self
            .conn
            .set_ex::<_, _, ()>(&key, &json, INSTALL_KEY_TTL_SECS)
            .await
        {
            warn!("Failed to store install result: {}. Reconnecting...", e);
            self.reconnect().await?;
            self.conn
                .set_ex::<_, _, ()>(&key, &json, INSTALL_KEY_TTL_SECS)
                .await?;
        }
        if let Err(e) = self.conn.publish::<_, _, ()>(&key, &json).await {
            warn!("Failed to publish install result: {}. Reconnecting...", e);
            self.reconnect().await?;
            self.conn.publish::<_, _, ()>(&key, &json).await?;
        }
        Ok(())
    }
}
