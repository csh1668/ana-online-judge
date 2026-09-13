//! two_step 문제의 테스트케이스 실행.
//!
//! 흐름 (테스트케이스 하나당):
//!   변환기 1회차 → 1단계 유저 실행 → 변환기 2회차 → 2단계 유저 실행 → 체커
//!
//! 저지는 단계 마커를 만들지 않는다. 유저 프로그램이 받는 두 표준입력은
//! 전부 변환기 표준출력 그대로다.

use anyhow::{Context, Result};
use std::path::Path;
use tracing::warn;

use crate::components::transformer::{run_transformer, TransformerInfo, TransformerOutcome};
use crate::core::languages::LanguageConfig;
use crate::core::verdict::Verdict;
use crate::engine::executer::{
    execute_sandboxed, ExecutionLimits, ExecutionSpec, ExecutionStatus, RUN_FSIZE_KB,
};
use crate::infra::storage::StorageClient;
use crate::jobs::judger::{
    downgrade_partial_without_subtasks, evaluate_user_output, CheckerInfo, JudgeJob, TestcaseInfo,
    TestcaseResult,
};

/// 사람이 읽을 단계 라벨.
pub(crate) fn stage_label(stage: u8) -> &'static str {
    match stage {
        1 => "[1단계]",
        _ => "[2단계]",
    }
}

/// 변환기 회차 라벨.
pub(crate) fn transformer_label(phase: u8) -> &'static str {
    match phase {
        1 => "[변환기 1회차]",
        _ => "[변환기 2회차]",
    }
}

/// 메시지 앞에 단계 라벨을 붙인다. 메시지가 없으면 라벨만 남긴다.
pub(crate) fn prefix_message(label: &str, message: Option<String>) -> Option<String> {
    Some(match message {
        Some(m) if !m.trim().is_empty() => format!("{} {}", label, m),
        _ => label.to_string(),
    })
}

/// 유저 실행 상태를 실패 판정으로 옮긴다. 정상 종료면 `None`.
///
/// 매핑은 `judger::run_single_testcase`와 동일하다. 시그널 25는 SIGXFSZ로,
/// `RUN_FSIZE_KB` 상한을 넘긴 출력 초과다.
pub(crate) fn run_status_to_verdict(status: &ExecutionStatus) -> Option<Verdict> {
    match status {
        ExecutionStatus::Exited(0) => None,
        ExecutionStatus::Exited(_) => Some(Verdict::RuntimeError),
        ExecutionStatus::TimeLimitExceeded => Some(Verdict::TimeLimitExceeded),
        ExecutionStatus::MemoryLimitExceeded => Some(Verdict::MemoryLimitExceeded),
        ExecutionStatus::Signaled(25) => Some(Verdict::OutputLimitExceeded),
        ExecutionStatus::Signaled(_) => Some(Verdict::RuntimeError),
        ExecutionStatus::SystemError => Some(Verdict::SystemError),
    }
}

/// 실패한 테스트케이스 결과를 만든다. 시간·메모리는 신뢰할 수 없으므로 비운다.
fn failed(tc_id: i64, verdict: Verdict, message: Option<String>) -> TestcaseResult {
    TestcaseResult {
        testcase_id: tc_id,
        verdict: verdict.to_string(),
        execution_time: None,
        memory_used: None,
        output: None,
        checker_message: message,
        partial_ratio: None,
    }
}

