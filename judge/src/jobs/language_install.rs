//! Install / uninstall language toolchains into the `/opt/aoj-langs` volume.
//!
//! Layout: `<langs_dir>/<id>/<hash>/` per install, `<id>/current` symlink to
//! the active hash, `<id>/.installed` holding that hash. A container-wide
//! flock on `<langs_dir>/.lock` serialises installs across worker processes.
//!
//! Every filesystem helper has a `*_in(root, ..)` form taking the langs root
//! explicitly; the public wrappers resolve it from [`langs_dir`]. Tests use
//! the explicit form so they never race on the process-global env var.

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tracing::{error, info, warn};

use crate::core::languages::langs_dir;
use crate::infra::redis_manager::RedisManager;

pub const DEFAULT_INSTALL_TIMEOUT_MS: u64 = 30 * 60 * 1000;
const MAX_LOG_LINES: usize = 10_000;
/// After the script exits, how long to keep draining output that a
/// backgrounded grandchild may still be holding open.
const DRAIN_GRACE: Duration = Duration::from_secs(5);

#[derive(Debug, Serialize, Deserialize)]
pub struct InstallLanguageJob {
    pub language_id: String,
    pub script: String,
    pub hash: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UninstallLanguageJob {
    pub language_id: String,
}

#[derive(Debug, Serialize)]
pub struct LanguageInstallResult {
    pub language_id: String,
    /// `installed` | `failed` | `not_installed`
    pub state: String,
    pub hash: Option<String>,
    pub exit_code: Option<i32>,
    pub message: Option<String>,
    /// Unix seconds.
    pub finished_at: String,
}

impl LanguageInstallResult {
    fn now() -> String {
        let secs = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        secs.to_string()
    }

    pub fn installed(id: &str, hash: &str) -> Self {
        Self {
            language_id: id.into(),
            state: "installed".into(),
            hash: Some(hash.into()),
            exit_code: Some(0),
            message: None,
            finished_at: Self::now(),
        }
    }

    pub fn failed(id: &str, hash: Option<&str>, exit_code: Option<i32>, message: String) -> Self {
        Self {
            language_id: id.into(),
            state: "failed".into(),
            hash: hash.map(Into::into),
            exit_code,
            message: Some(message),
            finished_at: Self::now(),
        }
    }

    pub fn not_installed(id: &str) -> Self {
        Self {
            language_id: id.into(),
            state: "not_installed".into(),
            hash: None,
            exit_code: None,
            message: None,
            finished_at: Self::now(),
        }
    }
}

pub fn validate_language_id(id: &str) -> Result<()> {
    let ok = !id.is_empty()
        && id.len() <= 32
        && id
            .chars()
            .next()
            .is_some_and(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        && id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '_' | '+' | '-'));
    anyhow::ensure!(ok, "Invalid language id: {:?}", id);
    Ok(())
}

/// The hash becomes a directory name, so it gets the same treatment as ids:
/// no separators, no dots, and not a name reserved by the layout.
pub fn validate_install_hash(hash: &str) -> Result<()> {
    let ok = !hash.is_empty()
        && hash.len() <= 128
        && hash != "current"
        && hash
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-'));
    anyhow::ensure!(ok, "Invalid install hash: {:?}", hash);
    Ok(())
}

fn lang_dir_in(root: &Path, id: &str) -> PathBuf {
    root.join(id)
}

pub fn read_marker(id: &str) -> Option<String> {
    read_marker_in(&langs_dir(), id)
}

