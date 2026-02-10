use serde::{Deserialize, Serialize};
use std::fmt;

/// Verdict from judging
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
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
        };
        write!(f, "{}", s)
    }
}
