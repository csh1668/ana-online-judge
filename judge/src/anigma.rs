use crate::executer::{
    execute_sandboxed, ExecutionLimits, ExecutionOutcome, ExecutionSpec, ExecutionStatus,
};
use crate::judger::{compare_output, JudgeResult, TestcaseResult};
use crate::sandbox::get_config;
use crate::storage::StorageClient;
use crate::utils::extract_zip;
use crate::verdict::Verdict;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tempfile::TempDir;

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
    // 1. Setup project (Download ZIP, Extract, Build)
    let (temp_dir, build_result) = match setup_anigma_project(storage, &job.zip_path).await {
        Ok(res) => res,
        Err(e) => {
            return Ok(AnigmaJudgeResult {
                base: JudgeResult {
                    submission_id: job.submission_id,
                    verdict: "system_error".into(),
                    score: 0,
                    execution_time: None,
                    memory_used: None,
                    testcase_results: vec![],
                    error_message: Some(format!("Setup failed: {}", e)),
                },
                edit_distance: None,
            });
        }
    };

    // Check build result
    if let Some(error) = build_result {
        return Ok(AnigmaJudgeResult {
            base: JudgeResult {
                submission_id: job.submission_id,
                verdict: "compile_error".into(),
                score: 0,
                execution_time: None,
                memory_used: None,
                testcase_results: vec![],
                error_message: Some(error),
            },
            edit_distance: None,
        });
    }

    // 제출된 코드 전체 읽기 (편집 거리 계산용)
    let submitted_code = read_all_source_files(temp_dir.path())?;

    // 2. Run Testcases
    let mut testcase_results = Vec::new();
    let mut overall_verdict = Verdict::Accepted;
    let mut max_time_ms: u32 = 0;
    let mut max_memory_kb: u32 = 0;

    for tc in &job.testcases {
        let result = run_anigma_testcase(job, tc, temp_dir.path(), storage).await?;

        if let (Some(t), Some(m)) = (result.execution_time, result.memory_used) {
            max_time_ms = max_time_ms.max(t);
            max_memory_kb = max_memory_kb.max(m);
        }

        let verdict = match result.verdict.as_str() {
            "accepted" => Verdict::Accepted,
            "wrong_answer" => Verdict::WrongAnswer,
            "time_limit_exceeded" => Verdict::TimeLimitExceeded,
            "memory_limit_exceeded" => Verdict::MemoryLimitExceeded,
            _ => Verdict::WrongAnswer,
        };

        if verdict != Verdict::Accepted && overall_verdict == Verdict::Accepted {
            overall_verdict = verdict.clone();
        }

        testcase_results.push(result);

        if overall_verdict != Verdict::Accepted {
            break;
        }
    }

    // Fill skipped testcases
    for i in testcase_results.len()..job.testcases.len() {
        testcase_results.push(TestcaseResult {
            testcase_id: job.testcases[i].id,
            verdict: Verdict::Skipped.to_string(),
            execution_time: None,
            memory_used: None,
            output: None,
        });
    }

    // 3. Calculate Score and Edit Distance
    let score = match overall_verdict {
        Verdict::Accepted => job.max_score,
        _ => 0,
    };

    let edit_distance =
        calculate_edit_distance(storage, &job.reference_code_path, &submitted_code).await?;

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

/// Task 1 채점: A와 B의 출력이 달라야 정답
pub async fn process_anigma_task1_job(
    job: &AnigmaTask1JudgeJob,
    storage: &StorageClient,
) -> Result<JudgeResult> {
    const TASK1_SCORE: i64 = 30;

    // 1. Download Input
    let input_data = storage.download(&job.input_path).await?;

    // 2. Setup and Build Code A & B
    let (dir_a, build_err_a) = setup_anigma_project(storage, &job.reference_code_path).await?;
    if let Some(e) = build_err_a {
        return Ok(JudgeResult::system_error(
            job.submission_id,
            format!("Code A build failed: {}", e),
        ));
    }

    let (dir_b, build_err_b) = setup_anigma_project(storage, &job.solution_code_path).await?;
    if let Some(e) = build_err_b {
        return Ok(JudgeResult::system_error(
            job.submission_id,
            format!("Code B build failed: {}", e),
        ));
    }

    // 3. Run Code A & B
    let output_a =
        run_anigma_task1_execution(dir_a.path(), &input_data, job.time_limit, job.memory_limit)
            .await?;
    let output_b =
        run_anigma_task1_execution(dir_b.path(), &input_data, job.time_limit, job.memory_limit)
            .await?;

    tracing::info!(
        "ANIGMA Task1 Result: A status={:?}, B status={:?}",
        output_a.status,
        output_b.status
    );

    // 4. Determine Verdict
    let a_success = matches!(output_a.status, ExecutionStatus::Exited(0));
    let b_success = matches!(output_b.status, ExecutionStatus::Exited(0));

    let (verdict, score, error_message) = match (a_success, b_success) {
        (false, false) => (
            Verdict::SystemError,
            0,
            Some(format!(
                "Both failed: A={:?}, B={:?}",
                output_a.status, output_b.status
            )),
        ),
        (false, true) => (Verdict::Accepted, TASK1_SCORE, None),
        (true, false) => (
            Verdict::SystemError,
            0,
            Some(format!(
                "Code B execution failed: status={:?}",
                output_b.status
            )),
        ),
        (true, true) => {
            let is_different = output_a.stdout != output_b.stdout;
            if is_different {
                (Verdict::Accepted, TASK1_SCORE, None)
            } else {
                (Verdict::WrongAnswer, 0, None)
            }
        }
    };

    let max_time = output_a.time_ms.max(output_b.time_ms);
    let max_memory = output_a.memory_kb.max(output_b.memory_kb);

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

// --- Helper Functions ---

/// Downloads ZIP, extracts it, and runs `make build`.
/// Returns (TempDir, Option<ErrorMessage>). If ErrorMessage is Some, build failed.
async fn setup_anigma_project(
    storage: &StorageClient,
    zip_path: &str,
) -> Result<(TempDir, Option<String>)> {
    let temp_dir = tempfile::tempdir()?;

    // Download & Extract
    let zip_data = storage.download(zip_path).await?;
    let cursor = std::io::Cursor::new(zip_data);
    extract_zip(cursor, temp_dir.path())?;

    // Check Makefile
    let makefile_path = temp_dir.path().join("Makefile");
    if !makefile_path.exists() && !temp_dir.path().join("makefile").exists() {
        return Ok((temp_dir, Some("Makefile not found".to_string())));
    }

    // Make Build
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
            "Build failed for {}: stdout={}, stderr={}",
            zip_path,
            build_result.stdout,
            build_result.stderr
        );
        return Ok((temp_dir, Some(build_result.stderr)));
    }

    Ok((temp_dir, None))
}

