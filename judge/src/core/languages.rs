//! Language configuration for compilation and execution

use std::collections::HashMap;
use std::sync::OnceLock;

use anyhow::Context;
use serde::Deserialize;

/// Configuration for a supported programming language
#[derive(Debug, Clone)]
pub struct LanguageConfig {
    /// Name of the source file (e.g., "main.cpp")
    pub source_file: String,
    /// Compile command template (None if not needed)
    pub compile_command: Option<Vec<String>>,
    /// Run command template
    pub run_command: Vec<String>,
    /// Time limit multiplier and bonus: (multiplier, bonus_seconds)
    /// actual_time = base_time * multiplier + bonus
    /// Example: (3, 2) means base_time * 3 + 2 seconds
    pub time_limit: Option<(u32, u32)>,
    /// Memory limit multiplier and bonus: (multiplier, bonus_mb)
    /// actual_memory = base_memory * multiplier + bonus
    /// Example: (2, 32) means base_memory * 2 + 32 MB
    pub memory_limit: Option<(u32, u32)>,
}

impl LanguageConfig {
    /// Calculate actual time limit based on base time limit
    /// base_time_ms: base time limit in milliseconds (from problem)
    /// Returns: adjusted time limit in milliseconds
    pub fn calculate_time_limit(&self, base_time_ms: u32) -> u32 {
        match self.time_limit {
            Some((multiplier, bonus_seconds)) => {
                // base_time_ms * multiplier + bonus_seconds * 1000
                base_time_ms * multiplier + bonus_seconds * 1000
            }
            None => base_time_ms, // No adjustment
        }
    }

    /// Calculate actual memory limit based on base memory limit
    /// base_memory_mb: base memory limit in MB (from problem)
    /// Returns: adjusted memory limit in MB
    pub fn calculate_memory_limit(&self, base_memory_mb: u32) -> u32 {
        match self.memory_limit {
            Some((multiplier, bonus_mb)) => {
                // base_memory_mb * multiplier + bonus_mb
                base_memory_mb * multiplier + bonus_mb
            }
            None => base_memory_mb, // No adjustment
        }
    }
}

/// Placeholder token substituted by [`resolve_heap_placeholder`].
pub const HEAP_PLACEHOLDER: &str = "{heap_mb}";
/// Floor for the derived heap, so a tiny problem limit cannot produce a heap
/// the runtime refuses to start with.
pub const HEAP_MIN_MB: u32 = 64;

/// Resolve the `{heap_mb}` placeholder in a run command against the memory cap
/// the run is about to get (the language-adjusted value from
/// [`LanguageConfig::calculate_memory_limit`], before cgroup headroom).
///
/// This lets a language pin a VM-level heap ceiling to the problem's limit
/// instead of hard-coding one. Java needs it: `-Xmx` is enforced by the JVM
/// itself, so a fixed value both starves submissions on high-memory problems
/// (a 1024MB problem stayed capped at a 512MB heap) and, on low-memory ones,
/// lets the JVM aim above the cgroup cap and die as MLE instead of with a
/// clean OutOfMemoryError.
///
/// The heap is set to the cap itself rather than a fraction of it. `-Xmx` is a
/// ceiling, not a reservation, so this does not inflate the footprint of a
/// program that stays small; what it does is let a program legitimately use the
/// memory the problem allows. Taking a haircut here measurably shrinks what
/// fits: SerialGC gives long-lived data only `NewRatio`-determined two thirds
/// of the heap, so an 80% haircut on a 528 MB cap dropped the usable old
/// generation from 341 MB to 296 MB and turned previously-accepted submissions
/// into OutOfMemoryError. Setting the heap to the full cap keeps every
/// previously-accepted submission accepted (verified against the old fixed
/// -Xmx512m at a 528 MB cap) while letting high-memory problems actually use
/// their limit. A submission that overruns still fails, as either
/// OutOfMemoryError or a cgroup MemoryLimitExceeded depending on how it
/// allocates.
///
/// Applied centrally in `engine::executer` where a user program is spawned, so
/// every job type (judge, interactive, two-step, workshop, playground) is
/// covered without each call site having to remember.
pub fn resolve_heap_placeholder(command: &[String], sandbox_memory_mb: u32) -> Vec<String> {
    if !command.iter().any(|tok| tok.contains(HEAP_PLACEHOLDER)) {
        return command.to_vec();
    }
    let heap_mb = sandbox_memory_mb.max(HEAP_MIN_MB).to_string();
    command
        .iter()
        .map(|tok| tok.replace(HEAP_PLACEHOLDER, &heap_mb))
        .collect()
}

/// Raw TOML configuration for a language
#[derive(Debug, Deserialize)]
struct RawLanguageConfig {
    source_file: String,
    compile_command: Option<String>,
    run_command: String,
    #[serde(default)]
    time_limit: Vec<String>,
    #[serde(default)]
    memory_limit: Vec<String>,
    #[serde(default)]
    aliases: Vec<String>,
    #[serde(default)]
    #[allow(dead_code)]
    version: Option<String>,
}

