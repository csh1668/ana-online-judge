//! Install / uninstall language toolchains into the `/opt/aoj-langs` volume.
//!
//! Layout: `<langs_dir>/<id>/<hash>/` per install, `<id>/current` symlink to
//! the active hash, `<id>/.installed` holding that hash, `<id>/.previous`
//! holding the hash `current` pointed at before the last swap. That previous
//! dir is kept on disk (a compile in another worker may have resolved
//! `current` to it just before the swap) and doubles as a rollback target.
//! Every other hash dir is pruned on activation. A container-wide
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
    read_trimmed(&lang_dir_in(root, id).join(".installed"))
}

/// True when `<id>/current` is a symlink pointing at `<hash>` (whatever the
/// marker says — a crash between the `rename` and the marker write leaves
/// `current` updated but the marker stale).
fn current_points_to_in(root: &Path, id: &str, hash: &str) -> bool {
    std::fs::read_link(lang_dir_in(root, id).join("current"))
        .ok()
        .and_then(|p| p.to_str().map(str::to_string))
        .as_deref()
        == Some(hash)
}

/// True only when `hash` is consistently and completely the active install
/// of `id`: the marker says so, `current` resolves to it, and its dir
/// exists. Any partial state (crash mid-activation, or a marker left over
/// from a wipe) returns false so the caller repairs or reinstalls instead of
/// trusting a single source of truth.
pub(crate) fn is_fully_installed_in(root: &Path, id: &str, hash: &str) -> bool {
    let dir = lang_dir_in(root, id);
    read_trimmed(&dir.join(".installed")).as_deref() == Some(hash)
        && current_points_to_in(root, id, hash)
        && dir.join(hash).is_dir()
}

fn read_trimmed(path: &Path) -> Option<String> {
    std::fs::read_to_string(path)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// Write `path` via `<path>.tmp` + rename so readers never see a torn file.
fn write_atomic(path: &Path, contents: &str) -> Result<()> {
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".tmp");
    let tmp = PathBuf::from(tmp);
    std::fs::write(&tmp, contents).with_context(|| format!("write {}", tmp.display()))?;
    std::fs::rename(&tmp, path).with_context(|| format!("rename {}", path.display()))
}