async fn run_anigma_testcase(
    job: &AnigmaJudgeJob,
    tc: &AnigmaTestcase,
    work_dir: &Path,
    storage: &StorageClient,
) -> Result<TestcaseResult> {
    // Setup input
    let input_data = storage.download(&tc.input_path).await?;
    let input_file = work_dir.join("input.txt");
    std::fs::write(&input_file, &input_data)?;

    // Construct run command
    let input_arg = "file=input.txt".to_string();
    let make_cmd = format!("mkdir -p bin && ln -sf /usr/bin/python3 bin/python 2>/dev/null; export PATH=\"$PWD/bin:$PATH\"; make -s run {}", input_arg);

    let run_spec = ExecutionSpec::new(work_dir)
        .with_command(vec!["sh".to_string(), "-c".to_string(), make_cmd])
        .with_limits(ExecutionLimits {
            time_ms: job.time_limit,
            memory_mb: job.memory_limit,
        });

    let run_result = execute_sandboxed(&run_spec).await?;

    // Determine Verdict
    let verdict = match run_result.status {
        ExecutionStatus::Exited(0) => {
            let expected_bytes = storage.download(&tc.expected_output_path).await?;
            // Output comparison
            match String::from_utf8(expected_bytes.clone()) {
                Ok(expected_str) => {
                    if compare_output(&run_result.stdout, &expected_str) {
                        Verdict::Accepted
                    } else {
                        Verdict::WrongAnswer
                    }
                }
                Err(_) => {
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

    // Prepare Output
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

    Ok(TestcaseResult {
        testcase_id: tc.id,
        verdict: verdict.to_string(),
        execution_time,
        memory_used,
        output: Some(output.chars().take(4096).collect()),
    })
}

async fn run_anigma_task1_execution(
    work_dir: &Path,
    input_data: &[u8],
    time_limit: u32,
    memory_limit: u32,
) -> Result<ExecutionOutcome> {
    let input_filename = "input.bin";
    std::fs::write(work_dir.join(input_filename), input_data)?;

    let input_arg = format!("file={}", input_filename);
    let make_cmd = format!("mkdir -p bin && ln -sf /usr/bin/python3 bin/python 2>/dev/null; export PATH=\"$PWD/bin:$PATH\"; make -s run {}", input_arg);

    let run_spec = ExecutionSpec::new(work_dir)
        .with_command(vec!["sh".to_string(), "-c".to_string(), make_cmd])
        .with_limits(ExecutionLimits {
            time_ms: time_limit,
            memory_mb: memory_limit,
        });

    execute_sandboxed(&run_spec).await
}

async fn calculate_edit_distance(
    storage: &StorageClient,
    reference_path: &str,
    submitted_code: &str,
) -> Result<Option<u32>> {
    if reference_path.is_empty() {
        return Ok(None);
    }

    let reference_code = if reference_path.ends_with(".zip") {
        let temp_dir = tempfile::tempdir()?;
        let zip_data = storage.download(reference_path).await?;
        let cursor = std::io::Cursor::new(zip_data);
        extract_zip(cursor, temp_dir.path())?;
        read_all_source_files(temp_dir.path())?
    } else {
        storage.download_string(reference_path).await?
    };

    if reference_code.is_empty() {
        return Ok(None);
    }

    Ok(Some(triple_accel::levenshtein(
        submitted_code.as_bytes(),
        reference_code.as_bytes(),
    )))
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
