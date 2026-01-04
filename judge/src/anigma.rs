use crate::checker::Verdict;
use crate::executer::{execute_sandboxed, ExecutionLimits, ExecutionSpec, ExecutionStatus};
use crate::judger::{compare_output, JudgeResult, TestcaseResult};
use crate::sandbox::get_config;
use crate::storage::StorageClient;
use crate::utils::extract_zip;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Task 1: 사용자가 input 파일을 제출하여 A와 B의 출력이 다른지 확인
#[derive(Debug, Serialize, Deserialize)]
pub struct AnigmaTask1JudgeJob {
    pub submission_id: i64,
    pub problem_id: i64,
    pub input_path: String,          // 사용자가 제출한 input 파일 (MinIO 경로)
    pub reference_code_path: String, // 문제 제공 코드 A (ZIP)
    pub solution_code_path: String,  // 정답 코드 B (ZIP)
    pub time_limit: u32,
    pub memory_limit: u32,
}

/// Task 2: 사용자가 ZIP 파일을 제출하여 테스트케이스 통과 여부 확인
#[derive(Debug, Serialize, Deserialize)]
pub struct AnigmaJudgeJob {
    pub submission_id: i64,
    pub problem_id: i64,
    pub zip_path: String,
    pub reference_code_path: String,
    pub time_limit: u32,
    pub memory_limit: u32,
    pub max_score: i64,
    pub testcases: Vec<AnigmaTestcase>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checker_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AnigmaTestcase {
    pub id: i64,
    pub input_path: String,
    pub expected_output_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AnigmaJudgeResult {
    #[serde(flatten)]
    pub base: JudgeResult,
    pub edit_distance: Option<u32>,
}

impl AnigmaJudgeResult {
    pub fn system_error(submission_id: i64, message: String) -> Self {
        Self {
            base: JudgeResult::system_error(submission_id, message),
            edit_distance: None,
        }
    }
}

pub async fn process_anigma_job(
    job: &AnigmaJudgeJob,
    storage: &StorageClient,
) -> Result<AnigmaJudgeResult> {
    let temp_dir = tempfile::tempdir()?;

    // 1. zip 파일 다운로드 및 압축 해제
    let zip_data = storage.download(&job.zip_path).await?;
    let cursor = std::io::Cursor::new(zip_data);
    extract_zip(cursor, temp_dir.path())?;

    // 제출된 코드 전체 읽기 (편집 거리 계산용)
    let submitted_code = read_all_source_files(temp_dir.path())?;

    // 2. Makefile 존재 여부 확인
    let makefile_path = temp_dir.path().join("Makefile");
    if !makefile_path.exists() && !temp_dir.path().join("makefile").exists() {
        return Ok(AnigmaJudgeResult {
            base: JudgeResult {
                submission_id: job.submission_id,
                verdict: "compile_error".into(),
                score: 0,
                execution_time: None,
                memory_used: None,
                testcase_results: vec![],
                error_message: Some("Makefile not found".into()),
            },
            edit_distance: None,
        });
    }

    // 3. make build 실행
    let config = get_config();
    let build_spec = ExecutionSpec::new(temp_dir.path())
        .with_command(vec!["make".to_string(), "build".to_string()])
        .with_limits(ExecutionLimits {
            time_ms: config.compile_time_limit_ms,
            memory_mb: config.compile_memory_limit_mb,
        })
        .with_copy_out_dir(temp_dir.path());

    let build_result = execute_sandboxed(&build_spec).await?;

    if !build_result.is_success() {
        tracing::error!(
            "ANIGMA build failed for submission {}: exit_code={:?}, stdout={}, stderr={}",
            job.submission_id,
            build_result.status,
            build_result.stdout,
            build_result.stderr
        );
        return Ok(AnigmaJudgeResult {
            base: JudgeResult {
                submission_id: job.submission_id,
                verdict: "compile_error".into(),
                score: 0,
                execution_time: None,
                memory_used: None,
                testcase_results: vec![],
                error_message: Some(build_result.stderr),
            },
            edit_distance: None,
        });
    }

    // 4. 각 테스트케이스 실행
    let mut testcase_results = Vec::new();
    let mut overall_verdict = Verdict::Accepted;
    let mut max_time_ms: u32 = 0;
    let mut max_memory_kb: u32 = 0;

    for tc in &job.testcases {
        let input_data = storage.download(&tc.input_path).await?;
        let input_file = temp_dir.path().join("input.txt");
        std::fs::write(&input_file, &input_data)?;

        // make run file=input.txt
        // 주의: sandbox 내부에서는 상대 경로로 접근해야 함
        // Python 심볼릭 링크 생성 후 make 실행 (python 명령이 없을 경우를 대비)
        // /usr/bin에는 쓰기 권한이 없을 수 있으므로 현재 디렉토리에 링크를 만들고 PATH에 추가
        let input_arg = "file=input.txt".to_string();
        let make_cmd = format!("mkdir -p bin && ln -sf /usr/bin/python3 bin/python 2>/dev/null; export PATH=\"$PWD/bin:$PATH\"; make -s run {}", input_arg);

        let run_spec = ExecutionSpec::new(temp_dir.path())
            .with_command(vec!["sh".to_string(), "-c".to_string(), make_cmd])
            .with_limits(ExecutionLimits {
                time_ms: job.time_limit,
                memory_mb: job.memory_limit,
            });

        let run_result = execute_sandboxed(&run_spec).await?;

        max_time_ms = max_time_ms.max(run_result.time_ms);
        max_memory_kb = max_memory_kb.max(run_result.memory_kb);

        // 디버깅용 로그
        tracing::info!(
            "ANIGMA testcase {} result: status={:?}, stdout={}, stderr={}",
            tc.id,
            run_result.status,
            run_result.stdout.chars().take(100).collect::<String>(),
            run_result.stderr.chars().take(100).collect::<String>()
        );

        let verdict = match run_result.status {
            ExecutionStatus::Exited(0) => {
                // Download expected output as bytes (supports both text and binary)
                let expected_bytes = storage.download(&tc.expected_output_path).await?;
                
                // Check if expected output is valid UTF-8 text
                match String::from_utf8(expected_bytes.clone()) {
                    Ok(expected_str) => {
                        // Text output: use compare_output for line ending normalization
                        if compare_output(&run_result.stdout, &expected_str) {
                            Verdict::Accepted
                        } else {
                            Verdict::WrongAnswer
                        }
                    }
                    Err(_) => {
                        // Binary output: compare bytes exactly using raw stdout_bytes
                        if run_result.stdout_bytes == expected_bytes.as_slice() {
                            Verdict::Accepted
                        } else {
                            Verdict::WrongAnswer
                        }
                    }
                }
            }
            ExecutionStatus::Exited(_) => Verdict::WrongAnswer,
            ExecutionStatus::TimeLimitExceeded => Verdict::TimeLimitExceeded,
            ExecutionStatus::MemoryLimitExceeded => Verdict::MemoryLimitExceeded,
            _ => Verdict::WrongAnswer,
        };

        // stderr가 있으면 output에 함께 포함
        let output = if run_result.stderr.is_empty() {
            run_result.stdout.clone()
        } else {
            format!(
                "=== stdout ===\n{}\n=== stderr ===\n{}",
                run_result.stdout, run_result.stderr
            )
        };

        let (execution_time, memory_used) = if verdict == Verdict::Accepted {
            (Some(run_result.time_ms), Some(run_result.memory_kb))
        } else {
            (None, None)
        };

        testcase_results.push(TestcaseResult {
            testcase_id: tc.id,
            verdict: verdict.to_string(),
            execution_time,
            memory_used,
            output: Some(output.chars().take(4096).collect()),
        });

        if verdict != Verdict::Accepted && overall_verdict == Verdict::Accepted {
            overall_verdict = verdict;
            break;
        }
    }

    // 중단 이후 남은 테스트케이스는 모두 스킵 처리
    for i in testcase_results.len()..job.testcases.len() {
        let tc = &job.testcases[i];
        testcase_results.push(TestcaseResult {
            testcase_id: tc.id,
            verdict: Verdict::Skipped.to_string(),
            execution_time: None,
            memory_used: None,
            output: None,
        });
    }

    // 5. 점수 계산
    let score = match overall_verdict {
        Verdict::Accepted => job.max_score,
        _ => 0,
    };

    // 원본 코드 다운로드 (편집 거리 계산용)
    let reference_code = if job.reference_code_path.is_empty() {
        // reference_code_path가 비어있으면 빈 문자열 사용 (편집 거리 보너스 없음)
        String::new()
    } else if job.reference_code_path.ends_with(".zip") {
        // ZIP 파일인 경우 압축 해제 후 모든 소스 파일 읽기
        let ref_temp_dir = tempfile::tempdir()?;
        let ref_zip_data = storage.download(&job.reference_code_path).await?;
        let ref_cursor = std::io::Cursor::new(ref_zip_data);
        extract_zip(ref_cursor, ref_temp_dir.path())?;
        read_all_source_files(ref_temp_dir.path())?
    } else {
        // 일반 텍스트 파일인 경우
        storage.download_string(&job.reference_code_path).await?
    };

    let edit_distance = match reference_code {
        ref_code if ref_code.is_empty() => {
            tracing::warn!("No reference code for this problem: {}", job.problem_id);
            None
        }
        ref_code => {
            let distance = triple_accel::levenshtein(submitted_code.as_ref(), ref_code.as_ref());
            Some(distance)
        }
    };

    Ok(AnigmaJudgeResult {
        base: JudgeResult {
            submission_id: job.submission_id,
            verdict: overall_verdict.to_string(),
            score,
            execution_time: if overall_verdict == Verdict::Accepted {
                Some(max_time_ms)
            } else {
                None
            },
            memory_used: if overall_verdict == Verdict::Accepted {
                Some(max_memory_kb)
            } else {
                None
            },
            testcase_results,
            error_message: None,
        },
        edit_distance,
    })
}

// Helper to read all source files in directory recursively
fn read_all_source_files(dir: &Path) -> Result<String> {
    let mut code = String::new();
    let entries = std::fs::read_dir(dir)?;

    // 정렬된 순서로 읽기 위해 vector로 수집
    let mut paths = Vec::new();
    for entry in entries {
        let entry = entry?;
        paths.push(entry.path());
    }
    paths.sort();

    for path in paths {
        if path.is_dir() {
            code.push_str(&read_all_source_files(&path)?);
        } else {
            // 소스 파일 확장자 체크 (cpp, c, h, hpp 등)
            if let Some(ext) = path.extension() {
                let ext_str = ext.to_string_lossy().to_lowercase();
                if ["cpp", "c", "h", "hpp", "cc", "cxx", "java", "py"].contains(&ext_str.as_str()) {
                    let content = std::fs::read_to_string(&path).unwrap_or_default();
                    code.push_str(&content);
                    code.push('\n');
                }
            }
        }
    }

    Ok(code)
}

/// Helper to extract ZIP and run make build
async fn extract_and_build(
    storage: &StorageClient,
    zip_path: &str,
    target_dir: &Path,
) -> Result<()> {
    // ZIP 다운로드 및 압축 해제
    let zip_data = storage.download(zip_path).await?;
    let cursor = std::io::Cursor::new(zip_data);
    extract_zip(cursor, target_dir)?;

    // Makefile 존재 여부 확인
    let makefile_path = target_dir.join("Makefile");
    if !makefile_path.exists() && !target_dir.join("makefile").exists() {
        anyhow::bail!("Makefile not found in {}", zip_path);
    }

    // make build 실행
    let config = get_config();
    let build_spec = ExecutionSpec::new(target_dir)
        .with_command(vec!["make".to_string(), "build".to_string()])
        .with_limits(ExecutionLimits {
            time_ms: config.compile_time_limit_ms,
            memory_mb: config.compile_memory_limit_mb,
        })
        .with_copy_out_dir(target_dir);

    let build_result = execute_sandboxed(&build_spec).await?;

    if !build_result.is_success() {
        anyhow::bail!(
            "Build failed: exit={:?}, stderr={}",
            build_result.status,
            build_result.stderr
        );
    }

    Ok(())
}

/// Task 1 채점: A와 B의 출력이 달라야 정답
pub async fn process_anigma_task1_job(
    job: &AnigmaTask1JudgeJob,
    storage: &StorageClient,
) -> Result<JudgeResult> {
    const TASK1_SCORE: i64 = 30;

    // 1. 사용자가 제출한 input 파일 다운로드
    let input_data = storage.download(&job.input_path).await?;

    // 2. 코드 A (문제 제공 코드) ZIP 다운로드, 압축 해제, make build
    let code_a_dir = tempfile::tempdir()?;
    if let Err(e) = extract_and_build(storage, &job.reference_code_path, code_a_dir.path()).await {
        return Ok(JudgeResult {
            submission_id: job.submission_id,
            verdict: Verdict::SystemError.to_string(),
            score: 0,
            execution_time: None,
            memory_used: None,
            testcase_results: vec![],
            error_message: Some(format!("Code A build failed: {}", e)),
        });
    }

    // 3. 코드 B (정답 코드) ZIP 다운로드, 압축 해제, make build
    let code_b_dir = tempfile::tempdir()?;
    if let Err(e) = extract_and_build(storage, &job.solution_code_path, code_b_dir.path()).await {
        return Ok(JudgeResult {
            submission_id: job.submission_id,
            verdict: Verdict::SystemError.to_string(),
            score: 0,
            execution_time: None,
            memory_used: None,
            testcase_results: vec![],
            error_message: Some(format!("Code B build failed: {}", e)),
        });
    }

    // 4. input 파일을 각 디렉토리에 복사
    let input_filename = "input.bin";
    std::fs::write(code_a_dir.path().join(input_filename), &input_data)?;
    std::fs::write(code_b_dir.path().join(input_filename), &input_data)?;

    // 5. A: make run file=input.bin
    let input_arg = format!("file={}", input_filename);
    let make_cmd_a = format!("mkdir -p bin && ln -sf /usr/bin/python3 bin/python 2>/dev/null; export PATH=\"$PWD/bin:$PATH\"; make -s run {}", input_arg);
    let run_spec_a = ExecutionSpec::new(code_a_dir.path())
        .with_command(vec![
            "sh".to_string(),
            "-c".to_string(),
            make_cmd_a,
        ])
        .with_limits(ExecutionLimits {
            time_ms: job.time_limit,
            memory_mb: job.memory_limit,
        });

    let output_a = execute_sandboxed(&run_spec_a).await?;

    tracing::info!(
        "ANIGMA Task1 Code A result: status={:?}, stdout_len={}, stderr_len={}",
        output_a.status,
        output_a.stdout.len(),
        output_a.stderr.len()
    );

    // 6. B: make run file=input.bin
    let make_cmd_b = format!("mkdir -p bin && ln -sf /usr/bin/python3 bin/python 2>/dev/null; export PATH=\"$PWD/bin:$PATH\"; make -s run {}", input_arg);
    let run_spec_b = ExecutionSpec::new(code_b_dir.path())
        .with_command(vec!["sh".to_string(), "-c".to_string(), make_cmd_b])
        .with_limits(ExecutionLimits {
            time_ms: job.time_limit,
            memory_mb: job.memory_limit,
        });

    let output_b = execute_sandboxed(&run_spec_b).await?;

    tracing::info!(
        "ANIGMA Task1 Code B result: status={:?}, stdout_len={}, stderr_len={}",
        output_b.status,
        output_b.stdout.len(),
        output_b.stderr.len()
    );

    // 7. 실행 결과에 따른 판정
    let a_success = matches!(output_a.status, ExecutionStatus::Exited(0));
    let b_success = matches!(output_b.status, ExecutionStatus::Exited(0));
    let a_runtime_error = !a_success;
    let b_runtime_error = !b_success;

    let (verdict, score, error_message) = if a_runtime_error && b_runtime_error {
        // 코드 A 런타임 에러 && 코드 B 런타임 에러 -> 시스템 에러
        (
            Verdict::SystemError,
            0,
            Some(format!(
                "Both Code A and Code B execution failed: A status={:?}, B status={:?}",
                output_a.status,
                output_b.status
            )),
        )
    } else if a_runtime_error && b_success {
        // 코드 A 런타임 에러 && 코드 B exited(0) -> 정답
        (
            Verdict::Accepted,
            TASK1_SCORE,
            None,
        )
    } else if a_success && b_runtime_error {
        // 코드 A exited(0) && 코드 B 런타임 에러 -> 시스템 에러 (현행 유지)
        (
            Verdict::SystemError,
            0,
            Some(format!(
                "Code B execution failed: status={:?}, stderr={}",
                output_b.status,
                output_b.stderr.chars().take(500).collect::<String>()
            )),
        )
    } else {
        // 코드 A exited(0) && 코드 B exited(0) -> 출력 비교 (현행 유지)
        let is_different = output_a.stdout != output_b.stdout;
        (
            if is_different {
                Verdict::Accepted
            } else {
                Verdict::WrongAnswer
            },
            if is_different { TASK1_SCORE } else { 0 },
            None,
        )
    };

    let max_time = output_a.time_ms.max(output_b.time_ms);
    let max_memory = output_a.memory_kb.max(output_b.memory_kb);

    tracing::info!(
        "ANIGMA Task1 completed: submission_id={}, verdict={}, score={}",
        job.submission_id,
        verdict,
        score
    );

    Ok(JudgeResult {
        submission_id: job.submission_id,
        verdict: verdict.to_string(),
        score,
        execution_time: if verdict == Verdict::Accepted {
            Some(max_time)
        } else {
            None
        },
        memory_used: if verdict == Verdict::Accepted {
            Some(max_memory)
        } else {
            None
        },
        testcase_results: vec![],
        error_message,
    })
}
