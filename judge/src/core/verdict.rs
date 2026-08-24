use serde::{Deserialize, Serialize};
use std::fmt;

/// Verdict from judging
///
/// NOTE: `OutputLimitExceeded`'s wire string `"output_limit_exceeded"` is a
/// cross-repo SSOT — it MUST stay in sync with `verdictEnum` in
/// `web/src/db/schema.ts` (Postgres enum) and `VERDICT_LABELS` in
/// `web/src/components/ui/badge.tsx` (see the matching comment there, same
/// pattern as `judge/files/languages.toml:12-13`'s language-list warning).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Verdict {
    Accepted,
    WrongAnswer,
    TimeLimitExceeded,
    MemoryLimitExceeded,
    RuntimeError,
    SystemError,
    CompileError,
    Skipped,
    PresentationError,
    Fail,
    Partial,
    /// User program was killed by SIGXFSZ (signal 25) — it wrote past the
    /// isolate `--fsize` cap (`RUN_FSIZE_KB` in `engine::executer`). Distinct
    /// from `RuntimeError` so runaway-output submissions are diagnosable
    /// instead of collapsing into a generic crash verdict.
    OutputLimitExceeded,
}

impl fmt::Display for Verdict {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let s = match self {
            Verdict::Accepted => "accepted",
            Verdict::WrongAnswer => "wrong_answer",
            Verdict::TimeLimitExceeded => "time_limit_exceeded",
            Verdict::MemoryLimitExceeded => "memory_limit_exceeded",
            Verdict::RuntimeError => "runtime_error",
            Verdict::SystemError => "system_error",
            Verdict::CompileError => "compile_error",
            Verdict::Skipped => "skipped",
            Verdict::PresentationError => "presentation_error",
            Verdict::Fail => "fail",
            Verdict::Partial => "partial",
            Verdict::OutputLimitExceeded => "output_limit_exceeded",
        };
        write!(f, "{}", s)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_output_limit_exceeded_display() {
        assert_eq!(
            Verdict::OutputLimitExceeded.to_string(),
            "output_limit_exceeded"
        );
    }

    #[test]
    fn test_output_limit_exceeded_serde_round_trip() {
        let json = serde_json::to_string(&Verdict::OutputLimitExceeded).unwrap();
        assert_eq!(json, "\"output_limit_exceeded\"");
        let back: Verdict = serde_json::from_str(&json).unwrap();
        assert_eq!(back, Verdict::OutputLimitExceeded);
    }
}
