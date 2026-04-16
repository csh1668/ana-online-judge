//! Workshop (창작마당) job handlers.
//!
//! Three job types share a common pattern:
//! 1. Download the draft's resource files **flat into the sandbox work_dir
//!    root** (so `copy_dir_in`, which skips subdirectories, mounts them).
//! 2. Compile the user-provided source (generator / validator / solution) with
//!    `include_dirs=[.]` (work_dir root, as seen inside the sandbox box).
//! 3. Run in the isolate sandbox.
//! 4. Publish result to Redis (`workshop:{generate,validate,invoke}:results`).
//!
//! All handlers target the **active user draft** identified by
//! `(problem_id, user_id)` — MinIO path prefix
//! `workshop/{problem_id}/drafts/{user_id}/`.
//!
//! # Wire Format (for Phase 4 web enqueuers)
//!
//! All three job variants are enqueued via `RPUSH judge:queue <json>` using
//! the same Redis list used by existing `judge` / `validate` jobs. `job_type`
//! is the `#[serde(tag)]` discriminator.
//!
//! ## `workshop_generate`
//! ```json
//! {
//!   "job_type": "workshop_generate",
//!   "job_id": "<uuid or unique string>",
//!   "problem_id": 42,
//!   "user_id": 7,
//!   "testcase_index": 3,
//!   "language": "cpp",
//!   "source_path": "workshop/42/drafts/7/generators/gen-random.cpp",
//!   "args": ["100", "50"],
//!   "seed": "a3f7c2",
//!   "resources": [
//!     {"name": "testlib.h", "storage_path": "workshop/42/drafts/7/resources/testlib.h"}
//!   ],
//!   "output_path": "workshop/42/drafts/7/testcases/testcase_3.input.txt",
//!   "time_limit_ms": 30000,
//!   "memory_limit_mb": 1024
//! }
//! ```
//!
//! The judge **appends** `seed` to `args` before running — do NOT duplicate it
//! in `args`. Result key: `workshop:generate:result:<job_id>` (1h TTL).
//! Result channel: `workshop:generate:results` (global) and
//! `workshop:<problem_id>:generate` (per-problem).
//!
//! ## `workshop_validate`
//! ```json
//! {
//!   "job_type": "workshop_validate",
//!   "job_id": "<uuid>",
//!   "problem_id": 42,
//!   "user_id": 7,
//!   "testcase_id": 101,
//!   "language": "cpp",
//!   "validator_source_path": "workshop/42/drafts/7/validator.cpp",
//!   "input_path": "workshop/42/drafts/7/testcases/testcase_1.input.txt",
//!   "resources": [],
//!   "time_limit_ms": 30000,
//!   "memory_limit_mb": 1024
//! }
//! ```
//! Result key: `workshop:validate:result:<job_id>`. Result channels:
//! `workshop:validate:results` and `workshop:<problem_id>:validate`.
//!
//! ## `workshop_invoke`
//! ```json
//! {
//!   "job_type": "workshop_invoke",
//!   "job_id": "<uuid>",
//!   "problem_id": 42,
//!   "user_id": 7,
//!   "invocation_id": 9001,
//!   "solution_id": 12,
//!   "testcase_id": 101,
//!   "language": "cpp",
//!   "solution_source_path": "workshop/42/drafts/7/solutions/main.cpp",
//!   "input_path": "workshop/42/drafts/7/testcases/testcase_1.input.txt",
//!   "answer_path": "workshop/42/drafts/7/testcases/testcase_1.output.txt",
//!   "resources": [],
//!   "checker": {"language": "cpp", "source_path": "workshop/42/drafts/7/checker.cpp"},
//!   "base_time_limit_ms": 1000,
//!   "base_memory_limit_mb": 256,
//!   "stdout_upload_path": "workshop/42/invocations/9001/12_101.output.txt"
//! }
//! ```
//! Optional fields: `checker`, `stdout_upload_path`. `answer_path` is
//! declared `Option<String>` for future flexibility but is a **required
//! precondition** in practice: the web layer (Phase 6) hard-gates
//! invocation creation on the presence of a recently-generated answer
//! file from an `isMain=true` solution. The judge treats a missing
//! `answer_path` as a `system_error` (invariant violation), NOT as a
//! user-facing error. If `checker` is absent, a token-level ICPC
//! compare is used (same as `compare_output` in `judger.rs`).
//!
//! Result key: `workshop:invoke:result:<job_id>`. Result channels:
//! `workshop:invoke:results`, and — critical for SSE — the per-invocation
//! channel `workshop:<problem_id>:invocation:<invocation_id>`.
//!
//! # Language limits (for `workshop_validate` and checker)
//! - Validator / checker language is restricted to `cpp` / `python` (spec §5).
//!   Anything else returns `system_error`.
//! - Checker: MVP accepts only `cpp`. Python checker support in workshop is 2차.
//!
//! # Resources injection strategy
//! - `resources` is a flat list. The handler drops each file at the
//!   **sandbox work_dir root** (not in a subdirectory — `copy_dir_in`
//!   skips subdirectories; see `judge/src/engine/isolate_box.rs`).
//! - For compile-time consumers (C/C++/Java): `{include_flags}` is spliced
//!   into `languages.toml`'s `compile_command` with `-I.` / `-cp .:...`.
//! - For runtime-only consumers (Python/JavaScript): `PYTHONPATH=.`
//!   / `NODE_PATH=.` is passed via sandbox env vars.
//! - Rust and Go: resources are staged but not wired in — see
//!   `crate::engine::compiler::include_flags` doc table for rationale.
//! - **Resource name invariant** (enforced by the web layer):
//!   resource filenames MUST NOT collide with reserved slot names
//!   (`main.*`, `checker.*`, `validator.*`). The judge trusts this
//!   and does not re-check.