pub(crate) fn read_marker_in(root: &Path, id: &str) -> Option<String> {
    std::fs::read_to_string(lang_dir_in(root, id).join(".installed"))
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// Point `current` at `<hash>`, write the marker, delete other hash dirs.
pub fn activate(id: &str, hash: &str) -> Result<()> {
    activate_in(&langs_dir(), id, hash)
}

pub(crate) fn activate_in(root: &Path, id: &str, hash: &str) -> Result<()> {
    let dir = lang_dir_in(root, id);
    let target = dir.join(hash);
    anyhow::ensure!(target.is_dir(), "install dir missing: {}", target.display());
    let tmp = dir.join("current.tmp");
    let _ = std::fs::remove_file(&tmp);
    std::os::unix::fs::symlink(hash, &tmp).context("symlink current.tmp")?;
    // rename(2) over an existing symlink is atomic: readers see old or new.
    std::fs::rename(&tmp, dir.join("current")).context("rename current")?;
    std::fs::write(dir.join(".installed"), format!("{hash}\n")).context("write marker")?;
    for entry in std::fs::read_dir(&dir)?.flatten() {
        // DirEntry::file_type does not follow symlinks, so `current` is skipped.
        let is_real_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        if is_real_dir && entry.file_name() != hash {
            if let Err(e) = std::fs::remove_dir_all(entry.path()) {
                warn!(
                    "Failed to prune old install {}: {}",
                    entry.path().display(),
                    e
                );
            }
        }
    }
    Ok(())
}

pub fn remove_language_dir(id: &str) -> Result<()> {
    remove_language_dir_in(&langs_dir(), id)
}

pub(crate) fn remove_language_dir_in(root: &Path, id: &str) -> Result<()> {
    let dir = lang_dir_in(root, id);
    match std::fs::remove_dir_all(&dir) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e).with_context(|| format!("remove {}", dir.display())),
    }
}

/// Run `script` with `AOJ_PREFIX=<langs_dir>/<id>/<hash>`. Streams each
/// output line to `on_line`. Returns (captured lines, exit code; `None` on
/// timeout/signal). On anything but exit 0 the hash dir is removed. Does not
/// activate — the caller does that on success.
pub async fn run_install_script(
    id: &str,
    hash: &str,
    script: &str,
    timeout_ms: u64,
    on_line: impl FnMut(&str),
) -> Result<(Vec<String>, Option<i32>)> {
    run_install_script_in(&langs_dir(), id, hash, script, timeout_ms, on_line).await
}

pub(crate) async fn run_install_script_in(
    root: &Path,
    id: &str,
    hash: &str,
    script: &str,
    timeout_ms: u64,
    mut on_line: impl FnMut(&str),
) -> Result<(Vec<String>, Option<i32>)> {
    validate_language_id(id)?;
    validate_install_hash(hash)?;
    anyhow::ensure!(
        read_marker_in(root, id).as_deref() != Some(hash),
        "hash {hash} is the active install of {id}; refusing to overwrite it"
    );

    let prefix = lang_dir_in(root, id).join(hash);
    // Leftovers from an interrupted attempt must not leak into this one.
    match tokio::fs::remove_dir_all(&prefix).await {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(e).with_context(|| format!("clean {}", prefix.display())),
    }
    tokio::fs::create_dir_all(&prefix)
        .await
        .with_context(|| format!("create {}", prefix.display()))?;

    let outcome = spawn_and_stream(&prefix, id, hash, script, timeout_ms, &mut on_line).await;
    let ok = matches!(outcome, Ok((_, Some(0))));
    if !ok {
        let _ = tokio::fs::remove_dir_all(&prefix).await;
    }
    outcome
}

