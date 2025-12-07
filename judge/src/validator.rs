//! Validator module for testcase validation
//!
//! This module handles running testlib.h-based validators to verify
//! that testcase inputs conform to the expected format and constraints.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tokio::fs;
use tracing::{debug, info, warn};

use crate::compiler::ValidatorCompiler;
use crate::executer::{execute_trusted, ExecutionLimits, ExecutionSpec};
use crate::storage::StorageClient;

/// Validation job received from Redis queue
#[derive(Debug, Serialize, Deserialize)]
pub struct ValidateJob {
    /// Problem ID
    pub problem_id: i64,
    /// Validator source path in MinIO
    pub validator_path: String,
    /// List of testcase input paths to validate
    pub testcase_inputs: Vec<TestcaseInput>,
}

/// Testcase input information
#[derive(Debug, Serialize, Deserialize)]
pub struct TestcaseInput {
    /// Testcase ID
    pub id: i64,
    /// Input file path in MinIO
    pub input_path: String,
}

/// Result of validating a single testcase
#[derive(Debug, Serialize, Deserialize)]
pub struct TestcaseValidationResult {
    pub testcase_id: i64,
    pub valid: bool,
    pub message: Option<String>,
}

/// Result of validating all testcases
#[derive(Debug, Serialize, Deserialize)]
pub struct ValidateResult {
    pub problem_id: i64,
    pub success: bool,
    pub testcase_results: Vec<TestcaseValidationResult>,
    pub error_message: Option<String>,
}

/// Validator exit codes (testlib.h based)
mod validator_exit_codes {
    pub const OK: i32 = 0; // Valid input
    #[allow(dead_code)]
    pub const FAIL: i32 = 3; // Invalid input (validation failed)
}

/// Run a testlib.h-based validator on an input file
pub async fn run_validator(
    validator_path: &Path,
    input_path: &Path,
    timeout_secs: u64,
) -> Result<(bool, Option<String>)> {
    info!(
        "Running validator: {:?} with input={:?}",
        validator_path, input_path
    );

    // Read input file content to pass as stdin (testlib validators read from stdin)
    let input_content = fs::read_to_string(input_path)
        .await
        .context("Failed to read input file for validator")?;

    // Build execution spec for validator (no args, input via stdin)
    let spec = ExecutionSpec::new(validator_path.parent().unwrap_or(Path::new(".")))
        .with_command([validator_path.to_str().unwrap_or("")])
        .with_limits(ExecutionLimits {
            time_ms: (timeout_secs * 1000) as u32,
            memory_mb: 512,
        })
        .with_stdin(&input_content);

    let result = execute_trusted(&spec)
        .await
        .context("Failed to run validator")?;

    debug!(
        "Validator result: exit_code={}, stderr={}",
        result.exit_code(),
        result.stderr.chars().take(200).collect::<String>()
    );

    let valid = result.exit_code() == validator_exit_codes::OK;

    // Validator message is typically in stderr
    let message = if result.stderr.is_empty() {
        None
    } else {
        Some(result.stderr.trim().to_string())
    };

    Ok((valid, message))
}

/// Validator manager for handling validator compilation and caching
pub struct ValidatorManager {
    /// Compiler for validators
    compiler: ValidatorCompiler,
}

impl ValidatorManager {
    /// Create a new validator manager
    pub fn new() -> Self {
        Self {
            compiler: ValidatorCompiler::new(),
        }
    }

    /// Get the path to a compiled validator, compiling it if necessary
    pub async fn get_validator(
        &self,
        storage: &StorageClient,
        validator_source_path: &str,
        problem_id: i64,
    ) -> Result<std::path::PathBuf> {
        // Download source from storage
        info!("Downloading validator source: {}", validator_source_path);
        let source_content = storage.download_string(validator_source_path).await?;

        // Compile or get cached
        self.compiler
            .get_or_compile(&source_content, problem_id)
            .await
    }

    /// Clear cached validator for a problem
    pub async fn clear_cache(&self, problem_id: i64) -> Result<()> {
        self.compiler.clear_cache(problem_id).await
    }
}

/// Default timeout for validator execution (in seconds)
pub const DEFAULT_VALIDATOR_TIMEOUT_SECS: u64 = 30;

/// Process a validation job
pub async fn process_validate_job(
    job: &ValidateJob,
    storage: &StorageClient,
    validator_manager: &ValidatorManager,
) -> Result<ValidateResult> {
    info!("Processing validation job for problem {}", job.problem_id);

    // Get compiled validator
    let validator_path = match validator_manager
        .get_validator(storage, &job.validator_path, job.problem_id)
        .await
    {
        Ok(path) => path,
        Err(e) => {
            return Ok(ValidateResult {
                problem_id: job.problem_id,
                success: false,
                testcase_results: vec![],
                error_message: Some(format!("Failed to compile validator: {}", e)),
            });
        }
    };

    let mut testcase_results = Vec::with_capacity(job.testcase_inputs.len());
    let mut all_valid = true;

    // Create temp directory for input files
    let temp_dir = tempfile::tempdir()?;

    for tc in &job.testcase_inputs {
        // Download testcase input
        let input_content = match storage.download_string(&tc.input_path).await {
            Ok(content) => content,
            Err(e) => {
                warn!("Failed to download testcase input {}: {}", tc.id, e);
                testcase_results.push(TestcaseValidationResult {
                    testcase_id: tc.id,
                    valid: false,
                    message: Some(format!("Failed to download input: {}", e)),
                });
                all_valid = false;
                continue;
            }
        };

        // Write input to temp file
        let input_path = temp_dir.path().join(format!("input_{}.txt", tc.id));
        tokio::fs::write(&input_path, &input_content).await?;

        // Run validator
        match run_validator(&validator_path, &input_path, DEFAULT_VALIDATOR_TIMEOUT_SECS).await {
            Ok((valid, message)) => {
                if !valid {
                    all_valid = false;
                }
                testcase_results.push(TestcaseValidationResult {
                    testcase_id: tc.id,
                    valid,
                    message,
                });
            }
            Err(e) => {
                warn!("Validator error for testcase {}: {}", tc.id, e);
                testcase_results.push(TestcaseValidationResult {
                    testcase_id: tc.id,
                    valid: false,
                    message: Some(format!("Validator error: {}", e)),
                });
                all_valid = false;
            }
        }
    }

    Ok(ValidateResult {
        problem_id: job.problem_id,
        success: all_valid,
        testcase_results,
        error_message: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_job_serialization() {
        let job = ValidateJob {
            problem_id: 1,
            validator_path: "problems/1/validator/validator.cpp".to_string(),
            testcase_inputs: vec![TestcaseInput {
                id: 1,
                input_path: "problems/1/testcases/0_input.txt".to_string(),
            }],
        };

        let json = serde_json::to_string(&job).unwrap();
        let parsed: ValidateJob = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.problem_id, 1);
        assert_eq!(parsed.testcase_inputs.len(), 1);
    }
}
