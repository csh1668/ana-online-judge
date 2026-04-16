pub mod anigma;
pub mod judger;
pub mod playground;
pub mod validator;
pub mod workshop;

use crate::jobs::anigma::{AnigmaJudgeJob, AnigmaTask1JudgeJob};
use crate::jobs::judger::JudgeJob;
use crate::jobs::playground::PlaygroundJob;
use crate::jobs::validator::ValidateJob;
use crate::jobs::workshop::generate::WorkshopGenerateJob;
use crate::jobs::workshop::invoke::WorkshopInvokeJob;
use crate::jobs::workshop::validate::WorkshopValidateJob;
use serde::{Deserialize, Serialize};

/// Worker job enum - represents different types of jobs the worker can process
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "job_type")]
pub enum WorkerJob {
    /// Judge a user submission
    #[serde(rename = "judge")]
    Judge(JudgeJob),
    /// Validate testcases
    #[serde(rename = "validate")]
    Validate(ValidateJob),
    /// Anigma Task 2 Judge Job (ZIP 제출)
    #[serde(rename = "anigma")]
    Anigma(AnigmaJudgeJob),
    /// Anigma Task 1 Judge Job (input 파일 제출)
    #[serde(rename = "anigma_task1")]
    AnigmaTask1(AnigmaTask1JudgeJob),
    /// Playground execution job
    #[serde(rename = "playground")]
    Playground(PlaygroundJob),
    /// Workshop: generate a single testcase input via generator
    #[serde(rename = "workshop_generate")]
    WorkshopGenerate(WorkshopGenerateJob),
    /// Workshop: validate a testcase input via validator
    #[serde(rename = "workshop_validate")]
    WorkshopValidate(WorkshopValidateJob),
    /// Workshop: run one solution against one testcase
    #[serde(rename = "workshop_invoke")]
    WorkshopInvoke(WorkshopInvokeJob),
}
