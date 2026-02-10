//! Isolate meta file parser
//!
//! Parses the meta file output from isolate to extract execution results.

/// Raw execution status from isolate
#[derive(Debug, Clone, PartialEq)]
pub enum IsolateStatus {
    /// Program exited normally
    Ok,
    /// Time limit exceeded
    TimeOut,
    /// Killed by signal (crash)
    Signal(i32),
    /// Runtime error (non-zero exit)
    RuntimeError,
    /// Internal error in isolate
    InternalError,
}

/// Parsed isolate meta file contents
#[derive(Debug, Clone)]
pub struct IsolateMeta {
    /// CPU time used in milliseconds
    pub time_ms: u32,
    /// Memory used in KB (from cg-mem or max-rss)
    pub memory_kb: u32,
    /// Exit code of the process
    pub exit_code: i32,
    /// Isolate status
    pub status: IsolateStatus,
    /// Wall clock time in milliseconds
    pub wall_time_ms: u32,
}

impl Default for IsolateMeta {
    fn default() -> Self {
        Self {
            time_ms: 0,
            memory_kb: 0,
            exit_code: 0,
            status: IsolateStatus::Ok,
            wall_time_ms: 0,
        }
    }
}

/// Parse isolate meta file content
pub fn parse_meta(content: &str) -> IsolateMeta {
    let mut meta = IsolateMeta::default();
    let mut status_str = String::new();

    for line in content.lines() {
        let parts: Vec<&str> = line.splitn(2, ':').collect();
        if parts.len() != 2 {
            continue;
        }

        let key = parts[0].trim();
        let value = parts[1].trim();

        match key {
            "time" => {
                if let Ok(t) = value.parse::<f64>() {
                    meta.time_ms = (t * 1000.0) as u32;
                }
            }
            "time-wall" => {
                if let Ok(t) = value.parse::<f64>() {
                    meta.wall_time_ms = (t * 1000.0) as u32;
                }
            }
            "cg-mem" | "max-rss" => {
                // cg-mem for cgroups, max-rss for non-cgroups (both in KB)
                if let Ok(m) = value.parse::<u32>() {
                    if meta.memory_kb == 0 || m > meta.memory_kb {
                        meta.memory_kb = m;
                    }
                }
            }
            "status" => {
                status_str = value.to_string();
            }
            "exitcode" => {
                meta.exit_code = value.parse().unwrap_or(0);
            }
            "exitsig" => {
                if let Ok(sig) = value.parse::<i32>() {
                    meta.status = IsolateStatus::Signal(sig);
                }
            }
            _ => {}
        }
    }

    // Determine status from status string if not already set by signal
    if meta.status == IsolateStatus::Ok {
        meta.status = match status_str.as_str() {
            "TO" => IsolateStatus::TimeOut,
            "SG" => IsolateStatus::Signal(0), // Signal number should be in exitsig
            "RE" => IsolateStatus::RuntimeError,
            "XX" => IsolateStatus::InternalError,
            "" if meta.exit_code == 0 => IsolateStatus::Ok,
            "" => IsolateStatus::RuntimeError,
            _ => IsolateStatus::RuntimeError,
        };
    }

    meta
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_meta_success() {
        let content = "time:0.015\ntime-wall:0.020\ncg-mem:1024\nexitcode:0\n";
        let meta = parse_meta(content);

        assert_eq!(meta.time_ms, 15);
        assert_eq!(meta.wall_time_ms, 20);
        assert_eq!(meta.memory_kb, 1024);
        assert_eq!(meta.exit_code, 0);
        assert_eq!(meta.status, IsolateStatus::Ok);
    }

    #[test]
    fn test_parse_meta_tle() {
        let content = "time:1.000\nstatus:TO\n";
        let meta = parse_meta(content);

        assert_eq!(meta.time_ms, 1000);
        assert_eq!(meta.status, IsolateStatus::TimeOut);
    }

    #[test]
    fn test_parse_meta_signal() {
        let content = "status:SG\nexitsig:11\n";
        let meta = parse_meta(content);

        assert_eq!(meta.status, IsolateStatus::Signal(11));
    }
}
