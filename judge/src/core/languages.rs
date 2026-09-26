//! Language registry. Loaded from the Redis snapshot `judge:languages`
//! (published by web from the `languages` table) and swapped atomically on
//! every `judge:languages:changed` message.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::RwLock;

use anyhow::Context;
use serde::Deserialize;

pub const PREFIX_PLACEHOLDER: &str = "{prefix}";
pub const DEFAULT_LANGS_DIR: &str = "/opt/aoj-langs";

#[derive(Debug, Clone)]
pub struct LanguageConfig {
    pub id: String,
    pub source_file: String,
    pub file_extension: String,
    pub compile_command: Option<Vec<String>>,
    pub run_command: Vec<String>,
    pub compile_on_host: bool,
    pub compile_script: Option<String>,
    pub produces_single_binary: bool,
    pub env: Vec<(String, String)>,
    pub time_multiplier: f64,
    pub time_bonus_ms: u32,
    pub memory_multiplier: f64,
    pub memory_bonus_mb: u32,
    /// True for volume-installed languages (web: `installScript` is set),
    /// false for image-builtin ones.
    pub volume: bool,
    /// For volume languages, the hash that must be installed under
    /// `<langs_dir>/<id>/`; `None` when nothing is installed (never installed,
    /// uninstalled, or reset). Always `None` for builtin languages.
    pub install_hash: Option<String>,
}

impl LanguageConfig {
    pub fn calculate_time_limit(&self, base_time_ms: u32) -> u32 {
        (base_time_ms as f64 * self.time_multiplier).ceil() as u32 + self.time_bonus_ms
    }

    pub fn calculate_memory_limit(&self, base_memory_mb: u32) -> u32 {
        (base_memory_mb as f64 * self.memory_multiplier).ceil() as u32 + self.memory_bonus_mb
    }

    pub fn prefix_dir(&self) -> PathBuf {
        langs_dir().join(&self.id).join("current")
    }

    /// Builtin languages are always ready. A volume language is ready only
    /// when web reports an installed hash *and* `current` exists on disk — a
    /// volume language without a hash (uninstalled / reset) is not builtin.
    pub fn toolchain_ready(&self) -> bool {
        !self.volume || (self.install_hash.is_some() && self.prefix_dir().exists())
    }
}

pub fn langs_dir() -> PathBuf {
    PathBuf::from(std::env::var("AOJ_LANGS_DIR").unwrap_or_else(|_| DEFAULT_LANGS_DIR.to_string()))
}

pub fn require_toolchain_ready(cfg: &LanguageConfig) -> anyhow::Result<()> {
    if cfg.toolchain_ready() {
        Ok(())
    } else {
        anyhow::bail!(
            "Language toolchain not installed: {} (expected {})",
            cfg.id,
            cfg.prefix_dir().display()
        )
    }
}

/// Wire shape of one entry in `judge:languages`. Mirrors
/// `web/src/lib/services/languages.ts::toSnapshotEntry`.
#[derive(Debug, Deserialize)]
struct SnapshotEntry {
    id: String,
    #[serde(default)]
    aliases: Vec<String>,
    source_file: String,
    #[serde(default)]
    file_extension: String,
    #[serde(default)]
    compile_command: Option<String>,
    run_command: String,
    #[serde(default)]
    compile_on_host: bool,
    #[serde(default)]
    compile_script: Option<String>,
    #[serde(default = "default_true")]
    produces_single_binary: bool,
    #[serde(default)]
    env: Vec<String>,
    #[serde(default = "default_one")]
    time_multiplier: f64,
    #[serde(default)]
    time_bonus_ms: u32,
    #[serde(default = "default_one")]
    memory_multiplier: f64,
    #[serde(default)]
    memory_bonus_mb: u32,
    #[serde(default)]
    volume: bool,
    #[serde(default)]
    install_hash: Option<String>,
}

fn default_true() -> bool {
    true
}
fn default_one() -> f64 {
    1.0
}

struct Registry {
    by_name: HashMap<String, LanguageConfig>,
    canonical: Vec<LanguageConfig>,
}

static REGISTRY: RwLock<Option<Registry>> = RwLock::new(None);

