//! MinIO/S3 storage client for fetching testcases

use std::time::Duration;

use anyhow::{Context, Result};
use aws_config::BehaviorVersion;
use aws_sdk_s3::config::{Credentials, Region};
use aws_sdk_s3::Client;
use tracing::info;

/// Maximum number of attempts for `download` before giving up.
pub(crate) const MAX_DOWNLOAD_ATTEMPTS: usize = 3;
/// Backoff between attempts (ms). Length is `MAX_DOWNLOAD_ATTEMPTS - 1`.
pub(crate) const RETRY_BACKOFF_MS: [u64; 2] = [500, 1500];

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
    /// 만들지 않도록 3회 시도한다.
    pub async fn download(&self, key: &str) -> Result<Vec<u8>> {
        let mut last_err = None;
        for attempt in 0..MAX_DOWNLOAD_ATTEMPTS {
            match self.download_once(key).await {
                Ok(data) => return Ok(data),
                Err(e) => {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backoff_schedule_is_bounded() {
        assert_eq!(RETRY_BACKOFF_MS, [500, 1500]);
        assert_eq!(MAX_DOWNLOAD_ATTEMPTS, 3);
    }
}