/// Global language configurations
static LANGUAGES: OnceLock<HashMap<String, LanguageConfig>> = OnceLock::new();

/// Initialize language configurations from TOML file
pub fn init_languages() -> anyhow::Result<()> {
    let content = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/files/languages.toml"));
    let raw_configs: HashMap<String, RawLanguageConfig> = toml::from_str(content)?;

    let mut languages = HashMap::new();

    for (name, raw) in raw_configs {
        let parse_limit =
            |raw_limit: Vec<String>, kind: &str| -> anyhow::Result<Option<(u32, u32)>> {
                if raw_limit.is_empty() {
                    return Ok(None);
                }
                if raw_limit.len() != 2 {
                    anyhow::bail!("Invalid {} limit for {}: {:?}", kind, name, raw_limit);
                }
                let multiplier = raw_limit[0].parse::<u32>().with_context(|| {
                    format!("Invalid {} multiplier for {}: {}", kind, name, raw_limit[0])
                })?;
                let offset = raw_limit[1].parse::<u32>().with_context(|| {
                    format!("Invalid {} offset for {}: {}", kind, name, raw_limit[1])
                })?;
                Ok(Some((multiplier, offset)))
            };

        let config = LanguageConfig {
            source_file: raw.source_file,
            compile_command: raw.compile_command.map(|cmd| into_command(&cmd)),
            run_command: into_command(&raw.run_command),
            time_limit: parse_limit(raw.time_limit, "time")?,
            memory_limit: parse_limit(raw.memory_limit, "memory")?,
        };

        // Add main language name
        languages.insert(name.to_lowercase(), config.clone());

        // Add aliases
        for alias in raw.aliases {
            languages.insert(alias.to_lowercase(), config.clone());
        }
    }

    LANGUAGES
        .set(languages)
        .map_err(|_| anyhow::anyhow!("Languages already initialized"))?;

    Ok(())
}

/// Get language configuration by language name
pub fn get_language_config(language: &str) -> Option<LanguageConfig> {
    LANGUAGES.get()?.get(&language.to_lowercase()).cloned()
}

fn into_command(command: &str) -> Vec<String> {
    command.split_whitespace().map(|s| s.to_string()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;
    use tempfile::NamedTempFile;

    fn create_test_config() -> NamedTempFile {
        let mut file = NamedTempFile::new().unwrap();
        writeln!(
            file,
            r#"
[c]
source_file = "main.c"
compile_command = "gcc -o main main.c"
run_command = "./main"

[python]
source_file = "main.py"
run_command = "python3 main.py"
aliases = ["py", "python3"]
"#
        )
        .unwrap();
        file
    }

    #[test]
    fn test_load_languages() {
        let config_file = create_test_config();

        // Reset for test (need fresh OnceLock)
        let content = fs::read_to_string(config_file.path()).unwrap();
        let raw_configs: HashMap<String, RawLanguageConfig> = toml::from_str(&content).unwrap();

        assert!(raw_configs.contains_key("c"));
        assert!(raw_configs.contains_key("python"));
        assert_eq!(raw_configs["python"].aliases, vec!["py", "python3"]);
    }

    fn cmd(parts: &[&str]) -> Vec<String> {
        parts.iter().map(|s| s.to_string()).collect()
    }

    fn java_like() -> LanguageConfig {
        LanguageConfig {
            source_file: "Main.java".to_string(),
            compile_command: None,
            run_command: cmd(&["java", "-Xmx{heap_mb}m", "Main"]),
            time_limit: None,
            memory_limit: Some((2, 16)),
        }
    }

    #[test]
    fn heap_is_derived_from_the_adjusted_memory_cap() {
        let cfg = java_like();
        // base 256MB problem -> cap 256*2+16 = 528MB. The old hard-coded -Xmx512m
        // is a subset of this, so no previously-accepted submission regresses.
        let cap = cfg.calculate_memory_limit(256);
        assert_eq!(cap, 528);
        assert_eq!(
            resolve_heap_placeholder(&cfg.run_command, cap),
            cmd(&["java", "-Xmx528m", "Main"])
        );
    }

    #[test]
    fn heap_scales_with_the_problem_limit() {
        // A 1024MB problem must not stay pinned at the old fixed 512MB heap.
        let cap = java_like().calculate_memory_limit(1024);
        assert_eq!(
            resolve_heap_placeholder(&java_like().run_command, cap),
            cmd(&["java", "-Xmx2064m", "Main"])
        );
    }

    #[test]
    fn heap_has_a_floor() {
        assert_eq!(
            resolve_heap_placeholder(&cmd(&["java", "-Xmx{heap_mb}m"]), 16),
            cmd(&["java", "-Xmx64m"])
        );
    }

    #[test]
    fn commands_without_the_placeholder_are_untouched() {
        assert_eq!(
            resolve_heap_placeholder(&cmd(&["./Main"]), 528),
            cmd(&["./Main"])
        );
    }
}