pub(crate) async fn run_two_step_testcase(
    job: &JudgeJob,
    tc: &TestcaseInfo,
    work_dir: &Path,
    lang_config: &LanguageConfig,
    storage: &StorageClient,
    transformer: &TransformerInfo,
    checker_info: Option<&CheckerInfo>,
    storage_env: &[(String, String)],
) -> Result<TestcaseResult> {
    let input_content = storage
        .download_string_cached(&tc.input_path)
        .await
        .with_context(|| format!("Failed to download testcase input: {}", tc.input_path))?;

    let expected_output = storage
        .download_string_cached(&tc.output_path)
        .await
        .with_context(|| format!("Failed to download testcase output: {}", tc.output_path))?;

    // 두 단계가 각각 문제 제한을 전액 쓴다. 언어별 보정도 각각 적용한다.
    let adjusted_time_limit = if job.ignore_time_limit_bonus {
        job.time_limit
    } else {
        lang_config.calculate_time_limit(job.time_limit)
    };
    let adjusted_memory_limit = if job.ignore_memory_limit_bonus {
        job.memory_limit
    } else {
        lang_config.calculate_memory_limit(job.memory_limit)
    };
    let limits = ExecutionLimits {
        time_ms: adjusted_time_limit,
        memory_mb: adjusted_memory_limit,
    };

    // --- 변환기 1회차: 1단계 표준입력을 만든다 ---
    let stage1_stdin = match run_transformer(transformer, 1, &input_content, "", storage_env).await
    {
        Ok(TransformerOutcome::Ok(out)) => out.payload,
        Ok(TransformerOutcome::Rejected { verdict, message }) => {
            // 1회차는 관리자가 넣고 검증기까지 통과한 입력만 읽는다. 여기서
            // 실패하면 제출자 잘못일 수 없으므로 무조건 출제자 버그로 올린다.
            // 원래 판정은 진단을 위해 메시지에만 남긴다.
            let detail = format!("변환기가 {}로 거부함", verdict);
            let message = Some(match message {
                Some(m) => format!("{} | {}", detail, m),
                None => detail,
            });
            return Ok(failed(
                tc.id,
                Verdict::SystemError,
                prefix_message(transformer_label(1), message),
            ));
        }
        Err(e) => {
            warn!("Transformer phase 1 failed for testcase {}: {:#}", tc.id, e);
            return Ok(failed(
                tc.id,
                Verdict::SystemError,
                prefix_message(transformer_label(1), Some(format!("{:#}", e))),
            ));
        }
    };

    // --- 1단계 유저 실행 ---
    let stage1 = execute_sandboxed(
        &ExecutionSpec::new(work_dir)
            .with_command(&lang_config.run_command)
            .with_limits(limits.clone())
            .with_stdin(&stage1_stdin)
            .with_fsize(RUN_FSIZE_KB),
    )
    .await?;

    if let Some(verdict) = run_status_to_verdict(&stage1.status) {
        return Ok(failed(tc.id, verdict, prefix_message(stage_label(1), None)));
    }

    // --- 변환기 2회차: 1단계 출력을 검증하고 2단계 표준입력을 만든다 ---
    let stage2_stdin =
        match run_transformer(transformer, 2, &input_content, &stage1.stdout, storage_env).await {
            Ok(TransformerOutcome::Ok(out)) => out.payload,
            Ok(TransformerOutcome::Rejected { verdict, message }) => {
                // 2회차 실패는 1단계 출력이 규칙을 어겼다는 뜻이므로 제출자 책임이다.
                return Ok(failed(
                    tc.id,
                    verdict,
                    prefix_message(transformer_label(2), message),
                ));
            }
            Err(e) => {
                warn!("Transformer phase 2 failed for testcase {}: {:#}", tc.id, e);
                return Ok(failed(
                    tc.id,
                    Verdict::SystemError,
                    prefix_message(transformer_label(2), Some(format!("{:#}", e))),
                ));
            }
        };

    // --- 2단계 유저 실행 ---
    let stage2 = execute_sandboxed(
        &ExecutionSpec::new(work_dir)
            .with_command(&lang_config.run_command)
            .with_limits(limits)
            .with_stdin(&stage2_stdin)
            .with_fsize(RUN_FSIZE_KB),
    )
    .await?;

    if let Some(verdict) = run_status_to_verdict(&stage2.status) {
        return Ok(failed(tc.id, verdict, prefix_message(stage_label(2), None)));
    }

    // --- 최종 판정: 원본 입력, 2단계 출력, 정답 ---
    let (verdict, checker_message, partial_ratio) = evaluate_user_output(
        checker_info,
        tc.id,
        &input_content,
        &stage2.stdout,
        &expected_output,
        storage_env,
    )
    .await?;

    let (verdict, checker_message, partial_ratio) = downgrade_partial_without_subtasks(
        job.has_subtasks,
        verdict,
        checker_message,
        partial_ratio,
    );

    // 보고 값은 두 단계의 최댓값이다.
    let (execution_time, memory_used) = if matches!(verdict, Verdict::Accepted | Verdict::Partial) {
        (
            Some(stage1.time_ms.max(stage2.time_ms)),
            Some(stage1.memory_kb.max(stage2.memory_kb)),
        )
    } else {
        (None, None)
    };

    let output_preview = if stage2.stdout.is_empty() {
        None
    } else {
        Some(stage2.stdout.chars().take(4096).collect::<String>())
    };

    Ok(TestcaseResult {
        testcase_id: tc.id,
        verdict: verdict.to_string(),
        execution_time,
        memory_used,
        output: output_preview,
        checker_message,
        partial_ratio,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stage_labels() {
        assert_eq!(stage_label(1), "[1단계]");
        assert_eq!(stage_label(2), "[2단계]");
    }

    #[test]
    fn test_prefix_message_attaches_label() {
        assert_eq!(
            prefix_message("[2단계]", Some("boom".to_string())),
            Some("[2단계] boom".to_string())
        );
    }

    #[test]
    fn test_prefix_message_creates_label_only_message_when_empty() {
        // 메시지가 없어도 어느 단계에서 죽었는지는 남아야 한다.
        assert_eq!(prefix_message("[1단계]", None), Some("[1단계]".to_string()));
    }

    #[test]
    fn test_run_status_to_verdict_maps_failures() {
        assert_eq!(run_status_to_verdict(&ExecutionStatus::Exited(0)), None);
        assert_eq!(
            run_status_to_verdict(&ExecutionStatus::Exited(1)),
            Some(Verdict::RuntimeError)
        );
        assert_eq!(
            run_status_to_verdict(&ExecutionStatus::TimeLimitExceeded),
            Some(Verdict::TimeLimitExceeded)
        );
        assert_eq!(
            run_status_to_verdict(&ExecutionStatus::MemoryLimitExceeded),
            Some(Verdict::MemoryLimitExceeded)
        );
        assert_eq!(
            run_status_to_verdict(&ExecutionStatus::Signaled(25)),
            Some(Verdict::OutputLimitExceeded)
        );
        assert_eq!(
            run_status_to_verdict(&ExecutionStatus::Signaled(11)),
            Some(Verdict::RuntimeError)
        );
        assert_eq!(
            run_status_to_verdict(&ExecutionStatus::SystemError),
            Some(Verdict::SystemError)
        );
    }
}
