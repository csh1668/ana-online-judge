use crate::compiler::compile_in_sandbox;
use crate::executer::{execute_sandboxed, ExecutionLimits, ExecutionSpec};
use crate::languages;
use anyhow::Result;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct PlaygroundJob {
    pub session_id: String,
    pub result_key: String,
    /// 실행할 파일 경로 (사용자가 선택한 파일)
    /// - Makefile이면 해당 폴더에서 make 실행
    /// - 소스 파일이면 단일 파일 실행
    pub target_path: String,
    /// 세션의 모든 파일 (실행에 필요한 파일들)
    pub files: Vec<PlaygroundFile>,
    /// stdin 입력 (단일 파일 실행 시)
    pub stdin_input: Option<String>,
    /// 파일 입력 내용 (Makefile 실행 시, input.txt로 저장됨)
    pub file_input: Option<String>,
    pub time_limit: u32,   // ms (기본 5000)
    pub memory_limit: u32, // MB (기본 512)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PlaygroundFile {
    pub path: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PlaygroundResult {
    pub session_id: String,
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub time_ms: u32,
    pub memory_kb: u32,
    pub compile_output: Option<String>,
}

/// 파일 확장자로 언어 감지
fn detect_language(path: &str) -> Option<&'static str> {
    let ext = path.rsplit('.').next()?;
    match ext.to_lowercase().as_str() {
        "c" => Some("c"),
        "cpp" | "cc" | "cxx" => Some("cpp"),
        "py" => Some("python"),
        "java" => Some("java"),
        "rs" => Some("rust"),
        "go" => Some("go"),
        "js" => Some("javascript"),
        _ => None,
    }
}

/// 실행 타입 결정
fn determine_run_type(target_path: &str) -> RunType {
    let filename = target_path.rsplit('/').next().unwrap_or(target_path);

    if filename == "Makefile" || filename == "makefile" {
        // Makefile 선택 → 해당 폴더에서 make 실행
        let folder = target_path.rsplit_once('/').map(|(f, _)| f).unwrap_or("");
        RunType::Makefile {
            folder: folder.to_string(),
        }
    } else if let Some(lang) = detect_language(target_path) {
        // 소스 파일 선택 → 단일 파일 실행
        RunType::SingleFile {
            file_path: target_path.to_string(),
            language: lang.to_string(),
        }
    } else {
        RunType::Unknown
    }
}

enum RunType {
    Makefile { folder: String },
    SingleFile { file_path: String, language: String },
    Unknown,
}

pub async fn process_playground_job(job: &PlaygroundJob) -> Result<PlaygroundResult> {
    let temp_dir = tempfile::tempdir()?;

    // 1. 모든 파일 생성
    for file in &job.files {
        let file_path = temp_dir.path().join(&file.path);
        if let Some(parent) = file_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&file_path, &file.content)?;
    }

    // 2. 실행 타입 결정
    let run_type = determine_run_type(&job.target_path);

    match run_type {
        RunType::SingleFile {
            file_path,
            language,
        } => process_single_file(job, &temp_dir, &file_path, &language).await,
        RunType::Makefile { folder } => process_makefile(job, &temp_dir, &folder).await,
        RunType::Unknown => Ok(PlaygroundResult {
            session_id: job.session_id.clone(),
            success: false,
            stdout: String::new(),
            stderr: "지원하지 않는 파일 형식입니다.".to_string(),
            exit_code: 1,
            time_ms: 0,
            memory_kb: 0,
            compile_output: None,
        }),
    }
}

