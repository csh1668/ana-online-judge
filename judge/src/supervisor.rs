//! Single-container multi-process supervisor.
//!
//! When `JUDGE_WORKER_PROCS >= 2`, `main` hands off to [`run`] instead of
//! entering the normal worker loop. The supervisor spawns N copies of the
//! current executable (each marked with `AOJ_WORKER_CHILD=1` so it takes the
//! plain worker path — see `main.rs`), forwards SIGTERM/SIGINT to every
//! child on shutdown, and respawns any child that dies unexpectedly (after a
//! short backoff) while not shutting down.
//!
//! The child path itself is completely unmodified: each child allocates its
//! own `worker_id` via the existing Redis lease mechanism, so this module
//! only deals with process lifecycle, never with job/queue logic.

use std::collections::HashSet;
use std::path::Path;
use std::time::Duration;

use anyhow::{Context, Result};
use tokio::signal::unix::{signal, SignalKind};
use tokio::task::JoinSet;
use tracing::{error, info, warn};

/// Backoff before respawning a worker child that died outside of a
/// supervisor-initiated shutdown.
const RESPAWN_BACKOFF: Duration = Duration::from_secs(3);

/// Parse `JUDGE_WORKER_PROCS` from an already-read env value. Pure function
/// — unset, unparseable, or `0` falls back to `1`, which is byte-for-byte the
/// pre-supervisor single-process behavior. `0` is rejected explicitly rather
/// than accepted as a valid `u32`: `main` only enters supervisor mode when
/// `worker_procs > 1`, so `0` would silently fall through to the normal
/// single-worker path anyway, but treating it as `1` here keeps this
/// function's contract self-consistent with `parse_max_workers`'s "0 has no
/// valid interpretation, use the default" rule (2026-08-22 final review).
pub fn parse_worker_procs(raw: Option<String>) -> u32 {
    match raw.and_then(|s| s.parse::<u32>().ok()) {
        Some(0) | None => 1,
        Some(value) => value,
    }
}

/// One child process's terminal state, reported by its dedicated monitor
/// task once `wait()` resolves.
struct ChildExit {
    /// Stable spawn slot (0..worker_procs), reused across respawns — purely
    /// for log correlation.
    slot: u32,
    pid: i32,
    status: std::io::Result<std::process::ExitStatus>,
}

/// Spawn one worker child (current executable, `AOJ_WORKER_CHILD=1`,
/// stdout/stderr inherited) and register a monitor task in `monitors` that
/// resolves with its exit status. Returns the child's pid.
fn spawn_worker_child(exe: &Path, slot: u32, monitors: &mut JoinSet<ChildExit>) -> Result<i32> {
    let mut child = tokio::process::Command::new(exe)
        .env("AOJ_WORKER_CHILD", "1")
        .spawn()
        .with_context(|| format!("Failed to spawn worker child #{}", slot))?;
    let pid = child
        .id()
        .context("Spawned worker child has no pid (already exited?)")? as i32;

    monitors.spawn(async move {
        let status = child.wait().await;
        ChildExit { slot, pid, status }
    });

    Ok(pid)
}

