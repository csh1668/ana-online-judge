//! MinIO/S3 storage client for fetching testcases

use std::path::{Path, PathBuf};
use std::time::Duration;

use anyhow::{Context, Result};
use aws_config::BehaviorVersion;
use aws_sdk_s3::config::{Credentials, Region};
use aws_sdk_s3::Client;
use sha2::{Digest, Sha256};
use tracing::info;

/// Maximum number of attempts for `download` before giving up.
pub(crate) const MAX_DOWNLOAD_ATTEMPTS: usize = 3;
/// Backoff between attempts (ms). Length is `MAX_DOWNLOAD_ATTEMPTS - 1`.
pub(crate) const RETRY_BACKOFF_MS: [u64; 2] = [500, 1500];

/// Local, ETag-validated cache directory for testcase content. Shared by all
/// judge worker processes running in the same container (they must therefore
/// only ever write via process-unique temp file + atomic rename).
const TESTCASE_CACHE_DIR: &str = "/tmp/aoj_testcase_cache";
/// Total on-disk budget for the testcase cache. Exceeding this after a store
/// triggers eviction of the least-recently-written entries.
pub(crate) const TESTCASE_CACHE_MAX_BYTES: u64 = 2 * 1024 * 1024 * 1024;

/// S3/MinIO storage client
#[derive(Clone)]
pub struct StorageClient {
    client: Client,
    bucket: String,
}

impl StorageClient {
    /// Create a new storage client from environment variables
    pub async fn from_env() -> Result<Self> {
        let endpoint = std::env::var("MINIO_ENDPOINT").unwrap_or_else(|_| "localhost".into());
        let port = std::env::var("MINIO_PORT").unwrap_or_else(|_| "9000".into());
        let access_key = std::env::var("MINIO_ACCESS_KEY").unwrap_or_else(|_| "minioadmin".into());
        let secret_key = std::env::var("MINIO_SECRET_KEY").unwrap_or_else(|_| "minioadmin".into());
        let bucket = std::env::var("MINIO_BUCKET").unwrap_or_else(|_| "aoj-storage".into());
        let use_ssl = std::env::var("MINIO_USE_SSL")
            .map(|v| v == "true" || v == "1")
            .unwrap_or(false);

        let protocol = if use_ssl { "https" } else { "http" };
        let endpoint_url = format!("{}://{}:{}", protocol, endpoint, port);

        info!("Connecting to MinIO at {}", endpoint_url);

        let credentials = Credentials::new(access_key, secret_key, None, None, "minio");

        let config = aws_sdk_s3::Config::builder()
            .behavior_version(BehaviorVersion::latest())
            .region(Region::new("us-east-1"))
            .endpoint_url(&endpoint_url)
            .credentials_provider(credentials)
            .force_path_style(true)
            .build();

        let client = Client::from_conf(config);

        Ok(Self { client, bucket })
    }

    /// Download a file from S3/MinIO (single attempt, no retry).
    async fn download_once(&self, key: &str) -> Result<Vec<u8>> {
        let response = self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await
            .with_context(|| format!("Failed to download {}", key))?;

        let data = response.body.collect().await?;
        Ok(data.into_bytes().to_vec())
    }

    /// Download with retry — MinIO의 일시 장애가 제출 전체를 system_error로
    /// 만들지 않도록 3회 시도한다. 존재하지 않는 키 같은 영구 오류는 재시도 없이
    /// 즉시 실패시킨다 (백오프 2초 낭비 방지).
    pub async fn download(&self, key: &str) -> Result<Vec<u8>> {
        let mut last_err = None;
        for attempt in 0..MAX_DOWNLOAD_ATTEMPTS {
            match self.download_once(key).await {
                Ok(data) => return Ok(data),
                Err(e) => {
                    if is_permanent_download_error(&e) {
                        tracing::warn!("download {} failed permanently (no retry): {}", key, e);
                        return Err(e);
                    }
                    tracing::warn!(
                        "download {} failed (attempt {}/{}): {}",
                        key,
                        attempt + 1,
                        MAX_DOWNLOAD_ATTEMPTS,
                        e
                    );
                    last_err = Some(e);
                    if attempt + 1 < MAX_DOWNLOAD_ATTEMPTS {
                        tokio::time::sleep(Duration::from_millis(RETRY_BACKOFF_MS[attempt])).await;
                    }
                }
            }
        }
        Err(last_err.unwrap())
    }

    /// Download a file as string
    pub async fn download_string(&self, key: &str) -> Result<String> {
        let bytes = self.download(key).await?;
        String::from_utf8(bytes)
            .context("Invalid UTF-8 content")
            .map(|s| s.replace("\r\n", "\n"))
    }