/// Point `current` at `<hash>`, write the marker, keep the previous target,
/// delete every other hash dir.
pub(crate) fn activate_in(root: &Path, id: &str, hash: &str) -> Result<()> {
    let dir = lang_dir_in(root, id);
    let target = dir.join(hash);
    anyhow::ensure!(target.is_dir(), "install dir missing: {}", target.display());
    let current = dir.join("current");
    let prev_target = std::fs::read_link(&current)
        .ok()
        .and_then(|p| p.to_str().map(str::to_string));
    // The dir `current` pointed at until now stays; re-activating the same
    // hash keeps whatever was already recorded as previous.
    let keep_prev = match prev_target {
        Some(p) if p != hash => Some(p),
        _ => read_trimmed(&dir.join(".previous")).filter(|p| p != hash),
    };

    let tmp = dir.join("current.tmp");
    let _ = std::fs::remove_file(&tmp);
    std::os::unix::fs::symlink(hash, &tmp).context("symlink current.tmp")?;
    // rename(2) over an existing symlink is atomic: readers see old or new.
    std::fs::rename(&tmp, &current).context("rename current")?;
    write_atomic(&dir.join(".installed"), &format!("{hash}\n")).context("write marker")?;
    match &keep_prev {
        Some(p) => write_atomic(&dir.join(".previous"), &format!("{p}\n"))?,
        None => {
            let _ = std::fs::remove_file(dir.join(".previous"));
        }
    }

    for entry in std::fs::read_dir(&dir)?.flatten() {
        // DirEntry::file_type does not follow symlinks, so `current` is skipped.
        let is_real_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let name = entry.file_name();
        let keep = name == hash || keep_prev.as_deref().is_some_and(|p| name == p);
        if is_real_dir && !keep {
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

/// True when `<hash>` is the kept previous install (complete, not a partial
/// leftover), so it can be re-activated without running the script.
pub(crate) fn is_kept_previous_in(root: &Path, id: &str, hash: &str) -> bool {
    let dir = lang_dir_in(root, id);
    read_trimmed(&dir.join(".previous")).as_deref() == Some(hash) && dir.join(hash).is_dir()
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
    anyhow::ensure!(
        !current_points_to_in(root, id, hash),
        "hash {hash} is the current install of {id}; refusing to overwrite it"
    );
    anyhow::ensure!(
        !is_kept_previous_in(root, id, hash),
        "hash {hash} is the kept previous install of {id}; activate it instead"
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
        .envs(proxy_env())
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
    // Kill the whole group on every path: on timeout the script itself, on
    // exit any daemon it backgrounded, which must not keep writing into the
    // prefix while it is activated or cleaned up.
    if let Some(pgid) = pgid {
        let _ = nix::sys::signal::killpg(pgid, nix::sys::signal::Signal::SIGKILL);
    }
    if timed_out {
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

const PROXY_VARS: [&str; 6] = [
    "http_proxy",
    "https_proxy",
    "no_proxy",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
];

/// Proxy settings from the worker's env, so installs work behind a proxy.
fn proxy_env() -> Vec<(&'static str, String)> {
    PROXY_VARS
        .iter()
        .filter_map(|k| std::env::var(k).ok().map(|v| (*k, v)))
        .collect()
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

/// How an install request ended, short of an error.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum InstallOutcome {
    /// Marker already equals the requested hash; nothing done.
    AlreadyInstalled,
    /// Requested hash was the kept previous install; re-activated, no script.
    RolledBack,
    /// Script exited 0 and the new dir was activated.
    Installed,
    /// Script exited non-zero (`Some`) or timed out / was killed (`None`).
    ScriptFailed(Option<i32>),
}

/// Install decision + execution against an explicit root, no Redis. Caller
/// must hold the install lock.
pub(crate) async fn install_in(
    root: &Path,
    id: &str,
    hash: &str,
    script: &str,
    timeout_ms: u64,
    on_line: impl FnMut(&str),
) -> Result<InstallOutcome> {
    validate_language_id(id)?;
    validate_install_hash(hash)?;
    if is_fully_installed_in(root, id, hash) {
        return Ok(InstallOutcome::AlreadyInstalled);
    }
    // `current` already resolved to `hash` but the marker disagrees: a
    // previous attempt crashed between the symlink rename and the marker
    // write. Re-activating fixes the marker (and prunes stragglers) without
    // re-running the script, which the dir already reflects.
    if current_points_to_in(root, id, hash) && lang_dir_in(root, id).join(hash).is_dir() {
        activate_blocking(root, id, hash).await?;
        return Ok(InstallOutcome::AlreadyInstalled);
    }
    if is_kept_previous_in(root, id, hash) {
        activate_blocking(root, id, hash).await?;
        return Ok(InstallOutcome::RolledBack);
    }
    let (_, code) = run_install_script_in(root, id, hash, script, timeout_ms, on_line).await?;
    if code != Some(0) {
        return Ok(InstallOutcome::ScriptFailed(code));
    }
    activate_blocking(root, id, hash)
        .await
        .context("activate failed")?;
    Ok(InstallOutcome::Installed)
}

async fn activate_blocking(root: &Path, id: &str, hash: &str) -> Result<()> {
    let (root, id, hash) = (root.to_path_buf(), id.to_string(), hash.to_string());
    tokio::task::spawn_blocking(move || activate_in(&root, &id, &hash)).await?
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
        redis
            .append_install_log(id, &format!("== installing {id} ({hash}) =="))
            .await;
        let outcome = run_streaming(redis, id, hash, &job.script, timeout_ms).await;
        let (line, result) = match outcome {
            Ok(InstallOutcome::AlreadyInstalled) => {
                info!("Language {} already at hash {}", id, hash);
                (
                    "== already installed ==".to_string(),
                    LanguageInstallResult::installed(id, hash),
                )
            }
            Ok(InstallOutcome::RolledBack) => {
                info!("Language {} rolled back to kept hash {}", id, hash);
                (
                    "== re-activated previous install ==".to_string(),
                    LanguageInstallResult::installed(id, hash),
                )
            }
            Ok(InstallOutcome::Installed) => (
                "== installed ==".to_string(),
                LanguageInstallResult::installed(id, hash),
            ),
            Ok(InstallOutcome::ScriptFailed(code)) => {
                let msg = match code {
                    Some(c) => format!("install script exited with {c}"),
                    None => "install script timed out or was killed".into(),
                };
                (
                    format!("== failed: {msg} =="),
                    LanguageInstallResult::failed(id, Some(hash), code, msg),
                )
            }
            Err(e) => {
                let msg = format!("{e:#}");
                (
                    format!("== failed: {msg} =="),
                    LanguageInstallResult::failed(id, Some(hash), None, msg),
                )
            }
        };
        redis.append_install_log(id, &line).await;
        result
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

/// Run [`install_in`] while forwarding each script line to Redis as it arrives.
async fn run_streaming(
    redis: &mut RedisManager,
    id: &str,
    hash: &str,
    script: &str,
    timeout_ms: u64,
) -> Result<InstallOutcome> {
    let root = langs_dir();
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();
    let run = install_in(&root, id, hash, script, timeout_ms, move |l| {
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

/// On boot, (re)install every volume language whose install is not fully
/// and consistently present (marker + `current` symlink + hash dir all
/// agreeing) with the snapshot's `install_hash`. Serialised by the install
/// lock, so with N worker processes exactly one does the work and the rest
/// observe the on-disk state and pass through quickly. Never aborts boot:
/// any failure is logged and the next language is tried.
pub async fn self_heal_on_boot(redis: &mut RedisManager) {
    let root = langs_dir();
    for cfg in crate::core::languages::all_language_configs() {
        let Some(hash) = cfg.install_hash.clone() else {
            continue;
        };
        if is_fully_installed_in(&root, &cfg.id, &hash) {
            continue;
        }
        let script = match redis.get_install_script(&cfg.id).await {
            Ok(Some(s)) => s,
            Ok(None) => {
                warn!(
                    "No install script for {} in judge:languages:scripts; skipping",
                    cfg.id
                );
                continue;
            }
            Err(e) => {
                warn!("Failed to read install script for {}: {}", cfg.id, e);
                continue;
            }
        };
        info!(
            "Self-heal: installing {} ({}), current marker: {:?}",
            cfg.id,
            hash,
            read_marker(&cfg.id)
        );
        let job = InstallLanguageJob {
            language_id: cfg.id.clone(),
            script,
            hash,
        };
        let result = install_language(redis, &job).await;
        if let Err(e) = redis.store_language_install_result(&result).await {
            warn!("Failed to publish self-heal result for {}: {}", cfg.id, e);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_fully_installed_requires_marker_current_and_dir_to_agree() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let lang = root.join("kt");
        std::fs::create_dir_all(lang.join("h1")).unwrap();

        // Nothing on disk yet.
        assert!(!is_fully_installed_in(root, "kt", "h1"));

        // Marker only (no `current` symlink, no consistent dir check bypassed
        // since dir does exist here — but current missing is enough to fail).
        write_atomic(&lang.join(".installed"), "h1\n").unwrap();
        assert!(!is_fully_installed_in(root, "kt", "h1"), "current missing");

        // `current` only (marker removed), dir present.
        std::fs::remove_file(lang.join(".installed")).unwrap();
        std::os::unix::fs::symlink("h1", lang.join("current")).unwrap();
        assert!(!is_fully_installed_in(root, "kt", "h1"), "marker missing");

        // Marker + current agree, but the hash dir itself is gone.
        write_atomic(&lang.join(".installed"), "h1\n").unwrap();
        std::fs::remove_dir_all(lang.join("h1")).unwrap();
        assert!(!is_fully_installed_in(root, "kt", "h1"), "dir missing");

        // All three agree.
        std::fs::create_dir_all(lang.join("h1")).unwrap();
        assert!(is_fully_installed_in(root, "kt", "h1"));
    }

    #[tokio::test]
    async fn install_in_repairs_stale_marker_when_current_already_matches() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let lang = root.join("kt");
        // Simulate a crash between the `current` rename and the marker
        // write: `current` -> h1, dir h1 exists, but no marker yet.
        std::fs::create_dir_all(lang.join("h1")).unwrap();
        std::os::unix::fs::symlink("h1", lang.join("current")).unwrap();
        assert!(read_marker_in(root, "kt").is_none());

        let mut ran = false;
        let out = install_in(root, "kt", "h1", "exit 7", 10_000, |_| ran = true)
            .await
            .unwrap();
        assert_eq!(out, InstallOutcome::AlreadyInstalled);
        assert!(!ran, "script must not run to repair a stale marker");
        assert_eq!(read_marker_in(root, "kt").as_deref(), Some("h1"));
        assert!(is_fully_installed_in(root, "kt", "h1"));
    }

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

    fn link(root: &Path) -> PathBuf {
        std::fs::read_link(root.join("kt").join("current")).unwrap()
    }

    #[test]
    fn activate_swaps_symlink_keeps_previous_and_prunes_older() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let lang = root.join("kt");
        std::fs::create_dir_all(lang.join("h1")).unwrap();
        activate_in(root, "kt", "h1").unwrap();
        assert_eq!(link(root), PathBuf::from("h1"));
        assert_eq!(read_marker_in(root, "kt").as_deref(), Some("h1"));
        assert!(!lang.join(".previous").exists());

        std::fs::create_dir_all(lang.join("h2")).unwrap();
        activate_in(root, "kt", "h2").unwrap();
        assert_eq!(link(root), PathBuf::from("h2"));
        assert_eq!(read_marker_in(root, "kt").as_deref(), Some("h2"));
        assert!(lang.join("h1").is_dir(), "previous target kept");
        assert!(lang.join("h2").is_dir());
        assert!(is_kept_previous_in(root, "kt", "h1"));

        std::fs::create_dir_all(lang.join("h3")).unwrap();
        std::fs::create_dir_all(lang.join("partial")).unwrap();
        activate_in(root, "kt", "h3").unwrap();
        assert_eq!(link(root), PathBuf::from("h3"));
        assert_eq!(read_marker_in(root, "kt").as_deref(), Some("h3"));
        assert!(lang.join("h2").is_dir(), "previous target kept");
        assert!(!lang.join("h1").exists(), "older hash dir pruned");
        assert!(!lang.join("partial").exists(), "stray dir pruned");
        assert!(lang.join("h3").is_dir());
        assert!(!lang.join(".installed.tmp").exists());
        assert!(lang.join("current").join(".").is_dir(), "current resolves");
    }

    #[tokio::test]
    async fn rollback_to_kept_previous_skips_script() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let lang = root.join("kt");
        std::fs::create_dir_all(lang.join("h1")).unwrap();
        std::fs::write(lang.join("h1").join("payload"), "one").unwrap();
        activate_in(root, "kt", "h1").unwrap();
        std::fs::create_dir_all(lang.join("h2")).unwrap();
        activate_in(root, "kt", "h2").unwrap();

        let sentinel = root.join("ran");
        let script = format!("touch {}", sentinel.display());
        let mut lines = 0;
        let out = install_in(root, "kt", "h1", &script, 10_000, |_| lines += 1)
            .await
            .unwrap();
        assert_eq!(out, InstallOutcome::RolledBack);
        assert!(!sentinel.exists(), "script not run");
        assert_eq!(lines, 0);
        assert_eq!(link(root), PathBuf::from("h1"));
        assert_eq!(read_marker_in(root, "kt").as_deref(), Some("h1"));
        assert_eq!(
            std::fs::read_to_string(lang.join("h1").join("payload")).unwrap(),
            "one",
            "rolled-back dir not wiped"
        );
        assert!(lang.join("h2").is_dir(), "h2 now the kept previous");

        // The kept previous must never be wiped by a direct script run.
        assert!(
            run_install_script_in(root, "kt", "h2", &script, 10_000, |_| {})
                .await
                .is_err()
        );
        assert!(lang.join("h2").is_dir());
        assert!(!sentinel.exists());
    }

    #[tokio::test]
    async fn install_in_runs_script_then_activates() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let script = r#"mkdir -p "$AOJ_PREFIX/bin""#;
        let out = install_in(root, "kt", "h1", script, 10_000, |_| {})
            .await
            .unwrap();
        assert_eq!(out, InstallOutcome::Installed);
        assert_eq!(link(root), PathBuf::from("h1"));
        let again = install_in(root, "kt", "h1", "exit 1", 10_000, |_| {})
            .await
            .unwrap();
        assert_eq!(again, InstallOutcome::AlreadyInstalled);
        let bad = install_in(root, "kt", "h2", "exit 4", 10_000, |_| {})
            .await
            .unwrap();
        assert_eq!(bad, InstallOutcome::ScriptFailed(Some(4)));
        assert_eq!(link(root), PathBuf::from("h1"));
    }

    #[tokio::test]
    async fn background_process_is_killed_after_exit() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let started = std::time::Instant::now();
        let script = r#"(sleep 1; touch "$AOJ_PREFIX/late") & echo done"#;
        let (lines, status) = run_install_script_in(root, "kt", "h1", script, 10_000, |_| {})
            .await
            .unwrap();
        assert_eq!(status, Some(0));
        assert!(lines.iter().any(|l| l == "done"));
        assert!(started.elapsed() < Duration::from_secs(1), "no drain wait");
        std::thread::sleep(Duration::from_millis(1500));
        assert!(!root.join("kt/h1/late").exists(), "straggler killed");
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
