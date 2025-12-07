//! Sandbox module - Low-level isolate wrapper
//!
//! This module provides a minimal abstraction over the isolate sandbox.
//! It handles:
//! - Isolate box initialization and cleanup
//! - Cgroup detection and configuration
//! - File copy in/out helpers
//! - Raw command execution returning `SandboxOutcome`
//!
//! The sandbox module does NOT:
//! - Interpret verdicts (that's the judge's job)
//! - Know about languages or compilation
//! - Compare outputs

pub mod config;
pub mod isolate_box;
pub mod meta;

// Re-exports for convenience
pub use config::{calculate_box_id, get_config, init_config, SandboxConfig};
pub use isolate_box::{
    ensure_cgroups_available, is_cgroups_available, IoSpec, IsolateBox, Limits, SandboxOutcome,
};
pub use meta::{IsolateMeta, IsolateStatus};