async fn spawn_and_stream(
    prefix: &Path,
    id: &str,
    hash: &str,
    script: &str,
    timeout_ms: u64,
    on_line: &mut impl FnMut(&str),
) -> Result<(Vec<String>, Option<i32>)> {
    let work = tempfile::tempdir()?;
    let script_path = work.path().join("install.sh");
    tokio::fs::write(&script_path, script).await?;

    let mut child = Command::new("bash")
        .arg("-euo")
        .arg("pipefail")
        .arg(&script_path)
        .current_dir(work.path())
        .env_clear()
        .env("PATH", "/usr/local/bin:/usr/bin:/bin")
        .env("HOME", work.path())
        .env("LANG", "C.UTF-8")
        .env("AOJ_PREFIX", prefix)
        .env("AOJ_LANGUAGE_ID", id)
        .env("AOJ_INSTALL_HASH", hash)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        // Own process group so a timeout can kill the whole tree.
        .process_group(0)
        .kill_on_drop(true)
        .spawn()
        .context("spawn install script")?;
    let pgid = child.id().map(|p| nix::unistd::Pid::from_raw(p as i32));

    let stdout = child.stdout.take().context("child stdout not piped")?;
    let stderr = child.stderr.take().context("child stderr not piped")?;
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();
    spawn_line_pump(BufReader::new(stdout), tx.clone());
    spawn_line_pump(BufReader::new(stderr), tx);

    let mut all = Vec::new();
    let mut push = |line: String, all: &mut Vec<String>| {
        on_line(&line);
        if all.len() < MAX_LOG_LINES {
            all.push(line);
        }
    };

    let deadline = tokio::time::sleep(Duration::from_millis(timeout_ms));
    tokio::pin!(deadline);
    let mut status: Option<std::process::ExitStatus> = None;
    let mut rx_open = true;
    let mut timed_out = false;
    // Phase 1: until the script exits (or the deadline hits), reading output.
    while status.is_none() {
        tokio::select! {
            line = rx.recv(), if rx_open => match line {
                Some(l) => push(l, &mut all),
                None => rx_open = false,
            },
            s = child.wait() => status = Some(s?),
            _ = &mut deadline => { timed_out = true; break; }
        }
    }
    if timed_out {
        if let Some(pgid) = pgid {
            let _ = nix::sys::signal::killpg(pgid, nix::sys::signal::Signal::SIGKILL);
        }
        let _ = child.kill().await;
    }
    // Phase 2: drain what is left. Pipes close once every holder exits; a
    // backgrounded grandchild may keep them open, so bound the wait.
    let grace = tokio::time::sleep(DRAIN_GRACE);
    tokio::pin!(grace);
    while rx_open {
        tokio::select! {
            line = rx.recv() => match line {
                Some(l) => push(l, &mut all),
                None => rx_open = false,
            },
            _ = &mut grace => break,
        }
    }

    let code = if timed_out {
        push(
            format!("install script timed out after {timeout_ms} ms"),
            &mut all,
        );
        None
    } else {
        status.and_then(|s| s.code())
    };
    Ok((all, code))
}

fn spawn_line_pump<R>(reader: BufReader<R>, tx: tokio::sync::mpsc::UnboundedSender<String>)
where
    R: tokio::io::AsyncRead + Unpin + Send + 'static,
{
    tokio::spawn(async move {
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if tx.send(line).is_err() {
                break;
            }
        }
    });
}

/// Hold an exclusive flock on `<langs_dir>/.lock` while `f` runs.
async fn with_install_lock<T>(f: impl std::future::Future<Output = T>) -> Result<T> {
    let root = langs_dir();
    tokio::fs::create_dir_all(&root)
        .await
        .with_context(|| format!("create {}", root.display()))?;
    let lock_path = root.join(".lock");
    let guard = tokio::task::spawn_blocking(move || -> Result<_> {
        let file = std::fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .write(true)
            .open(&lock_path)
            .with_context(|| format!("open {}", lock_path.display()))?;
        nix::fcntl::Flock::lock(file, nix::fcntl::FlockArg::LockExclusive)
            .map_err(|(_, errno)| anyhow::anyhow!("flock {}: {}", lock_path.display(), errno))
    })
    .await??;
    let out = f.await;
    drop(guard); // unlocks
    Ok(out)
}