    /// Download testcase content as string, using a local ETag-validated
    /// cache to avoid re-downloading testcases that are unchanged since a
    /// previous judge run. Intended for testcase input/output only — for
    /// one-shot objects (user source, checker scripts, ...) use
    /// `download_string` directly.
    ///
    /// Correctness always wins over caching: any HEAD failure or cache-layer
    /// IO error is logged as a warning and falls back to the plain
    /// `download` path (which already retries and fast-fails on permanent
    /// errors). CRLF normalization is applied here, at read time — the cache
    /// stores raw bytes, matching what the ETag was computed over.
    pub async fn download_string_cached(&self, key: &str) -> Result<String> {
        let cache_dir = Path::new(TESTCASE_CACHE_DIR);

        let head_etag = match self
            .client
            .head_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await
        {
            Ok(resp) => resp.e_tag().map(|s| s.to_string()),
            Err(e) => {
                tracing::warn!(
                    "testcase cache: head_object {} failed, falling back to download: {:#}",
                    key,
                    e
                );
                None
            }
        };

        if let Some(etag) = &head_etag {
            match cache_load(cache_dir, key, etag) {
                Ok(Some(data)) => {
                    return String::from_utf8(data)
                        .context("Invalid UTF-8 content")
                        .map(|s| s.replace("\r\n", "\n"));
                }
                Ok(None) => {} // miss (no entry or ETag mismatch) — fall through to download
                Err(e) => {
                    tracing::warn!("testcase cache: read {} failed: {:#}", key, e);
                }
            }
        }

        let bytes = self.download(key).await?;

        if let Some(etag) = &head_etag {
            if let Err(e) = cache_store(cache_dir, key, &bytes, etag) {
                tracing::warn!("testcase cache: write {} failed: {:#}", key, e);
            } else if let Err(e) = evict_to_budget(cache_dir, TESTCASE_CACHE_MAX_BYTES) {
                tracing::warn!("testcase cache: eviction failed: {:#}", e);
            }
        }

        String::from_utf8(bytes)
            .context("Invalid UTF-8 content")
            .map(|s| s.replace("\r\n", "\n"))
    }

    /// Upload data to a key in S3/MinIO
    pub async fn upload(&self, key: &str, data: Vec<u8>) -> Result<()> {
        use aws_sdk_s3::primitives::ByteStream;

        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(key)
            .body(ByteStream::from(data))
            .send()
            .await
            .with_context(|| format!("Failed to upload {}", key))?;
        Ok(())
    }

    /// Check if a file exists
    #[allow(dead_code)]
    pub async fn exists(&self, key: &str) -> bool {
        self.client
            .head_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await
            .is_ok()
    }
}

