//! two_step 문제의 변환기 실행.
//!
//! 변환기는 testlib 체커와 동일한 argv 규약으로 호출된다:
//!   `<bin> input.txt stage1.txt phase.txt`
//! 표준출력이 다음 단계의 표준입력 전체가 되고, 종료 코드가 판정이다.
//! 1회차(phase 1)에는 stage1.txt가 빈 파일로 들어간다.

use anyhow::{Context, Result};
use std::path::PathBuf;
use tracing::{debug, info};

use crate::components::checker::get_aoj_checker_sdk_path;
use crate::core::verdict::Verdict;
use crate::engine::compiler::TransformerCompiler;
use crate::engine::executer::{execute_sandboxed, ExecutionLimits, ExecutionSpec, ExecutionStatus};
use crate::infra::storage::StorageClient;

/// 변환기 실행 상한. 문제의 시간·메모리 제한과 무관한 별도 값이다.
pub const TRANSFORMER_TIMEOUT_SECS: u64 = 30;

/// 변환기 실행 메모리 상한 (MB).
const TRANSFORMER_MEMORY_MB: u32 = 1024;

/// 표준오류에서 뽑아 낼 진단 메시지 최대 길이 (문자).
const MESSAGE_LIMIT_CHARS: usize = 4096;

/// 준비된 변환기. C++은 컴파일된 바이너리, Python은 소스 그대로.
#[derive(Debug, Clone)]
pub enum TransformerInfo {
    Cpp(PathBuf),
    Python(String),
}

/// 변환기가 성공했을 때의 산출물.
#[derive(Debug)]
pub struct TransformerOutput {
    /// 다음 단계 표준입력으로 그대로 들어갈 페이로드.
    pub payload: String,
    /// 변환기 표준오류 (진단용).
    pub message: Option<String>,
}

/// 변환기 한 번의 실행 결과.
#[derive(Debug)]
pub enum TransformerOutcome {
    Ok(TransformerOutput),
    Rejected {
        verdict: Verdict,
        message: Option<String>,
    },
}

/// 변환기 경로가 Python 소스인지 판별한다. 체커와 같은 규칙이다.
pub fn is_python_transformer(transformer_path: &str) -> bool {
    transformer_path.ends_with(".py")
}

/// 종료 코드를 판정으로 옮긴다 (2회차 기준).
///
/// testlib 규약을 따르되 부분 점수(`POINTS_EXIT_CODE` = 7)는 지원하지 않는다.
/// 메시지 크기 기반 채점은 이 유형의 범위 밖이므로, 비율을 돌려주는 변환기는
/// 출제자 실수로 본다.
pub fn transformer_exit_to_verdict(exit_code: i32) -> Verdict {
    match exit_code {
        1 => Verdict::WrongAnswer,
        2 => Verdict::PresentationError,
        _ => Verdict::SystemError,
    }
}

