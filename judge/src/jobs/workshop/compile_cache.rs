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
/// resource file (name + content), salted by `language`, the resolved
/// `compile_cmd` and the toolchain identity. Returns hex.
///
/// The language + compile_cmd salt is critical: identical bytes compiled
/// under a different language or an updated compile template can otherwise
/// alias to the same key and reuse an incompatible binary. The toolchain
/// identity (`install_hash`, `compile_script`, `env`) extends that to
/// reinstalled or reconfigured volume toolchains.
///
/// Toolchain sections are only hashed when present (`Some` / non-empty), each
/// behind its own fixed tag (`--INSTALL_HASH--`, `--COMPILE_SCRIPT--`,
/// `--ENV--` with one `KEY=VALUE\0` per pair). Absent sections contribute no
/// bytes, so the key for builtin languages and trusted g++ compiles is
/// byte-identical to the pre-toolchain scheme and existing entries stay warm,
/// while the distinct tags keep the fields from aliasing one another.
pub fn compute_hash(
    source_bytes: &[u8],
    resources: &[(String, Vec<u8>)],
    language: &str,
    compile_cmd: &[String],
    install_hash: Option<&str>,
    compile_script: Option<&str>,
    env: &[(String, String)],
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(b"--LANG--\n");
    hasher.update(language.as_bytes());
    hasher.update(b"\n--COMPILE_CMD--\n");
    for tok in compile_cmd {
        hasher.update(tok.as_bytes());
        hasher.update(b"\0");
    }
    if let Some(h) = install_hash {
        hasher.update(b"\n--INSTALL_HASH--\n");
        hasher.update(h.as_bytes());
    }
    if let Some(script) = compile_script {
        hasher.update(b"\n--COMPILE_SCRIPT--\n");
        hasher.update(script.as_bytes());
    }
    if !env.is_empty() {
        hasher.update(b"\n--ENV--\n");
        for (k, v) in env {
            hasher.update(k.as_bytes());
            hasher.update(b"=");
            hasher.update(v.as_bytes());
            hasher.update(b"\0");
        }
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
            None,
            None,
            &[],
        );
        let b = compute_hash(
            b"src",
            &[("a.h".into(), b"x".to_vec())],
            "cpp",
            &cmd(&["g++"]),
            None,
            None,
            &[],
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
            None,
            None,
            &[],
        );
        let b = compute_hash(
            b"src",
            &[("b.h".into(), b"2".to_vec()), ("a.h".into(), b"1".to_vec())],
            "cpp",
            &cmd(&["g++"]),
            None,
            None,
            &[],
        );
        assert_eq!(a, b);
    }

    #[test]
    fn compute_hash_changes_when_source_changes() {
        let a = compute_hash(b"src1", &[], "cpp", &cmd(&["g++"]), None, None, &[]);
        let b = compute_hash(b"src2", &[], "cpp", &cmd(&["g++"]), None, None, &[]);
        assert_ne!(a, b);
    }

    #[test]
    fn compute_hash_changes_when_resource_content_changes() {
        let a = compute_hash(
            b"src",
            &[("a.h".into(), b"1".to_vec())],
            "cpp",
            &cmd(&["g++"]),
            None,
            None,
            &[],
        );
        let b = compute_hash(
            b"src",
            &[("a.h".into(), b"2".to_vec())],
            "cpp",
            &cmd(&["g++"]),
            None,
            None,
            &[],
        );
        assert_ne!(a, b);
    }

    #[test]
    fn compute_hash_changes_when_language_changes() {
        let a = compute_hash(b"src", &[], "cpp", &cmd(&["g++"]), None, None, &[]);
        let b = compute_hash(b"src", &[], "c", &cmd(&["g++"]), None, None, &[]);
        assert_ne!(a, b);
    }

    #[test]
    fn compute_hash_changes_when_compile_cmd_changes() {
        let a = compute_hash(b"src", &[], "cpp", &cmd(&["g++", "-O2"]), None, None, &[]);
        let b = compute_hash(b"src", &[], "cpp", &cmd(&["g++", "-O3"]), None, None, &[]);
        assert_ne!(a, b);
    }

    #[test]
    fn compute_hash_changes_when_install_hash_changes() {
        let a = compute_hash(b"src", &[], "kt", &cmd(&["kotlinc"]), Some("h1"), None, &[]);
        let b = compute_hash(b"src", &[], "kt", &cmd(&["kotlinc"]), Some("h2"), None, &[]);
        let none = compute_hash(b"src", &[], "kt", &cmd(&["kotlinc"]), None, None, &[]);
        assert_ne!(a, b);
        assert_ne!(a, none);
    }

    #[test]
    fn compute_hash_changes_when_compile_script_or_env_changes() {
        let base = compute_hash(b"src", &[], "cs", &cmd(&["sh"]), None, Some("v1"), &[]);
        let script = compute_hash(b"src", &[], "cs", &cmd(&["sh"]), None, Some("v2"), &[]);
        let env = [("K".to_string(), "V".to_string())];
        let with_env = compute_hash(b"src", &[], "cs", &cmd(&["sh"]), None, Some("v1"), &env);
        assert_ne!(base, script);
        assert_ne!(base, with_env);
    }

    #[test]
    fn compute_hash_without_toolchain_matches_legacy_scheme() {
        // Legacy key: LANG + COMPILE_CMD + SOURCE + RESOURCES only.
        let mut h = Sha256::new();
        h.update(b"--LANG--\ncpp\n--COMPILE_CMD--\ng++\0\n--SOURCE--\nsrc\n--RESOURCES--\n");
        let legacy = format!("{:x}", h.finalize());
        assert_eq!(
            compute_hash(b"src", &[], "cpp", &cmd(&["g++"]), None, None, &[]),
            legacy
        );
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