/// sha256 hex digest of a cache key (an object path), used as the on-disk
/// filename stem so arbitrary S3 keys (with slashes) map to flat filenames.
fn cache_key_hash(key: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(key.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// Path pair `({hash}.data, {hash}.etag)` for a given cache key.
fn cache_paths(dir: &Path, key: &str) -> (PathBuf, PathBuf) {
    let hash = cache_key_hash(key);
    (
        dir.join(format!("{}.data", hash)),
        dir.join(format!("{}.etag", hash)),
    )
}

/// Store `data` under `key`'s cache slot, recording `etag` alongside it.
///
/// Writes go through a process-unique temp file followed by `rename`, which
/// is atomic on the same filesystem — this is required because multiple
/// judge worker processes share `dir`. The `.data` file is written (and
/// renamed into place) before the `.etag` file, so a reader can never
/// observe a matching etag paired with missing/stale data: if this function
/// is interrupted between the two renames, the etag sidecar simply stays
/// stale and the next `cache_load` call treats it as a miss.
fn cache_store(dir: &Path, key: &str, data: &[u8], etag: &str) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;
    let (data_path, etag_path) = cache_paths(dir, key);
    let unique = format!(
        "{}.{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    );

    let data_tmp = dir.join(format!("{}.data.tmp.{}", cache_key_hash(key), unique));
    std::fs::write(&data_tmp, data)?;
    std::fs::rename(&data_tmp, &data_path)?;

    let etag_tmp = dir.join(format!("{}.etag.tmp.{}", cache_key_hash(key), unique));
    std::fs::write(&etag_tmp, etag.as_bytes())?;
    std::fs::rename(&etag_tmp, &etag_path)?;

    Ok(())
}

/// Load `key`'s cached content if the on-disk ETag sidecar matches `etag`.
/// Returns `Ok(None)` on any kind of miss (no entry, ETag mismatch, or the
/// data file vanished out from under a concurrent eviction) — only genuine
/// IO errors (permission denied, etc.) are surfaced as `Err`.
fn cache_load(dir: &Path, key: &str, etag: &str) -> std::io::Result<Option<Vec<u8>>> {
    let (data_path, etag_path) = cache_paths(dir, key);

    let stored_etag = match std::fs::read_to_string(&etag_path) {
        Ok(s) => s,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e),
    };
    if stored_etag != etag {
        return Ok(None);
    }

    match std::fs::read(&data_path) {
        Ok(data) => Ok(Some(data)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e),
    }
}

/// Evict `.data`/`.etag` pairs, oldest `.data` mtime first, until the total
/// size of `dir` is at or under `budget`. Missing directory is not an error
/// (nothing to evict yet). Best-effort: a removal failure on one pair is
/// skipped rather than aborting the whole pass.
fn evict_to_budget(dir: &Path, budget: u64) -> std::io::Result<()> {
    let read_dir = match std::fs::read_dir(dir) {
        Ok(rd) => rd,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(e),
    };

    let mut total: u64 = 0;
    let mut entries: Vec<(PathBuf, PathBuf, std::time::SystemTime, u64)> = Vec::new();
    for entry in read_dir {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("data") {
            continue;
        }
        let meta = entry.metadata()?;
        let mtime = meta.modified().unwrap_or(std::time::UNIX_EPOCH);
        let etag_path = path.with_extension("etag");
        let etag_size = std::fs::metadata(&etag_path).map(|m| m.len()).unwrap_or(0);
        let pair_size = meta.len() + etag_size;
        total += pair_size;
        entries.push((path, etag_path, mtime, pair_size));
    }

    if total <= budget {
        return Ok(());
    }

    entries.sort_by_key(|(_, _, mtime, _)| *mtime);

    for (data_path, etag_path, _, pair_size) in entries {
        if total <= budget {
            break;
        }
        let _ = std::fs::remove_file(&data_path);
        let _ = std::fs::remove_file(&etag_path);
        total = total.saturating_sub(pair_size);
    }

    Ok(())
}

/// 재시도해도 소용없는 영구 오류(존재하지 않는 키/버킷)인지 판별한다.
/// aws-sdk 오류의 제네릭 타입 파라미터에 대한 downcast는 SDK 버전에 취약하므로
/// 오류 체인의 표시 문자열로 판별한다.
fn is_permanent_download_error(e: &anyhow::Error) -> bool {
    let msg = format!("{:#}", e);
    msg.contains("NoSuchKey") || msg.contains("NoSuchBucket")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backoff_schedule_is_bounded() {
        assert_eq!(RETRY_BACKOFF_MS, [500, 1500]);
        assert_eq!(MAX_DOWNLOAD_ATTEMPTS, 3);
    }

    #[test]
    fn permanent_errors_are_detected_from_chain() {
        let e = anyhow::anyhow!("service error: NoSuchKey: the key does not exist")
            .context("Failed to download problems/1/tc/1.in");
        assert!(is_permanent_download_error(&e));

        let transient = anyhow::anyhow!("dispatch failure: connection refused");
        assert!(!is_permanent_download_error(&transient));
    }

    #[test]
    fn cache_roundtrip_and_etag_invalidation() {
        let dir = std::env::temp_dir().join(format!("tc_cache_test_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        cache_store(&dir, "problems/1/tc/1.in", b"hello", "etag-a").unwrap();
        assert_eq!(
            cache_load(&dir, "problems/1/tc/1.in", "etag-a").unwrap(),
            Some(b"hello".to_vec())
        );
        assert_eq!(
            cache_load(&dir, "problems/1/tc/1.in", "etag-b").unwrap(),
            None
        ); // ETag 불일치 → miss
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn eviction_removes_oldest_until_under_budget() {
        // evict_to_budget(&dir, budget)가 mtime 오래된 .data/.etag 쌍부터 지우는지 검증한다.
        let dir = std::env::temp_dir().join(format!("tc_cache_evict_test_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        cache_store(&dir, "a", b"1111", "etag-a").unwrap();
        let size_a = dir_total_bytes(&dir);
        std::thread::sleep(std::time::Duration::from_millis(20));

        cache_store(&dir, "b", b"22", "etag-b").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));

        cache_store(&dir, "c", b"333333", "etag-c").unwrap();

        // budget이 (전체 - a의 크기)이면 가장 오래된 a만 지워지고 b, c는 남아야 한다.
        let total = dir_total_bytes(&dir);
        let budget = total - size_a;
        evict_to_budget(&dir, budget).unwrap();

        assert_eq!(cache_load(&dir, "a", "etag-a").unwrap(), None);
        assert_eq!(
            cache_load(&dir, "b", "etag-b").unwrap(),
            Some(b"22".to_vec())
        );
        assert_eq!(
            cache_load(&dir, "c", "etag-c").unwrap(),
            Some(b"333333".to_vec())
        );

        std::fs::remove_dir_all(&dir).unwrap();
    }

    fn dir_total_bytes(dir: &std::path::Path) -> u64 {
        std::fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().metadata().unwrap().len())
            .sum()
    }
}