/// 변환기를 한 번 실행한다.
///
/// `phase`는 1 또는 2다. `stage1_output`은 1회차에서 빈 문자열을 넘긴다.
pub async fn run_transformer(
    transformer: &TransformerInfo,
    phase: u8,
    input_content: &str,
    stage1_output: &str,
    env_vars: &[(String, String)],
) -> Result<TransformerOutcome> {
    info!("Running transformer (phase {})", phase);

    let temp_dir = tempfile::tempdir()?;
    let work_dir = temp_dir.path();

    let input_name = "input.txt";
    let stage1_name = "stage1.txt";
    let phase_name = "phase.txt";

    tokio::fs::write(work_dir.join(input_name), input_content).await?;
    tokio::fs::write(work_dir.join(stage1_name), stage1_output).await?;
    tokio::fs::write(work_dir.join(phase_name), format!("{}\n", phase)).await?;

    let mut spec = match transformer {
        TransformerInfo::Cpp(binary_path) => {
            let bin_name = "transformer";
            // tokio::fs::copy는 모드 비트를 보존하므로 실행 권한이 따라온다.
            tokio::fs::copy(binary_path, work_dir.join(bin_name))
                .await
                .with_context(|| {
                    format!("Failed to stage transformer binary from {:?}", binary_path)
                })?;
            ExecutionSpec::new(work_dir).with_command([
                format!("./{}", bin_name),
                input_name.to_string(),
                stage1_name.to_string(),
                phase_name.to_string(),
            ])
        }
        TransformerInfo::Python(source) => {
            tokio::fs::copy(get_aoj_checker_sdk_path(), work_dir.join("aoj_checker.py")).await?;
            tokio::fs::write(work_dir.join("transformer.py"), source).await?;
            ExecutionSpec::new(work_dir).with_command([
                "python3".to_string(),
                "-W".to_string(),
                "ignore".to_string(),
                "transformer.py".to_string(),
                input_name.to_string(),
                stage1_name.to_string(),
                phase_name.to_string(),
            ])
        }
    };

    spec = spec.with_limits(ExecutionLimits {
        time_ms: (TRANSFORMER_TIMEOUT_SECS * 1000) as u32,
        memory_mb: TRANSFORMER_MEMORY_MB,
    });

    // Python 변환기도 체커와 같이 스토리지 프록시를 쓸 수 있게 한다.
    if !env_vars.is_empty() {
        spec = spec.with_env_vars(env_vars.to_vec()).with_share_net();
    }

    let result = execute_sandboxed(&spec)
        .await
        .context("Failed to run transformer in sandbox")?;

    debug!(
        "Transformer phase {} result: status={:?}, time={}ms, stderr={}",
        phase,
        result.status,
        result.time_ms,
        result.stderr.chars().take(200).collect::<String>()
    );

    let message: Option<String> = if result.stderr.trim().is_empty() {
        None
    } else {
        Some(result.stderr.chars().take(MESSAGE_LIMIT_CHARS).collect())
    };

    Ok(match result.status {
        ExecutionStatus::Exited(0) => TransformerOutcome::Ok(TransformerOutput {
            payload: result.stdout,
            message,
        }),
        ExecutionStatus::Exited(code) => TransformerOutcome::Rejected {
            verdict: transformer_exit_to_verdict(code),
            message,
        },
        ExecutionStatus::TimeLimitExceeded => TransformerOutcome::Rejected {
            verdict: Verdict::SystemError,
            message: Some("transformer timed out".to_string()),
        },
        _ => TransformerOutcome::Rejected {
            verdict: Verdict::SystemError,
            message: message.or_else(|| Some("transformer crashed".to_string())),
        },
    })
}

/// 변환기 컴파일과 캐싱을 관리한다. `CheckerManager`와 같은 모양이다.
pub struct TransformerManager {
    compiler: TransformerCompiler,
}

impl TransformerManager {
    pub fn new() -> Self {
        Self {
            compiler: TransformerCompiler::new(),
        }
    }

    /// C++ 변환기 소스를 내려받아 컴파일하고 바이너리 경로를 돌려준다.
    pub async fn get_cpp_transformer(
        &self,
        storage: &StorageClient,
        source_path: &str,
        problem_id: i64,
    ) -> Result<PathBuf> {
        info!("Downloading transformer source: {}", source_path);
        let source_content = storage.download_string(source_path).await?;
        self.compiler
            .get_or_compile(&source_content, problem_id)
            .await
    }

    /// Python 변환기 소스를 내려받는다.
    pub async fn get_python_transformer_source(
        &self,
        storage: &StorageClient,
        source_path: &str,
    ) -> Result<String> {
        info!("Downloading Python transformer source: {}", source_path);
        storage.download_string(source_path).await
    }
}

impl Default for TransformerManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_testlib_exit_codes_map_to_verdicts() {
        // 0은 Rejected로 가지 않으므로 매핑 대상이 아니다.
        // 1/2/3과 그 외가 어떻게 갈리는지만 고정한다.
        assert_eq!(transformer_exit_to_verdict(1), Verdict::WrongAnswer);
        assert_eq!(transformer_exit_to_verdict(2), Verdict::PresentationError);
        assert_eq!(transformer_exit_to_verdict(3), Verdict::SystemError);
    }

    #[test]
    fn test_unknown_exit_codes_are_system_error() {
        // testlib POINTS_EXIT_CODE(7)를 포함해 규약 밖 코드는 전부 출제자 버그다.
        for code in [4, 5, 6, 7, 8, 42, 139, -1] {
            assert_eq!(
                transformer_exit_to_verdict(code),
                Verdict::SystemError,
                "exit code {} should map to SystemError",
                code
            );
        }
    }

    #[test]
    fn test_is_python_transformer_by_extension() {
        assert!(is_python_transformer("problems/1/transformer.py"));
        assert!(!is_python_transformer("problems/1/transformer.cpp"));
        assert!(!is_python_transformer("problems/1/transformer"));
    }
}