pub mod compile_cache;
pub mod generate;
pub mod invoke;
pub mod validate;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tracing::debug;

use crate::infra::storage::StorageClient;

/// A single resource file referenced by a workshop job.
///
/// The web layer (which owns the authoritative view of a draft's resources)
/// enumerates every resource file and sends it as a `{name, storage_path}`
/// pair. The handler writes each file directly into the sandbox work_dir
/// root (flat — `copy_dir_in` skips subdirectories).
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkshopResource {
    /// File name as it should appear at the sandbox work_dir root, e.g.
    /// `"testlib.h"`. MUST NOT collide with reserved slot names
    /// (`main.*`, `checker.*`, `validator.*`) — the web layer enforces this.
    pub name: String,
    /// Full MinIO key, e.g. `"workshop/42/drafts/7/resources/testlib.h"`.
    pub storage_path: String,
}

/// Download every resource file into `work_dir` **directly at the root**.
///
/// Resources are flattened into the sandbox box root so that
/// `copy_dir_in` (which skips subdirectories) picks them up. The include
/// path for compile/run is therefore `.` (the box root).
///
/// **Assumption:** resource names MUST NOT collide with reserved slot
/// names (`main.*`, `checker.*`, `validator.*`). The web layer (Phase 4+)
/// enforces this on upload; the judge trusts the invariant.
pub(crate) async fn fetch_resources_into(
    storage: &StorageClient,
    work_dir: &Path,
    resources: &[WorkshopResource],
) -> Result<()> {
    for r in resources {
        let bytes = storage
            .download(&r.storage_path)
            .await
            .with_context(|| format!("Failed to fetch resource {}", r.storage_path))?;
        let dest = work_dir.join(&r.name);
        tokio::fs::write(&dest, &bytes)
            .await
            .with_context(|| format!("Failed to write resource to {:?}", dest))?;
        debug!(
            "Fetched workshop resource {} ({} bytes) -> {:?}",
            r.storage_path,
            bytes.len(),
            dest
        );
    }

    Ok(())
}

#[cfg(test)]
mod integration_tests {
    //! Snapshot-style tests verifying the exact serde wire format that the
    //! web (Phase 4) will emit. Any rename or tag change here is a breaking
    //! API change for workers already in production.

    use crate::jobs::WorkerJob;
    use serde_json::json;

    #[test]
    fn worker_job_tag_for_workshop_generate() {
        let wire = json!({
            "job_type": "workshop_generate",
            "job_id": "uuid-1",
            "problem_id": 1,
            "user_id": 2,
            "testcase_index": 3,
            "language": "cpp",
            "source_path": "workshop/1/drafts/2/generators/gen.cpp",
            "args": ["10"],
            "seed": "a3f7c2",
            "resources": [],
            "output_path": "workshop/1/drafts/2/testcases/testcase_3.input.txt",
            "time_limit_ms": 30000,
            "memory_limit_mb": 1024
        });
        let parsed: WorkerJob = serde_json::from_value(wire).unwrap();
        assert!(matches!(parsed, WorkerJob::WorkshopGenerate(_)));
    }

    #[test]
    fn worker_job_tag_for_workshop_validate() {
        let wire = json!({
            "job_type": "workshop_validate",
            "job_id": "uuid-2",
            "problem_id": 1,
            "user_id": 2,
            "testcase_id": 99,
            "language": "cpp",
            "validator_source_path": "workshop/1/drafts/2/validator.cpp",
            "input_path": "workshop/1/drafts/2/testcases/testcase_1.input.txt",
            "resources": [],
            "time_limit_ms": 30000,
            "memory_limit_mb": 1024
        });
        let parsed: WorkerJob = serde_json::from_value(wire).unwrap();
        assert!(matches!(parsed, WorkerJob::WorkshopValidate(_)));
    }

    #[test]
    fn worker_job_tag_for_workshop_invoke() {
        let wire = json!({
            "job_type": "workshop_invoke",
            "job_id": "uuid-3",
            "problem_id": 1,
            "user_id": 2,
            "invocation_id": 10,
            "solution_id": 5,
            "testcase_id": 99,
            "language": "cpp",
            "solution_source_path": "workshop/1/drafts/2/solutions/main.cpp",
            "input_path": "workshop/1/drafts/2/testcases/testcase_1.input.txt",
            "resources": [],
            "base_time_limit_ms": 1000,
            "base_memory_limit_mb": 256
        });
        let parsed: WorkerJob = serde_json::from_value(wire).unwrap();
        assert!(matches!(parsed, WorkerJob::WorkshopInvoke(_)));
    }

    #[test]
    fn workshop_invoke_allows_missing_optional_fields() {
        // No answer_path, no checker, no stdout_upload_path.
        let wire = json!({
            "job_type": "workshop_invoke",
            "job_id": "uuid-3",
            "problem_id": 1,
            "user_id": 2,
            "invocation_id": 10,
            "solution_id": 5,
            "testcase_id": 99,
            "language": "cpp",
            "solution_source_path": "s",
            "input_path": "i",
            "base_time_limit_ms": 1000,
            "base_memory_limit_mb": 256
        });
        let parsed: WorkerJob = serde_json::from_value(wire).unwrap();
        assert!(matches!(parsed, WorkerJob::WorkshopInvoke(_)));
    }

    #[test]
    fn unknown_job_type_rejected() {
        let wire = json!({"job_type": "nonexistent"});
        let err: Result<WorkerJob, _> = serde_json::from_value(wire);
        assert!(err.is_err());
    }
}