fn install_timeout_ms() -> u64 {
    std::env::var("LANGUAGE_INSTALL_TIMEOUT_MS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(DEFAULT_INSTALL_TIMEOUT_MS)
}

pub async fn install_language(
    redis: &mut RedisManager,
    job: &InstallLanguageJob,
) -> LanguageInstallResult {
    let id = job.language_id.as_str();
    let hash = job.hash.as_str();
    if let Err(e) = validate_language_id(id).and_then(|_| validate_install_hash(hash)) {
        return LanguageInstallResult::failed(id, Some(hash), None, e.to_string());
    }
    let timeout_ms = install_timeout_ms();

    let result = with_install_lock(async {
        // Web clears this too on request; clearing again under the lock keeps
        // a redelivered job from appending to a previous attempt's log.
        redis.clear_install_log(id).await;
        if read_marker(id).as_deref() == Some(hash) {
            info!("Language {} already at hash {}", id, hash);
            redis
                .append_install_log(id, &format!("== {id} already installed ({hash}) =="))
                .await;
            return LanguageInstallResult::installed(id, hash);
        }
        redis
            .append_install_log(id, &format!("== installing {id} ({hash}) =="))
            .await;
        let outcome = run_streaming(redis, id, hash, &job.script, timeout_ms).await;
        finish_install(redis, id, hash, outcome).await
    })
    .await;

    match result {
        Ok(r) => r,
        Err(e) => {
            error!("install lock failed: {e:#}");
            LanguageInstallResult::failed(id, Some(hash), None, format!("lock: {e:#}"))
        }
    }
}

/// Run the script while forwarding each line to Redis as it arrives.
async fn run_streaming(
    redis: &mut RedisManager,
    id: &str,
    hash: &str,
    script: &str,
    timeout_ms: u64,
) -> Result<(Vec<String>, Option<i32>)> {
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();
    let run = run_install_script(id, hash, script, timeout_ms, move |l| {
        let _ = tx.send(l.to_string());
    });
    tokio::pin!(run);
    let outcome = loop {
        tokio::select! {
            Some(line) = rx.recv() => redis.append_install_log(id, &line).await,
            r = &mut run => break r,
        }
    };
    // `run` finished, so its sender is dropped: this drains and ends.
    while let Some(line) = rx.recv().await {
        redis.append_install_log(id, &line).await;
    }
    outcome
}

async fn finish_install(
    redis: &mut RedisManager,
    id: &str,
    hash: &str,
    outcome: Result<(Vec<String>, Option<i32>)>,
) -> LanguageInstallResult {
    match outcome {
        Ok((_, Some(0))) => {
            let (id_owned, hash_owned) = (id.to_string(), hash.to_string());
            let activated = tokio::task::spawn_blocking(move || activate(&id_owned, &hash_owned))
                .await
                .map_err(anyhow::Error::from)
                .and_then(|r| r);
            match activated {
                Ok(()) => {
                    redis.append_install_log(id, "== installed ==").await;
                    LanguageInstallResult::installed(id, hash)
                }
                Err(e) => {
                    let msg = format!("activate failed: {e:#}");
                    redis
                        .append_install_log(id, &format!("== failed: {msg} =="))
                        .await;
                    LanguageInstallResult::failed(id, Some(hash), Some(0), msg)
                }
            }
        }
        Ok((_, code)) => {
            let msg = match code {
                Some(c) => format!("install script exited with {c}"),
                None => "install script timed out or was killed".into(),
            };
            redis
                .append_install_log(id, &format!("== failed: {msg} =="))
                .await;
            LanguageInstallResult::failed(id, Some(hash), code, msg)
        }
        Err(e) => {
            let msg = format!("{e:#}");
            redis
                .append_install_log(id, &format!("== failed: {msg} =="))
                .await;
            LanguageInstallResult::failed(id, Some(hash), None, msg)
        }
    }
}

pub async fn uninstall_language(redis: &mut RedisManager, id: &str) -> LanguageInstallResult {
    if let Err(e) = validate_language_id(id) {
        return LanguageInstallResult::failed(id, None, None, e.to_string());
    }
    let id_owned = id.to_string();
    let r = with_install_lock(async move {
        tokio::task::spawn_blocking(move || remove_language_dir(&id_owned))
            .await
            .map_err(anyhow::Error::from)
            .and_then(|r| r)
    })
    .await
    .and_then(|r| r);
    match r {
        Ok(()) => {
            redis.append_install_log(id, "== removed ==").await;
            LanguageInstallResult::not_installed(id)
        }
        Err(e) => LanguageInstallResult::failed(id, None, None, format!("{e:#}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_bad_ids() {
        assert!(validate_language_id("kotlin").is_ok());
        assert!(validate_language_id("c++").is_ok());
        assert!(validate_language_id("../etc").is_err());
        assert!(validate_language_id("").is_err());
        assert!(validate_language_id("Kotlin").is_err());
        assert!(validate_language_id("a/b").is_err());
        assert!(validate_install_hash("0123abcdef99").is_ok());
        assert!(validate_install_hash("..").is_err());
        assert!(validate_install_hash("a/b").is_err());
        assert!(validate_install_hash("current").is_err());
        assert!(validate_install_hash("").is_err());
    }

    #[test]
    fn activate_swaps_symlink_and_prunes_old() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let lang = root.join("kt");
        std::fs::create_dir_all(lang.join("h1")).unwrap();
        activate_in(root, "kt", "h1").unwrap();
        assert_eq!(
            std::fs::read_link(lang.join("current")).unwrap(),
            PathBuf::from("h1")
        );
        assert_eq!(read_marker_in(root, "kt").as_deref(), Some("h1"));

        std::fs::create_dir_all(lang.join("h2")).unwrap();
        activate_in(root, "kt", "h2").unwrap();
        assert_eq!(
            std::fs::read_link(lang.join("current")).unwrap(),
            PathBuf::from("h2")
        );
        assert_eq!(read_marker_in(root, "kt").as_deref(), Some("h2"));
        assert!(!lang.join("h1").exists(), "old hash dir pruned");
        assert!(lang.join("h2").exists());
        assert!(lang.join("current").join(".").is_dir(), "current resolves");
    }

    #[test]
    fn marker_absent_when_never_installed() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(read_marker_in(tmp.path(), "nope").is_none());
    }

    #[test]
    fn remove_language_dir_is_idempotent() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        std::fs::create_dir_all(root.join("kt").join("h1")).unwrap();
        remove_language_dir_in(root, "kt").unwrap();
        assert!(!root.join("kt").exists());
        remove_language_dir_in(root, "kt").unwrap();
    }

    #[tokio::test]
    async fn failed_script_leaves_previous_install_intact() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        std::fs::create_dir_all(root.join("kt").join("old")).unwrap();
        activate_in(root, "kt", "old").unwrap();

        let mut streamed = Vec::new();
        let (lines, status) = run_install_script_in(
            root,
            "kt",
            "new",
            "echo hi; echo err >&2; exit 3",
            10_000,
            |l| streamed.push(l.to_string()),
        )
        .await
        .unwrap();
        assert_eq!(status, Some(3));
        assert!(lines.iter().any(|l| l.contains("hi")));
        assert!(streamed.iter().any(|l| l == "hi"), "stdout streamed");
        assert!(streamed.iter().any(|l| l == "err"), "stderr streamed");
        assert!(!root.join("kt").join("new").exists(), "partial dir removed");
        assert_eq!(read_marker_in(root, "kt").as_deref(), Some("old"));
        assert!(root.join("kt").join("old").is_dir());
    }

    #[tokio::test]
    async fn successful_script_installs_into_prefix() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let script =
            r#"mkdir -p "$AOJ_PREFIX/bin"; echo "$AOJ_LANGUAGE_ID" > "$AOJ_PREFIX/bin/id""#;
        let (_, status) = run_install_script_in(root, "kt", "h9", script, 10_000, |_| {})
            .await
            .unwrap();
        assert_eq!(status, Some(0));
        assert_eq!(
            std::fs::read_to_string(root.join("kt/h9/bin/id"))
                .unwrap()
                .trim(),
            "kt"
        );
    }

    #[tokio::test]
    async fn timeout_kills_script_and_removes_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let started = std::time::Instant::now();
        let (_, status) = run_install_script_in(
            root,
            "kt",
            "h1",
            "echo start; sleep 30 & sleep 30",
            300,
            |_| {},
        )
        .await
        .unwrap();
        assert_eq!(status, None);
        assert!(started.elapsed() < Duration::from_secs(5), "no long drain");
        assert!(!root.join("kt").join("h1").exists());
    }
}