/// Replace the registry with the given snapshot. On parse error the previous
/// registry is left untouched.
pub fn load_snapshot_json(json: &str) -> anyhow::Result<usize> {
    let entries: Vec<SnapshotEntry> =
        serde_json::from_str(json).context("Invalid judge:languages snapshot")?;
    let dir = langs_dir();
    let mut by_name = HashMap::new();
    let mut canonical = Vec::new();

    for raw in entries {
        let prefix = dir.join(&raw.id).join("current");
        let prefix_str = prefix.to_string_lossy().to_string();
        let sub = |s: &str| s.replace(PREFIX_PLACEHOLDER, &prefix_str);
        let config = LanguageConfig {
            id: raw.id.to_lowercase(),
            source_file: raw.source_file,
            file_extension: raw.file_extension.to_lowercase(),
            compile_command: raw
                .compile_command
                .as_deref()
                .map(|c| into_command(&sub(c))),
            run_command: into_command(&sub(&raw.run_command)),
            compile_on_host: raw.compile_on_host,
            compile_script: raw.compile_script.as_deref().map(sub),
            produces_single_binary: raw.produces_single_binary,
            env: raw
                .env
                .iter()
                .filter_map(|kv| kv.split_once('=').map(|(k, v)| (k.to_string(), sub(v))))
                .collect(),
            time_multiplier: raw.time_multiplier,
            time_bonus_ms: raw.time_bonus_ms,
            memory_multiplier: raw.memory_multiplier,
            memory_bonus_mb: raw.memory_bonus_mb,
            // A hash only ever exists for volume languages; honouring it
            // keeps a snapshot from a web that predates `volume` correct.
            volume: raw.volume || raw.install_hash.is_some(),
            install_hash: raw.install_hash,
        };
        by_name.insert(config.id.clone(), config.clone());
        for alias in raw.aliases {
            by_name.insert(alias.to_lowercase(), config.clone());
        }
        canonical.push(config);
    }

    let count = canonical.len();
    *REGISTRY.write().unwrap() = Some(Registry { by_name, canonical });
    Ok(count)
}

#[cfg(test)]
pub fn is_loaded() -> bool {
    REGISTRY.read().unwrap().is_some()
}

pub fn get_language_config(language: &str) -> Option<LanguageConfig> {
    REGISTRY
        .read()
        .unwrap()
        .as_ref()?
        .by_name
        .get(&language.to_lowercase())
        .cloned()
}

pub fn all_language_configs() -> Vec<LanguageConfig> {
    REGISTRY
        .read()
        .unwrap()
        .as_ref()
        .map(|r| r.canonical.clone())
        .unwrap_or_default()
}

pub fn find_by_extension(ext: &str) -> Option<LanguageConfig> {
    let ext = ext.to_lowercase();
    all_language_configs()
        .into_iter()
        .find(|c| c.file_extension == ext)
}