async fn process_single_file(
    job: &PlaygroundJob,
    temp_dir: &tempfile::TempDir,
    file_path: &str, // 실행할 파일 경로
    language: &str,
) -> Result<PlaygroundResult> {
    let lang_config = languages::get_language_config(language)
        .ok_or_else(|| anyhow::anyhow!("Unsupported language: {}", language))?;

    // 파일이 있는 디렉토리로 이동
    let work_dir = if let Some((dir, _)) = file_path.rsplit_once('/') {
        temp_dir.path().join(dir)
    } else {
        temp_dir.path().to_path_buf()
    };

    // 소스 파일명 추출
    let source_filename = file_path.rsplit('/').next().unwrap_or(file_path);

    // 컴파일 명령어에서 소스 파일명 치환
    let compile_output = if let Some(compile_cmd) = &lang_config.compile_command {
        // compile_cmd의 소스 파일명을 실제 파일명으로 치환
        let adjusted_cmd: Vec<String> = compile_cmd
            .iter()
            .map(|s| s.replace(&lang_config.source_file, source_filename))
            .collect();

        let compile_result = compile_in_sandbox(
            &work_dir,
            &adjusted_cmd,
            30_000, // 30초
            2048,   // 2GB
        )
        .await?;

        if !compile_result.success {
            return Ok(PlaygroundResult {
                session_id: job.session_id.clone(),
                success: false,
                stdout: String::new(),
                stderr: compile_result.message.clone().unwrap_or_default(),
                exit_code: 1,
                time_ms: 0,
                memory_kb: 0,
                compile_output: compile_result.message,
            });
        }
        None
    } else {
        None
    };

    // 실행 명령어에서 파일명 치환
    let run_cmd: Vec<String> = lang_config
        .run_command
        .iter()
        .map(|s| s.replace(&lang_config.source_file, source_filename))
        .collect();

    // 실행
    let mut spec = ExecutionSpec::new(&work_dir)
        .with_command(&run_cmd)
        .with_limits(ExecutionLimits {
            time_ms: job.time_limit,
            memory_mb: job.memory_limit,
        });

    if let Some(stdin) = &job.stdin_input {
        spec = spec.with_stdin(stdin);
    }

    let result = execute_sandboxed(&spec).await?;

    let exit_code = result.exit_code();

    Ok(PlaygroundResult {
        session_id: job.session_id.clone(),
        success: result.is_success(),
        stdout: result.stdout,
        stderr: result.stderr,
        exit_code,
        time_ms: result.time_ms,
        memory_kb: result.memory_kb,
        compile_output,
    })
}

async fn process_makefile(
    job: &PlaygroundJob,
    temp_dir: &tempfile::TempDir,
    folder: &str, // Makefile이 있는 폴더 경로
) -> Result<PlaygroundResult> {
    // 작업 디렉토리 결정
    let work_dir = if folder.is_empty() {
        temp_dir.path().to_path_buf()
    } else {
        temp_dir.path().join(folder)
    };

    // 1. make build
    let build_spec = ExecutionSpec::new(&work_dir)
        .with_command(vec!["make".to_string(), "build".to_string()])
        .with_limits(ExecutionLimits {
            time_ms: 60_000,
            memory_mb: 2048,
        })
        .with_copy_out_dir(&work_dir);

    let build_result = execute_sandboxed(&build_spec).await?;

    if !build_result.is_success() {
        return Ok(PlaygroundResult {
            session_id: job.session_id.clone(),
            success: false,
            stdout: build_result.stdout.clone(),
            stderr: build_result.stderr.clone(),
            exit_code: build_result.exit_code(),
            time_ms: 0,
            memory_kb: 0,
            compile_output: Some(build_result.stderr),
        });
    }

    // 2. 입력 파일 생성 (작업 디렉토리에)
    if let Some(file_input) = &job.file_input {
        let input_path = work_dir.join("input.txt");
        std::fs::write(&input_path, file_input)?;
    }

    // 3. make run file=input.txt
    // Note: execute_sandboxed runs in a sandbox, so "input.txt" must be available inside.
    // execute_sandboxed copies work_dir content into the sandbox.
    // However, the command arguments need to be correct relative to the sandbox execution.
    // Since we write input.txt to work_dir, it will be at the root of the sandbox work dir.
    // We should pass file=input.txt (relative path) or absolute path inside sandbox.
    // Usually relative path works if CWD is correct.

    // Important: execute_sandboxed copies files FROM host work_dir TO sandbox work_dir.
    // The previous step (make build) might have produced a binary.
    // We used `with_copy_out_dir(&work_dir)` in build step, so the binary should be back in host work_dir.
    // So the next `execute_sandboxed` will pick it up.

    let run_spec = ExecutionSpec::new(&work_dir)
        .with_command(vec![
            "make".to_string(),
            "run".to_string(),
            "file=input.txt".to_string(),
        ])
        .with_limits(ExecutionLimits {
            time_ms: job.time_limit,
            memory_mb: job.memory_limit,
        });

    let run_result = execute_sandboxed(&run_spec).await?;

    let exit_code = run_result.exit_code();

    Ok(PlaygroundResult {
        session_id: job.session_id.clone(),
        success: run_result.is_success(),
        stdout: run_result.stdout,
        stderr: run_result.stderr,
        exit_code,
        time_ms: run_result.time_ms,
        memory_kb: run_result.memory_kb,
        compile_output: None,
    })
}
