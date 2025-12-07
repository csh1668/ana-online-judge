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

/// Calculate unique box ID for a worker to prevent collisions.
/// Isolate only supports box IDs 0-9999, so we use modulo to stay in range.
/// Each worker (0-9) gets a range of 1000 box IDs.
pub fn calculate_box_id(base_counter: u32, testcase_idx: u32) -> u32 {
    let config = get_config();
    // Limit worker_id to 0-9 range (10 workers max for box ID allocation)
    let effective_worker_id = config.worker_id % 10;
    let worker_offset = effective_worker_id * 1000;
    // Use modulo to cycle within worker's range (0-999)
    worker_offset + ((base_counter * 10 + testcase_idx) % 1000)
}
