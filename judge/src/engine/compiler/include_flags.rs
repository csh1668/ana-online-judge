//! Language-aware include-path formatting.
//!
//! Workshop jobs place resource files (public headers, Python
//! modules, testlib.h, etc.) **flat in the sandbox work_dir root** so
//! that `copy_dir_in` picks them up. The compiler / runtime must then
//! discover them at path `.` inside the box. Different languages
//! surface this differently:
//!
//! | Language   | Mechanism                                   | MVP Status  |
//! |------------|---------------------------------------------|-------------|
//! | C / C++    | `-I<dir>` CLI flag per directory (`-I.`)    | Supported   |
//! | Java       | `-cp <dir>:.` (classpath root)              | Supported (compile only — runtime classpath extension is 2차) |
//! | Python     | `PYTHONPATH=<dir>` env var (`PYTHONPATH=.`) | Supported   |
//! | JavaScript | `NODE_PATH=<dir>` env var (`NODE_PATH=.`)   | Supported   |
//! | Rust       | `--extern` / crate-layout                   | **Deferred** — header-only patterns don't fit single-crate layout; workshop resources are a no-op for Rust solutions in MVP. Users must inline dependencies. See spec §5. |
//! | Go         | module / vendor layout                      | **Deferred** — same rationale. GOFLAGS / GOPATH adjustment is a 2차 item. |
//!
//! The caller injects `{include_flags}` into the compile (or run) command
//! template and passes `env_vars` through to the sandbox `ExecutionSpec`.
//! Deferred languages simply receive no flags and no env vars — workshop
//! jobs using them will compile/run without access to resources.

use std::path::Path;

/// Output of [`format_include_flags`].
#[derive(Debug, Default, Clone)]
pub struct IncludeFlags {
    /// Tokens to splice into the compile/run command where `{include_flags}` sits.
    /// May be empty for languages that use env vars instead of CLI flags.
    pub tokens: Vec<String>,
    /// Environment variables to pass through to the sandbox.
    pub env_vars: Vec<(String, String)>,
}

impl IncludeFlags {
    /// Join tokens with ASCII spaces for direct substitution into a template.
    /// Returns an empty string if there are no tokens.
    pub fn to_template_fragment(&self) -> String {
        self.tokens.join(" ")
    }
}

/// Format include directories for a given language key (as in `languages.toml`).
///
/// The `dirs` slice contains **paths as they will appear inside the sandbox**.
/// The caller is responsible for copying the referenced directories into the
/// sandbox work_dir (or bind-mounting them) before compilation/execution.
///
/// Unsupported languages (rust, go, text) yield an empty [`IncludeFlags`] —
/// this is intentional for the MVP and documented in the spec §5.
pub fn format_include_flags<P: AsRef<Path>>(language: &str, dirs: &[P]) -> IncludeFlags {
    if dirs.is_empty() {
        return IncludeFlags::default();
    }

    let normalized: Vec<String> = dirs
        .iter()
        .map(|p| p.as_ref().to_string_lossy().into_owned())
        .collect();

    let lang = language.to_lowercase();
    match lang.as_str() {
        "c" | "cpp" | "c++" | "cpp17" | "cpp20" => IncludeFlags {
            tokens: normalized.iter().map(|d| format!("-I{}", d)).collect(),
            env_vars: vec![],
        },
        "java" => {
            // Java: prepend each dir to the classpath, followed by `.` for the
            // user's compiled classes. Result: `-cp res1:res2:.`
            let mut cp = normalized.join(":");
            if !cp.is_empty() {
                cp.push(':');
            }
            cp.push('.');
            IncludeFlags {
                tokens: vec!["-cp".to_string(), cp],
                env_vars: vec![],
            }
        }
        "python" | "python3" | "py" => IncludeFlags {
            tokens: vec![],
            env_vars: vec![("PYTHONPATH".to_string(), normalized.join(":"))],
        },
        "javascript" | "js" | "node" | "nodejs" => IncludeFlags {
            tokens: vec![],
            env_vars: vec![("NODE_PATH".to_string(), normalized.join(":"))],
        },
        // Deferred for MVP per spec §5.
        "rust" | "rs" | "go" | "golang" | "csharp" | "cs" | "c#" | "text" | "txt" => {
            IncludeFlags::default()
        }
        // Unknown language — conservatively no-op.
        _ => IncludeFlags::default(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn empty_dirs_returns_empty() {
        let f = format_include_flags::<PathBuf>("cpp", &[]);
        assert!(f.tokens.is_empty());
        assert!(f.env_vars.is_empty());
    }

    #[test]
    fn cpp_yields_i_flags() {
        let dirs = [PathBuf::from("resources"), PathBuf::from("vendor")];
        let f = format_include_flags("cpp", &dirs);
        assert_eq!(f.tokens, vec!["-Iresources", "-Ivendor"]);
        assert!(f.env_vars.is_empty());
    }

    #[test]
    fn java_prepends_resources_to_classpath() {
        let dirs = [PathBuf::from("resources")];
        let f = format_include_flags("java", &dirs);
        assert_eq!(f.tokens, vec!["-cp", "resources:."]);
    }

    #[test]
    fn python_uses_pythonpath_env_var() {
        let dirs = [PathBuf::from("resources")];
        let f = format_include_flags("python", &dirs);
        assert!(f.tokens.is_empty());
        assert_eq!(
            f.env_vars,
            vec![("PYTHONPATH".to_string(), "resources".to_string())]
        );
    }

    #[test]
    fn javascript_uses_node_path_env_var() {
        let dirs = [PathBuf::from("resources")];
        let f = format_include_flags("js", &dirs);
        assert_eq!(
            f.env_vars,
            vec![("NODE_PATH".to_string(), "resources".to_string())]
        );
    }

    #[test]
    fn rust_and_go_are_deferred_no_op() {
        let dirs = [PathBuf::from("resources")];
        assert!(format_include_flags("rust", &dirs).tokens.is_empty());
        assert!(format_include_flags("rust", &dirs).env_vars.is_empty());
        assert!(format_include_flags("go", &dirs).tokens.is_empty());
        assert!(format_include_flags("go", &dirs).env_vars.is_empty());
    }

    #[test]
    fn to_template_fragment_joins_tokens() {
        let dirs = [PathBuf::from("a"), PathBuf::from("b")];
        let f = format_include_flags("cpp", &dirs);
        assert_eq!(f.to_template_fragment(), "-Ia -Ib");
    }
}