/// Run the supervisor: spawn `worker_procs` children and babysit them until
/// SIGTERM/SIGINT, then forward the signal to every live child and wait for
/// all of them to exit before returning.
///
/// Bails before spawning anything if `worker_procs` exceeds
/// `JUDGE_MAX_WORKERS` — spawning more children than there are worker_id
/// leases would just have the extras spin forever failing to allocate one.
pub async fn run(worker_procs: u32) -> Result<()> {
    let max = crate::infra::redis_manager::max_workers();
    if worker_procs > max {
        anyhow::bail!(
            "JUDGE_WORKER_PROCS ({}) must not exceed JUDGE_MAX_WORKERS ({}); refusing to start",
            worker_procs,
            max
        );
    }

    let exe = std::env::current_exe().context("Failed to resolve current_exe for supervisor")?;
    info!(
        "Supervisor starting: {} worker child process(es) (JUDGE_MAX_WORKERS={})",
        worker_procs, max
    );

    let mut monitors: JoinSet<ChildExit> = JoinSet::new();
    let mut respawn_timers: JoinSet<u32> = JoinSet::new();
    let mut live_pids: HashSet<i32> = HashSet::new();

    for slot in 0..worker_procs {
        match spawn_worker_child(&exe, slot, &mut monitors) {
            Ok(pid) => {
                info!("Supervisor: spawned worker child #{} pid={}", slot, pid);
                live_pids.insert(pid);
            }
            Err(e) => {
                // 슬롯을 영구 유휴 상태로 포기하지 않는다 — 죽은 자식을
                // 회수했을 때와 동일한 백오프 재시도 경로(respawn_timers)에
                // 태워, 일시적 기동 실패(예: fork 실패)가 그 슬롯을 프로세스
                // 수명 내내 놀리는 일을 막는다 (2026-08-22 최종 리뷰).
                error!(
                    "Supervisor: failed to spawn worker child #{}: {:#}, retrying in {:?}",
                    slot, e, RESPAWN_BACKOFF
                );
                respawn_timers.spawn(async move {
                    tokio::time::sleep(RESPAWN_BACKOFF).await;
                    slot
                });
            }
        }
    }

    let mut sigterm = signal(SignalKind::terminate()).expect("SIGTERM handler");
    let mut shutting_down = false;

    loop {
        if shutting_down && monitors.is_empty() && respawn_timers.is_empty() {
            break;
        }

        tokio::select! {
            _ = sigterm.recv(), if !shutting_down => {
                info!(
                    "Supervisor: SIGTERM received, forwarding to {} live child(ren)",
                    live_pids.len()
                );
                shutting_down = true;
                forward_sigterm(&live_pids);
            }
            _ = tokio::signal::ctrl_c(), if !shutting_down => {
                info!(
                    "Supervisor: SIGINT received, forwarding to {} live child(ren)",
                    live_pids.len()
                );
                shutting_down = true;
                forward_sigterm(&live_pids);
            }
            Some(joined) = monitors.join_next(), if !monitors.is_empty() => {
                let exit = match joined {
                    Ok(exit) => exit,
                    Err(e) => {
                        warn!("Supervisor: child monitor task panicked/cancelled: {}", e);
                        continue;
                    }
                };
                live_pids.remove(&exit.pid);
                match &exit.status {
                    Ok(status) => warn!(
                        "Supervisor: worker child #{} pid={} exited: {:?}",
                        exit.slot, exit.pid, status
                    ),
                    Err(e) => warn!(
                        "Supervisor: worker child #{} pid={} wait() failed: {}",
                        exit.slot, exit.pid, e
                    ),
                }

                if !shutting_down {
                    let slot = exit.slot;
                    warn!(
                        "Supervisor: worker child #{} died, respawning in {:?} (in-flight jobs recovered by reclaim)",
                        slot, RESPAWN_BACKOFF
                    );
                    respawn_timers.spawn(async move {
                        tokio::time::sleep(RESPAWN_BACKOFF).await;
                        slot
                    });
                }
            }
            Some(joined) = respawn_timers.join_next(), if !respawn_timers.is_empty() => {
                let Ok(slot) = joined else { continue };
                if shutting_down {
                    continue;
                }
                match spawn_worker_child(&exe, slot, &mut monitors) {
                    Ok(pid) => {
                        info!("Supervisor: respawned worker child #{} pid={}", slot, pid);
                        live_pids.insert(pid);
                    }
                    Err(e) => {
                        // 이번에도 실패했다고 슬롯을 포기하지 않는다 — 다시
                        // 백오프 타이머를 걸어 계속 재시도한다(예: MinIO/Redis
                        // 기동 지연처럼 일시적인 원인이면 다음 시도에 성공한다).
                        error!(
                            "Supervisor: failed to respawn worker child #{}: {:#}, retrying in {:?}",
                            slot, e, RESPAWN_BACKOFF
                        );
                        respawn_timers.spawn(async move {
                            tokio::time::sleep(RESPAWN_BACKOFF).await;
                            slot
                        });
                    }
                }
            }
        }
    }

    info!("Supervisor: all worker children exited, shutting down");
    Ok(())
}

fn forward_sigterm(live_pids: &HashSet<i32>) {
    for &pid in live_pids {
        // SAFETY: `pid` came from `tokio::process::Child::id()` for a child
        // we spawned and have not yet observed exit for, so it names either
        // our live child or (benignly, if it already exited) a recycled pid
        // no longer ours — `kill` is a plain syscall wrapper with no memory
        // safety implications either way.
        let ret = unsafe { libc::kill(pid, libc::SIGTERM) };
        if ret != 0 {
            let err = std::io::Error::last_os_error();
            warn!("Supervisor: kill(pid={}, SIGTERM) failed: {}", pid, err);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_worker_procs_defaults_when_unset() {
        assert_eq!(parse_worker_procs(None), 1);
    }

    #[test]
    fn parse_worker_procs_defaults_on_parse_failure() {
        assert_eq!(parse_worker_procs(Some("nope".to_string())), 1);
        assert_eq!(parse_worker_procs(Some("".to_string())), 1);
        assert_eq!(parse_worker_procs(Some("-1".to_string())), 1);
        assert_eq!(parse_worker_procs(Some("-3".to_string())), 1);
    }

    #[test]
    fn parse_worker_procs_defaults_on_zero() {
        assert_eq!(parse_worker_procs(Some("0".to_string())), 1);
    }

    #[test]
    fn parse_worker_procs_parses_valid_value() {
        assert_eq!(parse_worker_procs(Some("5".to_string())), 5);
        assert_eq!(parse_worker_procs(Some("1".to_string())), 1);
    }
}
