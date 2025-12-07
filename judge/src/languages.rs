//! Language configuration for compilation and execution

use std::collections::HashMap;
use std::fs;
use std::path::Path;
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

/// Get all supported language names
pub fn get_supported_languages() -> Vec<String> {
    LANGUAGES
        .get()
        .map(|langs| langs.keys().cloned().collect())
        .unwrap_or_default()
}

fn into_command(command: &str) -> Vec<String> {
    command.split_whitespace().map(|s| s.to_string()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
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
}
