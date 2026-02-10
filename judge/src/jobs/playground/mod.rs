use crate::core::languages;
use crate::engine::compiler::compile_in_sandbox;
use crate::engine::executer::{execute_sandboxed, ExecutionLimits, ExecutionSpec};
use anyhow::Result;
use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

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
    /// Base64 인코딩된 문자열 (바이너리 지원)
    pub file_input_base64: Option<String>,
    /// 파일 입력이 바이너리인지 여부
    #[serde(default)]
    pub file_input_is_binary: bool,
    /// ANIGMA 실행 모드 (make build -> make run file=...)
    #[serde(default)]
    pub anigma_mode: bool,
    /// ANIGMA 파일 이름 (anigma_mode가 true일 때 사용)
    pub anigma_file_name: Option<String>,
    pub time_limit: u32,   // ms (기본 5000)
    pub memory_limit: u32, // MB (기본 512)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PlaygroundFile {
    pub path: String,
    /// 파일 내용 (텍스트는 직접 문자열, 바이너리는 base64 인코딩)
    pub content: String,
    /// 파일이 바이너리인지 여부 (바이너리면 content는 base64)
    #[serde(default)]
    pub is_binary: bool,
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
    /// Files created during execution (e.g., from redirects like > test.out)
    pub created_files: Vec<CreatedFile>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreatedFile {
    pub path: String,
    /// File content as base64-encoded string (for binary files)
    pub content_base64: String,
    /// Whether this is a binary file
    pub is_binary: bool,
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

/// Check if a file path is safe (no path traversal)
fn is_safe_path(path: &str) -> bool {
    // Reject absolute paths
    if path.starts_with('/') {
        return false;
    }
    // Reject paths with .. components
    if path.contains("..") {
        return false;
    }
    // Reject empty path
    if path.is_empty() {
        return false;
    }
    true
}

/// Get list of files in a directory recursively (relative to base_dir)
fn list_files_in_dir(base_dir: &std::path::Path) -> Result<HashSet<String>> {
    let mut files = HashSet::new();

    fn walk_dir(
        dir: &std::path::Path,
        base: &std::path::Path,
        files: &mut HashSet<String>,
    ) -> Result<()> {
        if !dir.exists() {
            return Ok(());
        }
        let entries = std::fs::read_dir(dir)?;
        for entry in entries {
            let entry = entry?;
            let path = entry.path();
            let metadata = entry.metadata()?;

            if metadata.is_dir() {
                walk_dir(&path, base, files)?;
            } else if metadata.is_file() {
                // Get relative path from base_dir
                if let Ok(rel_path) = path.strip_prefix(base) {
                    if let Some(path_str) = rel_path.to_str() {
                        // Normalize path separators to forward slashes
                        let normalized = path_str.replace('\\', "/");
                        // Remove leading ./ if present
                        let normalized = normalized.strip_prefix("./").unwrap_or(&normalized);
                        files.insert(normalized.to_string());
                    }
                }
            }
        }
        Ok(())
    }

    walk_dir(base_dir, base_dir, &mut files)?;
    Ok(files)
}

/// Normalize file path for consistent comparison
fn normalize_path(path: &str) -> String {
    path.replace('\\', "/").trim_start_matches("./").to_string()
}

pub async fn process_playground_job(job: &PlaygroundJob) -> Result<PlaygroundResult> {
    let temp_dir = tempfile::tempdir()?;

    // 1. 모든 파일 생성 (모든 파일은 base64로 인코딩되어 있음)
    for file in &job.files {
        let file_path = temp_dir.path().join(&file.path);
        if let Some(parent) = file_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        // 모든 파일을 base64 디코딩
        let bytes = general_purpose::STANDARD
            .decode(&file.content)
            .map_err(|e| {
                anyhow::anyhow!(
                    "Failed to decode base64 file content for {}: {}",
                    file.path,
                    e
                )
            })?;
        std::fs::write(&file_path, bytes)?;
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
            created_files: vec![],
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
                created_files: vec![],
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

    // Filter out Java info messages from stderr
    let stderr = result
        .stderr
        .lines()
        .filter(|line| !line.trim().starts_with("Picked up JAVA_TOOL_OPTIONS"))
        .collect::<Vec<_>>()
        .join("\n");

    Ok(PlaygroundResult {
        session_id: job.session_id.clone(),
        success: result.is_success(),
        stdout: result.stdout,
        stderr,
        exit_code,
        time_ms: result.time_ms,
        memory_kb: result.memory_kb,
        compile_output,
        created_files: vec![], // Single file execution doesn't create files
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

    // Filter out Java info messages from stderr
    let build_stderr = build_result
        .stderr
        .lines()
        .filter(|line| !line.trim().starts_with("Picked up JAVA_TOOL_OPTIONS"))
        .collect::<Vec<_>>()
        .join("\n");

    if !build_result.is_success() {
        return Ok(PlaygroundResult {
            session_id: job.session_id.clone(),
            success: false,
            stdout: build_result.stdout.clone(),
            stderr: build_stderr.clone(),
            exit_code: build_result.exit_code(),
            time_ms: 0,
            memory_kb: 0,
            compile_output: Some(build_stderr),
            created_files: vec![],
        });
    }

    // 2. 입력 파일 생성 (작업 디렉토리에)
    let file_name = if job.anigma_mode {
        // ANIGMA 모드: playground session의 파일 사용
        let file_name = job.anigma_file_name.as_deref().unwrap_or("sample.in");

        // playground session의 files에서 해당 파일 찾기
        let anigma_file = job.files.iter().find(|f| f.path == file_name);

        if let Some(file) = anigma_file {
            let input_path = work_dir.join(file_name);
            // 모든 파일은 base64로 인코딩되어 있으므로 디코딩
            let bytes = general_purpose::STANDARD
                .decode(&file.content)
                .map_err(|e| {
                    anyhow::anyhow!(
                        "Failed to decode base64 file content for {}: {}",
                        file_name,
                        e
                    )
                })?;
            std::fs::write(&input_path, bytes)?;
        } else {
            return Err(anyhow::anyhow!(
                "ANIGMA 파일을 찾을 수 없습니다: {}",
                file_name
            ));
        }

        file_name.to_string()
    } else {
        // 일반 모드: input.txt에 입력 저장
        if let Some(file_input_base64) = &job.file_input_base64 {
            let input_path = work_dir.join("input.txt");
            // Decode base64 to bytes
            let bytes = general_purpose::STANDARD
                .decode(file_input_base64)
                .map_err(|e| anyhow::anyhow!("Failed to decode base64 input: {}", e))?;
            std::fs::write(&input_path, bytes)?;
        }
        "input.txt".to_string()
    };

    // 3. make run file={file_name}
    let run_spec = ExecutionSpec::new(&work_dir)
        .with_command(vec![
            "make".to_string(),
            "run".to_string(),
            format!("file={}", file_name),
        ])
        .with_limits(ExecutionLimits {
            time_ms: job.time_limit,
            memory_mb: job.memory_limit,
        })
        .with_copy_out_dir(&work_dir); // Copy output files (e.g., test.out) back to work_dir

    let run_result = execute_sandboxed(&run_spec).await?;

    // Get file list after run
    let files_after = list_files_in_dir(&work_dir)?;

    // Find all output files (newly created or overwritten)
    // Include files that were in files_before but might have been overwritten
    // This ensures files like test.out are always included even if they existed before
    let all_output_files: Vec<String> = files_after
        .iter()
        .filter(|path| {
            // Normalize path and check if safe
            let normalized = normalize_path(path);
            is_safe_path(&normalized)
        })
        .filter(|path| {
            // Exclude input file and isolate box internal files
            let normalized = normalize_path(path);
            normalized != file_name
                && normalized != "stdout.txt"
                && normalized != "stderr.txt"
                && normalized != "input.txt" // Also exclude input.txt if it exists
        })
        .cloned()
        .collect();

    // Read all output files (both new and overwritten)
    let created_files: Vec<CreatedFile> = all_output_files
        .into_iter()
        .filter_map(|rel_path| {
            let normalized_path = normalize_path(&rel_path);
            let full_path = work_dir.join(&normalized_path);
            if full_path.is_file() {
                // Try to read as binary first
                if let Ok(bytes) = std::fs::read(&full_path) {
                    // Check if file is binary (contains null bytes or non-UTF8 sequences)
                    let _is_binary = bytes.contains(&0) || std::str::from_utf8(&bytes).is_err();

                    // Always encode as base64 (no binary check needed per user request)
                    Some(CreatedFile {
                        path: normalized_path,
                        content_base64: general_purpose::STANDARD.encode(&bytes),
                        is_binary: false, // Always false as requested
                    })
                } else {
                    None
                }
            } else {
                None
            }
        })
        .collect();

    let exit_code = run_result.exit_code();

    // Filter out Java info messages from stderr
    let stderr = run_result
        .stderr
        .lines()
        .filter(|line| !line.trim().starts_with("Picked up JAVA_TOOL_OPTIONS"))
        .collect::<Vec<_>>()
        .join("\n");

    Ok(PlaygroundResult {
        session_id: job.session_id.clone(),
        success: run_result.is_success(),
        stdout: run_result.stdout,
        stderr,
        exit_code,
        time_ms: run_result.time_ms,
        memory_kb: run_result.memory_kb,
        compile_output: None,
        created_files,
    })
}
