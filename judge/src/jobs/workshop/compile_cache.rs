//! Workshop compile cache — keyed by sha256 of source + resources.
//!
//! Used to skip recompiling testlib.h-based checkers, generators, validators,
//! and solutions when their source + resource bundle is unchanged. Cache
//! lives in /tmp (process-local, container-restart wipes it — first job
//! after restart re-warms the cache).
//!
//! Cache layout:
//!   /tmp/aoj_workshop_compile_cache/{kind}/{sha256}/binary
//!
//! `kind` segments isolate cache namespaces ("checker", "generator",
//! "solution", "validator") so identical sources used in different roles
//! don't accidentally share binaries.

use anyhow::{Context, Result};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tracing::{info, warn};

const CACHE_ROOT: &str = "/tmp/aoj_workshop_compile_cache";

/// Compute a content hash combining the primary source bytes with every
/// resource file (name + content), salted by `language` and the resolved
/// `compile_cmd`. Returns hex.
///
/// The language + compile_cmd salt is critical: identical bytes compiled
/// under a different language or an updated `languages.toml` template can
/// otherwise alias to the same key and reuse an incompatible binary.
pub fn compute_hash(
    source_bytes: &[u8],
    resources: &[(String, Vec<u8>)],
    language: &str,
    compile_cmd: &[String],
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(b"--LANG--\n");
    hasher.update(language.as_bytes());
    hasher.update(b"\n--COMPILE_CMD--\n");
    for tok in compile_cmd {
        hasher.update(tok.as_bytes());
        hasher.update(b"\0");
    }
    hasher.update(b"\n--SOURCE--\n");
    hasher.update(source_bytes);
    hasher.update(b"\n--RESOURCES--\n");
    let mut sorted: Vec<&(String, Vec<u8>)> = resources.iter().collect();
    sorted.sort_by(|a, b| a.0.cmp(&b.0));
    for (name, bytes) in sorted {
        hasher.update(name.as_bytes());
        hasher.update(b":");
        hasher.update(bytes);
        hasher.update(b"\n");
    }
    format!("{:x}", hasher.finalize())
}

/// Compute the cache path for a (kind, hash) pair. The binary's filename
/// inside that directory is fixed as "binary".
pub fn cache_binary_path(kind: &str, hash: &str) -> PathBuf {
    PathBuf::from(CACHE_ROOT)
        .join(kind)
        .join(hash)
        .join("binary")
}

/// If a cached binary exists for this (kind, hash), copy it to `dest` and
/// return true. Otherwise return false.
pub async fn try_restore(kind: &str, hash: &str, dest: &Path) -> Result<bool> {
    let cache_bin = cache_binary_path(kind, hash);
    if !cache_bin.exists() {
        return Ok(false);
    }
    tokio::fs::copy(&cache_bin, dest).await.with_context(|| {
        format!(
            "Failed to restore cached {} binary from {:?}",
            kind, cache_bin
        )
    })?;
    info!(
        "Workshop compile cache HIT [{}] ({})",
        kind,
        &hash[..12.min(hash.len())]
    );
    Ok(true)
}