fn into_command(command: &str) -> Vec<String> {
    command.split_whitespace().map(|s| s.to_string()).collect()
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

/// Tests share the process-global `REGISTRY` and `AOJ_LANGS_DIR` env var;
/// Rust runs tests concurrently by default, so every test (in any module)
/// that touches either must serialize on this lock first.
#[cfg(test)]
pub(crate) static TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[cfg(test)]
mod tests {
    use super::*;

    const SNAPSHOT: &str = r#"[
      {"id":"cpp","aliases":["c++","cpp17"],"source_file":"Main.cpp","file_extension":"cpp",
       "compile_command":"g++ -o Main Main.cpp","run_command":"./Main"},
      {"id":"python","aliases":["py"],"source_file":"Main.py","file_extension":"py",
       "compile_command":null,"run_command":"python3 Main.py",
       "time_multiplier":2.5,"time_bonus_ms":500,"memory_multiplier":2,"memory_bonus_mb":32},
      {"id":"kotlin","aliases":[],"source_file":"Main.kt","file_extension":"kt",
       "compile_command":"{prefix}/bin/kotlinc Main.kt","run_command":"{prefix}/bin/java -Xmx{heap_mb}m Main",
       "env":["KOTLIN_HOME={prefix}"],"produces_single_binary":false,"volume":true,"install_hash":"abc123"}
    ]"#;

    #[test]
    fn parses_snapshot_with_aliases_and_defaults() {
        let _g = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        std::env::set_var("AOJ_LANGS_DIR", "/opt/test-langs");
        let n = load_snapshot_json(SNAPSHOT).unwrap();
        assert_eq!(n, 3);
        assert!(is_loaded());
        let cpp = get_language_config("CPP17").unwrap();
        assert_eq!(cpp.id, "cpp");
        assert_eq!(
            cpp.compile_command.as_deref(),
            Some(&["g++", "-o", "Main", "Main.cpp"].map(String::from)[..])
        );
        assert_eq!(cpp.time_multiplier, 1.0);
        assert!(cpp.produces_single_binary);
        assert!(cpp.install_hash.is_none());
        let py = get_language_config("py").unwrap();
        assert!(py.compile_command.is_none());
    }

    #[test]
    fn fractional_multipliers_round_up() {
        let _g = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        std::env::set_var("AOJ_LANGS_DIR", "/opt/test-langs");
        load_snapshot_json(SNAPSHOT).unwrap();
        let py = get_language_config("python").unwrap();
        assert_eq!(py.calculate_time_limit(1000), 3000); // 1000*2.5 + 500
        assert_eq!(py.calculate_time_limit(333), 1333); // ceil(832.5)=833 + 500
        assert_eq!(py.calculate_memory_limit(256), 544); // 256*2 + 32
    }

    #[test]
    fn prefix_placeholder_resolved_at_load() {
        let _g = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        std::env::set_var("AOJ_LANGS_DIR", "/opt/test-langs");
        load_snapshot_json(SNAPSHOT).unwrap();
        let kt = get_language_config("kotlin").unwrap();
        assert_eq!(
            kt.compile_command.clone().unwrap()[0],
            "/opt/test-langs/kotlin/current/bin/kotlinc"
        );
        assert_eq!(
            kt.env,
            vec![(
                "KOTLIN_HOME".to_string(),
                "/opt/test-langs/kotlin/current".to_string()
            )]
        );
        assert_eq!(
            kt.prefix_dir(),
            PathBuf::from("/opt/test-langs/kotlin/current")
        );
        assert!(!kt.toolchain_ready()); // 디렉터리 없음
        assert!(require_toolchain_ready(&kt).is_err());
        let cpp = get_language_config("cpp").unwrap();
        assert!(cpp.toolchain_ready()); // 내장 언어
    }

    const VOLUME_SNAPSHOT: &str = r#"[
      {"id":"go","source_file":"Main.go","file_extension":"go",
       "compile_command":"{prefix}/bin/go build -o Main Main.go","run_command":"./Main",
       "volume":true,"install_hash":null},
      {"id":"java","source_file":"Main.java","file_extension":"java",
       "compile_command":"{prefix}/bin/javac Main.java","run_command":"{prefix}/bin/java Main",
       "volume":true,"install_hash":"h1"},
      {"id":"c","source_file":"Main.c","file_extension":"c",
       "compile_command":"gcc -o Main Main.c","run_command":"./Main"},
      {"id":"legacy","source_file":"Main.l","file_extension":"l",
       "compile_command":null,"run_command":"{prefix}/bin/l Main.l","install_hash":"h2"}
    ]"#;

    #[test]
    fn toolchain_ready_semantics_for_volume_and_builtin() {
        let _g = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let tmp = tempfile::tempdir().unwrap();
        std::env::set_var("AOJ_LANGS_DIR", tmp.path());
        load_snapshot_json(VOLUME_SNAPSHOT).unwrap();

        // Volume language with no installed hash (uninstalled/reset): not
        // ready, even though it has no hash like a builtin would.
        let go = get_language_config("go").unwrap();
        assert!(go.volume);
        assert!(go.install_hash.is_none());
        assert!(!go.toolchain_ready());
        std::fs::create_dir_all(tmp.path().join("go/current")).unwrap();
        assert!(
            !go.toolchain_ready(),
            "a stale dir without a hash is not ready"
        );

        // Volume language with a hash: ready only once `current` exists.
        let java = get_language_config("java").unwrap();
        assert!(!java.toolchain_ready());
        std::fs::create_dir_all(tmp.path().join("java/current")).unwrap();
        assert!(java.toolchain_ready());

        // Builtin (no `volume` field): always ready.
        let c = get_language_config("c").unwrap();
        assert!(!c.volume);
        assert!(c.toolchain_ready());

        // Snapshot without `volume` but with a hash: still a volume language.
        let legacy = get_language_config("legacy").unwrap();
        assert!(legacy.volume);
        assert!(!legacy.toolchain_ready());
        std::env::set_var("AOJ_LANGS_DIR", "/opt/test-langs");
    }

    #[test]
    fn invalid_json_keeps_previous_map() {
        let _g = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        std::env::set_var("AOJ_LANGS_DIR", "/opt/test-langs");
        load_snapshot_json(SNAPSHOT).unwrap();
        assert!(load_snapshot_json("not json").is_err());
        assert!(get_language_config("cpp").is_some());
        assert_eq!(load_snapshot_json("[]").unwrap(), 0);
        assert!(get_language_config("cpp").is_none());
    }

    #[test]
    fn find_by_extension_works() {
        let _g = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        std::env::set_var("AOJ_LANGS_DIR", "/opt/test-langs");
        load_snapshot_json(SNAPSHOT).unwrap();
        assert_eq!(find_by_extension("KT").unwrap().id, "kotlin");
        assert!(find_by_extension("zig").is_none());
    }

    #[test]
    fn heap_placeholder_still_resolves() {
        let cmd = vec!["java".to_string(), "-Xmx{heap_mb}m".to_string()];
        assert_eq!(resolve_heap_placeholder(&cmd, 512)[1], "-Xmx512m");
    }
}
