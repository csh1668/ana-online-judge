//! Sandbox configuration
//!
//! Configuration for the isolate sandbox, loaded from environment or set dynamically.

use std::sync::OnceLock;
use tracing::warn;

/// Sandbox configuration
#[derive(Debug, Clone)]
pub struct SandboxConfig {
    /// Compile time limit in milliseconds (default: 30000ms = 30s)
    pub compile_time_limit_ms: u32,
    /// Compile memory limit in MB (default: 2048MB)
    pub compile_memory_limit_mb: u32,
    /// Worker ID for box ID allocation (0-9)
    pub worker_id: u32,
}

impl Default for SandboxConfig {
    fn default() -> Self {
        Self {
            compile_time_limit_ms: 30_000,
            compile_memory_limit_mb: 2048,
            worker_id: 0,
        }
    }
}

impl SandboxConfig {
    /// Create config with a specific worker_id
    pub fn with_worker_id(worker_id: u32) -> Self {
        let mut config = Self::default();
        config.worker_id = worker_id;
        config
    }
}

/// Global sandbox configuration
static SANDBOX_CONFIG: OnceLock<SandboxConfig> = OnceLock::new();

/// Initialize sandbox configuration with dynamically assigned worker_id
pub fn init_config(worker_id: u32) -> anyhow::Result<()> {
    let sandbox_config = SandboxConfig::with_worker_id(worker_id);

    SANDBOX_CONFIG
        .set(sandbox_config)
        .map_err(|_| anyhow::anyhow!("Sandbox configuration already initialized"))?;

    Ok(())
}

/// Get sandbox configuration
pub fn get_config() -> &'static SandboxConfig {
    SANDBOX_CONFIG.get().unwrap_or_else(|| {
        static DEFAULT: OnceLock<SandboxConfig> = OnceLock::new();

        warn!("Sandbox configuration not initialized, using default");
        DEFAULT.get_or_init(SandboxConfig::default)
    })
}
