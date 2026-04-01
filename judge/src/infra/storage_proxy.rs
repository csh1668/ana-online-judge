//! Storage proxy server for Python checkers
//!
//! Provides a lightweight HTTP proxy that allows sandboxed Python checkers
//! to access MinIO storage via environment variables. Access is scoped to
//! `problems/{problem_id}/state/` to prevent unauthorized access.

use std::sync::Arc;

use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::get;
use axum::Router;
use tokio::net::TcpListener;
use tracing::{debug, warn};

use super::storage::StorageClient;

/// Shared state for the storage proxy
struct ProxyState {
    storage: StorageClient,
    problem_id: i64,
    token: String,
}

/// Storage proxy server handle
pub struct StorageProxy {
    port: u16,
    handle: tokio::task::JoinHandle<()>,
}

impl StorageProxy {
    /// Start the storage proxy server on a random localhost port.
    ///
    /// Returns the proxy handle (call `stop()` when done) and the port number.
    pub async fn start(
        storage: StorageClient,
        problem_id: i64,
        token: &str,
    ) -> anyhow::Result<Self> {
        let state = Arc::new(ProxyState {
            storage,
            problem_id,
            token: token.to_string(),
        });

        let app = Router::new()
            .route(
                "/storage/{*path}",
                get(handle_get).put(handle_put).head(handle_head),
            )
            .with_state(state);

        let listener = TcpListener::bind("127.0.0.1:0").await?;
        let port = listener.local_addr()?.port();

        let handle = tokio::spawn(async move {
            let _ = axum::serve(listener, app).await;
        });

        debug!(
            "Storage proxy started on port {} for problem {}",
            port, problem_id
        );

        Ok(Self { port, handle })
    }

    /// Get the port the proxy is listening on
    #[allow(dead_code)]
    pub fn port(&self) -> u16 {
        self.port
    }

    /// Build environment variables for checkers to access this proxy
    pub fn env_vars(
        &self,
        problem_id: i64,
        submission_id: i64,
        token: &str,
    ) -> Vec<(String, String)> {
        vec![
            (
                "AOJ_STORAGE_ENDPOINT".to_string(),
                format!("http://127.0.0.1:{}", self.port),
            ),
            ("AOJ_STORAGE_TOKEN".to_string(), token.to_string()),
            ("AOJ_PROBLEM_ID".to_string(), problem_id.to_string()),
            ("AOJ_SUBMISSION_ID".to_string(), submission_id.to_string()),
        ]
    }

    /// Stop the proxy server
    pub async fn stop(self) {
        self.handle.abort();
        let _ = self.handle.await;
        debug!("Storage proxy stopped");
    }
}

/// Validate the Bearer token from the request
fn validate_token(state: &ProxyState, headers: &HeaderMap) -> Result<(), StatusCode> {
    let auth = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let expected = format!("Bearer {}", state.token);
    if auth != expected {
        warn!("Storage proxy: invalid token");
        return Err(StatusCode::UNAUTHORIZED);
    }
    Ok(())
}

/// Build the MinIO key from the request path, scoped to problems/{id}/state/
fn build_key(state: &ProxyState, path: &str) -> String {
    let path = path.trim_start_matches('/');
    format!("problems/{}/state/{}", state.problem_id, path)
}

/// GET /storage/{path} — download a file from MinIO
async fn handle_get(
    State(state): State<Arc<ProxyState>>,
    headers: HeaderMap,
    Path(path): Path<String>,
) -> Result<Bytes, StatusCode> {
    validate_token(&state, &headers)?;
    let key = build_key(&state, &path);
    debug!("Storage proxy GET: {}", key);

    match state.storage.download(&key).await {
        Ok(data) => Ok(Bytes::from(data)),
        Err(e) => {
            debug!("Storage proxy GET failed: {}", e);
            Err(StatusCode::NOT_FOUND)
        }
    }
}

/// PUT /storage/{path} — upload a file to MinIO
async fn handle_put(
    State(state): State<Arc<ProxyState>>,
    headers: HeaderMap,
    Path(path): Path<String>,
    body: Bytes,
) -> Result<StatusCode, StatusCode> {
    validate_token(&state, &headers)?;
    let key = build_key(&state, &path);
    debug!("Storage proxy PUT: {} ({} bytes)", key, body.len());

    match state.storage.upload(&key, body.to_vec()).await {
        Ok(_) => Ok(StatusCode::OK),
        Err(e) => {
            warn!("Storage proxy PUT failed: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

/// HEAD /storage/{path} — check if a file exists in MinIO
async fn handle_head(
    State(state): State<Arc<ProxyState>>,
    headers: HeaderMap,
    Path(path): Path<String>,
) -> StatusCode {
    if validate_token(&state, &headers).is_err() {
        return StatusCode::UNAUTHORIZED;
    }
    let key = build_key(&state, &path);
    debug!("Storage proxy HEAD: {}", key);

    if state.storage.exists(&key).await {
        StatusCode::OK
    } else {
        StatusCode::NOT_FOUND
    }
}