/// Best-effort populate the cache from a compiled binary. Logs and swallows
/// errors (caching is an optimization, not a correctness requirement).
pub async fn save(kind: &str, hash: &str, source: &Path) {
    let cache_bin = cache_binary_path(kind, hash);
    let Some(parent) = cache_bin.parent() else {
        warn!("compile_cache: invalid cache path {:?}", cache_bin);
        return;
    };
    if let Err(e) = tokio::fs::create_dir_all(parent).await {
        warn!("compile_cache: create_dir_all {:?}: {:#}", parent, e);
        return;
    }
    // Use pid + nanos as suffix so concurrent saves of the same hash don't
    // collide on the temp file. rename() is atomic on the same filesystem.
    let tmp_suffix = format!(
        ".tmp.{}.{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    );
    let tmp_bin = parent.join(format!("binary{}", tmp_suffix));
    if let Err(e) = tokio::fs::copy(source, &tmp_bin).await {
        warn!("compile_cache: copy {:?} -> {:?}: {:#}", source, tmp_bin, e);
        return;
    }
    if let Err(e) = tokio::fs::rename(&tmp_bin, &cache_bin).await {
        warn!(
            "compile_cache: rename {:?} -> {:?}: {:#}",
            tmp_bin, cache_bin, e
        );
        let _ = tokio::fs::remove_file(&tmp_bin).await;
        return;
    }
    info!(
        "Workshop compile cache MISS — populated [{}] ({})",
        kind,
        &hash[..12.min(hash.len())]
    );
}

/// Helper to read all regular files in a directory into (name, bytes)
/// pairs. Used to feed `compute_hash` with the resource set.
pub async fn read_resource_files(dir: &Path) -> Result<Vec<(String, Vec<u8>)>> {
    let mut out = Vec::new();
    let mut entries = tokio::fs::read_dir(dir).await?;
    while let Some(entry) = entries.next_entry().await? {
        let path = entry.path();
        let metadata = entry.metadata().await?;
        if !metadata.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        let bytes = tokio::fs::read(&path).await?;
        out.push((name.to_string(), bytes));
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cmd(toks: &[&str]) -> Vec<String> {
        toks.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn compute_hash_is_stable_for_same_inputs() {
        let a = compute_hash(
            b"src",
            &[("a.h".into(), b"x".to_vec())],
            "cpp",
            &cmd(&["g++"]),
        );
        let b = compute_hash(
            b"src",
            &[("a.h".into(), b"x".to_vec())],
            "cpp",
            &cmd(&["g++"]),
        );
        assert_eq!(a, b);
    }

    #[test]
    fn compute_hash_is_order_independent_for_resources() {
        let a = compute_hash(
            b"src",
            &[("a.h".into(), b"1".to_vec()), ("b.h".into(), b"2".to_vec())],
            "cpp",
            &cmd(&["g++"]),
        );
        let b = compute_hash(
            b"src",
            &[("b.h".into(), b"2".to_vec()), ("a.h".into(), b"1".to_vec())],
            "cpp",
            &cmd(&["g++"]),
        );
        assert_eq!(a, b);
    }

    #[test]
    fn compute_hash_changes_when_source_changes() {
        let a = compute_hash(b"src1", &[], "cpp", &cmd(&["g++"]));
        let b = compute_hash(b"src2", &[], "cpp", &cmd(&["g++"]));
        assert_ne!(a, b);
    }

    #[test]
    fn compute_hash_changes_when_resource_content_changes() {
        let a = compute_hash(
            b"src",
            &[("a.h".into(), b"1".to_vec())],
            "cpp",
            &cmd(&["g++"]),
        );
        let b = compute_hash(
            b"src",
            &[("a.h".into(), b"2".to_vec())],
            "cpp",
            &cmd(&["g++"]),
        );
        assert_ne!(a, b);
    }

    #[test]
    fn compute_hash_changes_when_language_changes() {
        let a = compute_hash(b"src", &[], "cpp", &cmd(&["g++"]));
        let b = compute_hash(b"src", &[], "c", &cmd(&["g++"]));
        assert_ne!(a, b);
    }

    #[test]
    fn compute_hash_changes_when_compile_cmd_changes() {
        let a = compute_hash(b"src", &[], "cpp", &cmd(&["g++", "-O2"]));
        let b = compute_hash(b"src", &[], "cpp", &cmd(&["g++", "-O3"]));
        assert_ne!(a, b);
    }

    #[test]
    fn cache_binary_path_includes_kind_and_hash() {
        let p = cache_binary_path("checker", "deadbeef");
        let s = p.to_string_lossy();
        assert!(s.contains("checker"));
        assert!(s.contains("deadbeef"));
        assert!(s.ends_with("binary"));
    }
}
