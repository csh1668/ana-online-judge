# ANIGMA 다중 파일 컴파일 및 웹 IDE 확장 계획

> **Status**: Partially Implemented  
> **Last Updated**: 2025-12-26  
> **Related**: PLAN2.md (ANIGMA 대회 지원 계획)  
> **Goal**: 다중 파일 컴파일 지원 및 웹 IDE 테스트 환경 제공

---

## 1. 개요

### 1.1 목표
1. **다중 파일 컴파일 지원** - Anigma 문제 형식 (Makefile 기반)
2. **Anigma 점수 계산 시스템** - Task1 (30점) + Task2 (50~70점) + 보너스 (최대 20점, 대회 시)
3. **웹 IDE 테스트 환경** - 대회 참가자를 위한 온라인 코딩 환경

### 1.2 현재 시스템 한계

| 항목 | 현재 상태 | 필요 사항 |
|------|----------|----------|
| 소스 파일 | 단일 파일만 지원 | 다중 파일 (zip) |
| 컴파일 방식 | 언어별 고정 명령어 | Makefile 기반 (`make run`) |
| 입력 방식 | stdin만 지원 | args로 파일 경로 전달 |
| 채점 방식 | 정답/오답 이분법 | 점수 기반 (0~100점) |
| 개발 환경 | 없음 | 웹 IDE 제공 |

---

## 2. 다중 파일 컴파일 지원

### 2.1 Anigma 문제 형식 정의

**제출물 구조 (zip 파일):**
```
submission.zip
├── Makefile          # 필수: make build, make run 타겟 포함
├── main.cpp          # 메인 소스 파일
├── helper.cpp        # 추가 소스 파일
├── helper.h          # 헤더 파일
└── ...               # 기타 필요한 파일들
```

**Makefile 규약:**
```makefile
# 필수 타겟
CXX = g++
CXXFLAGS = -O2 -std=c++20 -Wall

# 빌드 타겟 (컴파일만)
build:
    $(CXX) $(CXXFLAGS) -o main main.cpp helper.cpp

# 실행 타겟 (INPUT 변수로 입력 파일 경로 받음)
run:
    ./main $(INPUT)

# 클린 타겟 (선택)
clean:
    rm -f main
```

**입력/출력 방식:**
- 입력: args로 파일 경로 전달 (`./main input.txt`)
- 출력: stdout으로 출력
- 프로그램 내부에서 `ifstream`으로 파일 읽기

### 2.2 데이터베이스 스키마 확장

```sql
-- problem_type enum 확장
ALTER TYPE problem_type ADD VALUE 'anigma';

-- problems 테이블 확장
ALTER TABLE problems ADD COLUMN:
  - input_method: varchar(10) DEFAULT 'stdin'  -- 'stdin' | 'args'
  - reference_code_path: text                   -- Anigma용 버그 있는 원본 코드 zip 경로

-- submissions 테이블 확장
ALTER TABLE submissions ADD COLUMN:
  - zip_path: text                              -- MinIO에 저장된 zip 경로
  - is_multifile: boolean DEFAULT false         -- 다중 파일 여부
```

### 2.3 Judge Worker 확장

#### 2.3.1 새로운 Job 타입

```rust
// judge/src/main.rs
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "job_type")]
pub enum WorkerJob {
    #[serde(rename = "judge")]
    Judge(JudgeJob),
    #[serde(rename = "validate")]
    Validate(ValidateJob),
    #[serde(rename = "anigma")]
    Anigma(AnigmaJudgeJob),       // Anigma 채점
    #[serde(rename = "playground")]
    Playground(PlaygroundJob),    // 테스트 실행
}
```

#### 2.3.2 Anigma Judge Job 구조

```rust
// judge/src/anigma/mod.rs (새 모듈)

#[derive(Debug, Serialize, Deserialize)]
pub struct AnigmaJudgeJob {
    pub submission_id: i64,
    pub problem_id: i64,
    pub zip_path: String,              // MinIO에 업로드된 zip 파일 경로
    pub reference_code_path: String,   // 원본 코드 경로 (편집 거리 계산용)
    pub time_limit: u32,               // ms
    pub memory_limit: u32,             // MB
    pub testcases: Vec<AnigmaTestcase>,
    /// Special judge용 checker 경로 (선택)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checker_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AnigmaTestcase {
    pub id: i64,
    pub input_path: String,            // MinIO 경로
    pub expected_output_path: String,  // MinIO 경로
}
```

#### 2.3.3 Anigma 채점 플로우

```rust
pub async fn process_anigma_job(
    job: &AnigmaJudgeJob,
    storage: &StorageClient,
    checker_manager: &CheckerManager,
) -> Result<JudgeResult> {
    let temp_dir = tempfile::tempdir()?;
    
    // 1. zip 파일 다운로드 및 압축 해제
    let zip_data = storage.download_bytes(&job.zip_path).await?;
    extract_zip(&zip_data, temp_dir.path())?;
    
    // 2. Makefile 존재 여부 확인
    let makefile_path = temp_dir.path().join("Makefile");
    if !makefile_path.exists() {
        return Ok(JudgeResult {
            submission_id: job.submission_id,
            verdict: "compile_error".into(),
            error_message: Some("Makefile not found".into()),
            ..Default::default()
        });
    }
    
    // 3. make build 실행 (컴파일)
    let config = get_config();
    let build_spec = ExecutionSpec::new(temp_dir.path())
        .with_command(&["make", "build"])
        .with_limits(ExecutionLimits {
            time_ms: config.compile_time_limit_ms,
            memory_mb: config.compile_memory_limit_mb,
        })
        .with_copy_out_dir(temp_dir.path());
    
    let build_result = execute_sandboxed(&build_spec).await?;
    
    if !build_result.is_success() {
        return Ok(JudgeResult {
            submission_id: job.submission_id,
            verdict: "compile_error".into(),
            error_message: Some(build_result.stderr),
            ..Default::default()
        });
    }
    
    // 4. 각 테스트케이스 실행
    let mut testcase_results = Vec::new();
    let mut overall_verdict = Verdict::Accepted;
    let mut max_time = 0u32;
    let mut max_memory = 0u32;
    
    for tc in &job.testcases {
        // 입력 파일 다운로드
        let input_data = storage.download_bytes(&tc.input_path).await?;
        let input_file = temp_dir.path().join("input.txt");
        std::fs::write(&input_file, &input_data)?;
        
        // make run file=input.txt 실행
        let run_spec = ExecutionSpec::new(temp_dir.path())
            .with_command(&["make", "run", &format!("file={}", input_file.display())])
            .with_limits(ExecutionLimits {
                time_ms: job.time_limit,
                memory_mb: job.memory_limit,
            });
        
        let run_result = execute_sandboxed(&run_spec).await?;
        
        // 결과 처리...
        let verdict = match run_result.status {
            ExecutionStatus::Exited(0) => {
                // 출력 비교 (checker 또는 단순 비교)
                let expected = storage.download_string(&tc.expected_output_path).await?;
                if compare_output(&run_result.stdout, &expected) {
                    Verdict::Accepted
                } else {
                    Verdict::WrongAnswer
                }
            }
            ExecutionStatus::TimeLimitExceeded => Verdict::TimeLimitExceeded,
            ExecutionStatus::MemoryLimitExceeded => Verdict::MemoryLimitExceeded,
            _ => Verdict::RuntimeError,
        };
        
        max_time = max_time.max(run_result.time_ms);
        max_memory = max_memory.max(run_result.memory_kb);
        
        testcase_results.push(TestcaseResult {
            testcase_id: tc.id,
            verdict: verdict.to_string(),
            execution_time: Some(run_result.time_ms),
            memory_used: Some(run_result.memory_kb),
            output: Some(run_result.stdout.chars().take(4096).collect()),
        });
        
        if verdict != Verdict::Accepted {
            overall_verdict = verdict;
            break;
        }
    }
    
    Ok(JudgeResult {
        submission_id: job.submission_id,
        verdict: overall_verdict.to_string(),
        execution_time: Some(max_time),
        memory_used: Some(max_memory),
        testcase_results,
        error_message: None,
    })
}
```

#### 2.3.4 ZIP 압축 해제 유틸리티

```rust
// judge/src/anigma/zip.rs
use std::io::{Read, Seek};
use std::path::Path;
use zip::ZipArchive;

pub fn extract_zip<R: Read + Seek>(data: R, dest: &Path) -> Result<()> {
    let mut archive = ZipArchive::new(data)?;
    
    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        let outpath = dest.join(file.name());
        
        if file.name().ends_with('/') {
            std::fs::create_dir_all(&outpath)?;
        } else {
            if let Some(parent) = outpath.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut outfile = std::fs::File::create(&outpath)?;
            std::io::copy(&mut file, &mut outfile)?;
        }
    }
    
    Ok(())
}
```

### 2.4 Anigma 점수 계산 시스템

#### 2.4.1 점수 구조

Anigma 문제는 단순 정답/오답이 아닌 **점수 기반** 채점을 사용합니다.

| Task | 점수 | 설명 |
|------|------|------|
| Task 1 | 30점 (고정) | 사용자가 input 파일 제출, A와 B의 출력이 달라야 정답 |
| Task 2 | 50~70점 | 사용자가 ZIP 파일 제출, 모든 테스트케이스 통과 시 max_score 점수 |
| 보너스 | 최대 20점 | 대회 제출 시에만, 편집 거리 기반 동적 계산 |
| **총점** | **최대 100점** | |

#### 2.4.2 대회 vs 비대회 제출

| 제출 유형 | max_score 값 | Task 2 점수 | 보너스 |
|----------|-------------|-------------|--------|
| **비대회 제출** | 70 | 정답 시 70점 | 0점 (계산 안함) |
| **대회 제출** | 50 | 정답 시 50점 | 동적 계산 (최대 20점) |

- 대회 여부는 `max_score` 값으로 판단 (adhoc 변수 추가 없음)
- 대회 기능 구현 시 web에서 대회 제출 여부에 따라 max_score를 50 또는 70으로 설정
- 관리자 페이지에서 ANIGMA 문제 생성 시 max_score 기본값은 70 (비대회용)

#### 2.4.3 보너스 점수 수식 (대회 제출 시에만 적용)

$$S_{user} = \lfloor B \times \left(\frac{R_{max} - R_{user}}{R_{max} - R_{min}}\right)^{k} \rfloor$$

- $B$ : 최대 보너스 점수 ($B = 20$)
- $R_{user}$ : 해당 사용자의 편집 거리 (Levenshtein distance)
- $R_{max}$ : 해당 대회에서 꼴등 편집 거리 (가장 많이 수정한 사람)
- $R_{min}$ : 해당 대회에서 1등 편집 거리 (가장 적게 수정한 사람)
- $k$ : 가중치 계수 ($k = 1.5$ 권장)
  - $k > 1$ : 상위권일수록 점수 하락폭이 가파르고 하위권은 완만해짐

**예시** ($B=20$, $k=1.5$, $R_{max}=1000$, $R_{min}=50$):
| 편집 거리 | 계산 | 보너스 점수 |
|----------|------|-------------|
| 50 (1등) | $20 \times (1.0)^{1.5}$ | **20점** |
| 200 | $20 \times (0.84)^{1.5}$ | **15점** |
| 500 | $20 \times (0.53)^{1.5}$ | **7점** |
| 800 | $20 \times (0.21)^{1.5}$ | **1점** |
| 1000 (꼴등) | $20 \times (0.0)^{1.5}$ | **0점** |

> **실시간 반영**: 보너스 점수는 대회 중에도 새 정답 제출이 있을 때마다 동적으로 재계산되어 실시간 반영됩니다.

#### 2.4.4 현재 구현된 채점 로직

현재 구현은 단순 All-or-Nothing 방식입니다:
- **Task 1**: 정답 시 30점, 오답 시 0점
- **Task 2**: 정답 시 max_score (70 또는 50), 오답 시 0점

편집 거리는 채점 시 계산되어 DB에 저장되며, 보너스 점수는 대회 종료 후 별도로 계산됩니다.

```rust
// judge/src/anigma.rs - Task 1 채점
const TASK1_SCORE: i64 = 30;

// Task 2 채점
let score = match overall_verdict {
    Verdict::Accepted => job.max_score,  // 70 (비대회) 또는 50 (대회)
    _ => 0,
};
```

#### 2.4.5 실시간 보너스 점수 계산 (대회 중)

대회 중에 새로운 정답 제출이 있을 때마다 해당 대회의 모든 정답 제출자의 보너스 점수를 재계산합니다.

**실시간 업데이트 플로우:**
```
새 정답 제출 → 편집 거리 저장 → R_max/R_min 재계산 → 모든 정답자 보너스 재계산 → DB 업데이트
```

**구현 로직:**

```typescript
// web/src/lib/anigma-bonus.ts

/**
 * 대회 내 모든 정답 제출자의 보너스 점수를 재계산
 * - 새 정답 제출 시 호출
 * - max_score가 50인 제출만 대상 (대회 제출)
 */
export async function recalculateCompetitionBonus(
    problemId: number,
    competitionId?: number  // 향후 대회 기능 구현 시 사용
) {
    const MAX_BONUS = 20;
    const K = 1.5;
    
    // 1. 해당 문제의 모든 대회 정답 제출 조회 (max_score=50이고 verdict=accepted)
    const acceptedSubmissions = await db.select({
        id: submissions.id,
        editDistance: submissions.editDistance,
    })
    .from(submissions)
    .where(and(
        eq(submissions.problemId, problemId),
        eq(submissions.verdict, "accepted"),
        eq(submissions.score, 50),  // 대회 제출만 (max_score=50)
        isNotNull(submissions.editDistance),
    ));
    
    if (acceptedSubmissions.length === 0) return;
    
    // 2. R_max, R_min 계산
    const distances = acceptedSubmissions.map(s => s.editDistance!);
    const R_max = Math.max(...distances);
    const R_min = Math.min(...distances);
    
    // 3. 각 제출의 보너스 점수 계산 및 업데이트
    for (const sub of acceptedSubmissions) {
        let bonus = 0;
        
        if (R_max === R_min) {
            // 모든 참가자의 편집 거리가 같으면 모두 최대 보너스
            bonus = MAX_BONUS;
        } else {
            const ratio = (R_max - sub.editDistance!) / (R_max - R_min);
            bonus = Math.floor(MAX_BONUS * Math.pow(ratio, K));
        }
        
        // 총점 = 기본점수(50) + 보너스
        const newScore = 50 + bonus;
        
        await db.update(submissions)
            .set({ 
                score: newScore,
                bonusScore: bonus,  // 보너스 점수 별도 저장 (향후 추가)
            })
            .where(eq(submissions.id, sub.id));
    }
}
```

**호출 시점:**
```typescript
// web/src/lib/redis-subscriber.ts 또는 채점 결과 처리 부분

// 채점 결과 수신 시
if (result.verdict === "accepted" && result.score === 50) {
    // 대회 정답 제출인 경우 보너스 재계산
    await recalculateCompetitionBonus(result.problemId);
}
```

**성능 고려사항:**
- 참가자가 수백 명 수준이면 매 제출마다 재계산해도 성능 이슈 없음
- 대규모 대회(1000명+)의 경우 debounce 또는 배치 처리 고려
- 편집 거리와 보너스 점수에 인덱스 추가 권장

```sql
CREATE INDEX idx_submissions_anigma_bonus 
ON submissions(problem_id, verdict, score) 
WHERE verdict = 'accepted' AND edit_distance IS NOT NULL;
```
```

#### 2.4.6 채점 플로우 수정 (점수 포함)

```rust
pub async fn process_anigma_job(
    job: &AnigmaJudgeJob,
    storage: &StorageClient,
) -> Result<AnigmaJudgeResult> {
    let temp_dir = tempfile::tempdir()?;
    
    // 1. zip 파일 다운로드 및 압축 해제
    let zip_data = storage.download_bytes(&job.zip_path).await?;
    extract_zip(&zip_data, temp_dir.path())?;
    
    // 제출된 코드 전체 읽기 (편집 거리 계산용)
    let submitted_code = read_all_source_files(temp_dir.path())?;
    
    // 2. Makefile 존재 여부 확인
    if !temp_dir.path().join("Makefile").exists() {
        return Ok(AnigmaJudgeResult {
            submission_id: job.submission_id,
            verdict: "compile_error".into(),
            score: AnigmaScore::zero(),
            error_message: Some("Makefile not found".into()),
            ..Default::default()
        });
    }
    
    // 3. make build 실행
    let build_result = execute_sandboxed(&ExecutionSpec::new(temp_dir.path())
        .with_command(&["make", "build"])
        .with_limits(compile_limits))
        .await?;
    
    if !build_result.is_success() {
        return Ok(AnigmaJudgeResult {
            submission_id: job.submission_id,
            verdict: "compile_error".into(),
            score: AnigmaScore::zero(),
            error_message: Some(build_result.stderr),
            ..Default::default()
        });
    }
    
    // 4. 각 테스트케이스 실행
    let mut passed = 0u32;
    let mut has_runtime_error_only = true;
    let mut testcase_results = Vec::new();
    
    for tc in &job.testcases {
        let input_data = storage.download_bytes(&tc.input_path).await?;
        let input_file = temp_dir.path().join("input.txt");
        std::fs::write(&input_file, &input_data)?;
        
        let run_result = execute_sandboxed(&ExecutionSpec::new(temp_dir.path())
            .with_command(&["make", "run", "file=input.txt"])
            .with_limits(run_limits))
            .await?;
        
        let verdict = match run_result.status {
            ExecutionStatus::Exited(0) => {
                has_runtime_error_only = false;  // 정상 실행됨
                let expected = storage.download_string(&tc.expected_output_path).await?;
                if compare_output(&run_result.stdout, &expected) {
                    passed += 1;
                    Verdict::Accepted
                } else {
                    Verdict::WrongAnswer
                }
            }
            ExecutionStatus::Exited(_) => {
                has_runtime_error_only = false;  // 실행은 됨 (비정상 종료)
                Verdict::RuntimeError
            }
            ExecutionStatus::TimeLimitExceeded => {
                has_runtime_error_only = false;
                Verdict::TimeLimitExceeded
            }
            ExecutionStatus::MemoryLimitExceeded => {
                has_runtime_error_only = false;
                Verdict::MemoryLimitExceeded
            }
            _ => Verdict::RuntimeError,
        };
        
        testcase_results.push(TestcaseResult {
            testcase_id: tc.id,
            verdict: verdict.to_string(),
            execution_time: Some(run_result.time_ms),
            memory_used: Some(run_result.memory_kb),
            output: Some(run_result.stdout.chars().take(4096).collect()),
        });
    }
    
    // 5. 점수 계산
    let total = job.testcases.len() as u32;
    let status = if has_runtime_error_only {
        JudgeStatus::RuntimeError
    } else if passed == total {
        JudgeStatus::AllPassed
    } else {
        JudgeStatus::RuntimeFixed
    };
    
    // 원본 코드 다운로드 (편집 거리 계산용)
    let reference_code = storage.download_string(&job.reference_code_path).await?;
    
    let score = calculate_anigma_score(
        status,
        &submitted_code,
        &reference_code,
        passed,
        total,
    );
    
    // 6. 결과 반환
    let overall_verdict = match status {
        JudgeStatus::RuntimeError => "runtime_error",
        JudgeStatus::RuntimeFixed => "partial",
        JudgeStatus::AllPassed => "accepted",
    };
    
    Ok(AnigmaJudgeResult {
        submission_id: job.submission_id,
        verdict: overall_verdict.into(),
        score,
        testcase_results,
        error_message: None,
    })
}
```

#### 2.4.7 결과 구조체 확장

```rust
/// Anigma 채점 결과
#[derive(Debug, Serialize, Deserialize)]
pub struct AnigmaJudgeResult {
    pub submission_id: i64,
    pub verdict: String,
    pub score: AnigmaScore,
    pub testcase_results: Vec<TestcaseResult>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
}
```

#### 2.4.8 DB 스키마 확장 (점수 저장)

```sql
-- submissions 테이블 확장 (Anigma 점수 상세)
ALTER TABLE submissions ADD COLUMN:
  - anigma_runtime_fix_score: integer DEFAULT 0
  - anigma_testcase_score: integer DEFAULT 0  
  - anigma_edit_distance_bonus: integer DEFAULT 0
  - anigma_edit_distance: integer              -- 편집 거리 (참고용)
  - passed_testcases: integer DEFAULT 0
  - total_testcases: integer DEFAULT 0
```

#### 2.4.9 점수 예시

**비대회 제출 (max_score=70):**
| 시나리오 | Task 1 | Task 2 | 보너스 | 총점 |
|---------|--------|--------|--------|------|
| Task 1만 성공 | 30 | 0 | 0 | **30점** |
| Task 2만 성공 | 0 | 70 | 0 | **70점** |
| 모두 성공 | 30 | 70 | 0 | **100점** |
| 모두 실패 | 0 | 0 | 0 | **0점** |

**대회 제출 (max_score=50):**
| 시나리오 | Task 1 | Task 2 | 보너스 | 총점 |
|---------|--------|--------|--------|------|
| Task 1만 성공 | 30 | 0 | 0 | **30점** |
| Task 2만 성공 (편집거리 높음) | 0 | 50 | 0 | **50점** |
| Task 2만 성공 (편집거리 중간) | 0 | 50 | 10 | **60점** |
| Task 2만 성공 (편집거리 낮음) | 0 | 50 | 20 | **70점** |
| 모두 성공 (편집거리 최소) | 30 | 50 | 20 | **100점** |

---

### 2.5 Web API 확장

#### 2.5.1 Anigma 제출 API

```typescript
// web/src/actions/anigma-submissions.ts
"use server";

import { getRedisClient } from "@/lib/redis";
import { uploadToMinIO } from "@/lib/minio";

export async function submitAnigmaCode(data: {
    problemId: number;
    zipFile: File;
    userId: number;
}): Promise<{ submissionId?: number; error?: string }> {
    try {
        // 1. ZIP 파일 검증
        const validation = await validateAnigmaZip(data.zipFile);
        if (!validation.valid) {
            return { error: validation.error };
        }
        
        // 2. MinIO에 업로드
        const zipPath = `submissions/anigma/${Date.now()}_${data.userId}.zip`;
        await uploadToMinIO(zipPath, await data.zipFile.arrayBuffer());
        
        // 3. DB에 제출 기록 생성
        const [submission] = await db.insert(submissions).values({
            problemId: data.problemId,
            userId: data.userId,
            code: "[ZIP FILE]",  // 또는 파일 목록
            language: "cpp",     // Anigma는 언어 고정 또는 별도 처리
            verdict: "pending",
            zipPath: zipPath,
            isMultifile: true,
        }).returning({ id: submissions.id });
        
        // 4. 테스트케이스 조회
        const problemTestcases = await db.select()
            .from(testcases)
            .where(eq(testcases.problemId, data.problemId));
        
        // 5. Judge Job 큐에 추가
        const redis = await getRedisClient();
        await redis.rpush("judge:queue", JSON.stringify({
            job_type: "anigma",
            submission_id: submission.id,
            problem_id: data.problemId,
            zip_path: zipPath,
            reference_code_path: problem[0].referenceCodePath,  // 편집 거리 계산용 원본 코드
            time_limit: problem[0].timeLimit,
            memory_limit: problem[0].memoryLimit,
            testcases: problemTestcases.map(tc => ({
                id: tc.id,
                input_path: tc.inputPath,
                expected_output_path: tc.outputPath,
            })),
        }));
        
        return { submissionId: submission.id };
    } catch (error) {
        console.error("Anigma submit error:", error);
        return { error: "제출 중 오류가 발생했습니다." };
    }
}

async function validateAnigmaZip(zipFile: File): Promise<{ valid: boolean; error?: string }> {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(await zipFile.arrayBuffer());
    
    // Makefile 존재 확인
    if (!zip.files["Makefile"]) {
        return { valid: false, error: "Makefile이 없습니다." };
    }
    
    // Makefile 내용 검증 (build, run 타겟 존재 여부)
    const makefileContent = await zip.files["Makefile"].async("string");
    if (!makefileContent.includes("build:")) {
        return { valid: false, error: "Makefile에 build 타겟이 없습니다." };
    }
    if (!makefileContent.includes("run:")) {
        return { valid: false, error: "Makefile에 run 타겟이 없습니다." };
    }
    
    return { valid: true };
}
```

---

## 3. 웹 IDE 테스트 환경

### 3.1 전체 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                     웹 IDE (프론트엔드)                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌────────────┐  ┌─────────────────────┐  ┌────────────────┐   │
│  │ File Tree  │  │   Monaco Editor     │  │ Output Panel   │   │
│  │            │  │   (탭 기반 편집)    │  │ ┌────────────┐ │   │
│  │ 📁 proj1/  │  │                     │  │ │ stdout     │ │   │
│  │   📄 Make* │  │   #include <...>    │  │ │ stderr     │ │   │
│  │   📄 main  │  │   int main() {      │  │ │ 실행 시간  │ │   │
│  │ 📁 proj2/  │  │     ...             │  │ └────────────┘ │   │
│  │   📄 Make* │  │                     │  │                │   │
│  │ 📄 sol.py  │  │                     │  │                │   │
│  │ 📄 sol.cpp │  │                     │  │                │   │
│  └────────────┘  └─────────────────────┘  └────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│ Toolbar: [▶ Run] [💾 Save] [📤 Upload ZIP] [📥 Download ZIP]   │
├─────────────────────────────────────────────────────────────────┤
│  Input Panel (stdin 또는 파일 내용)                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 5                                                        │   │
│  │ 1 2 3 4 5                                                │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

#### 3.1.1 접근 권한

플레이그라운드는 **권한이 있는 사용자만** 사용할 수 있습니다:
- `admin` 역할을 가진 사용자는 기본적으로 사용 가능
- 일반 사용자는 `playground_access` 권한이 부여된 경우에만 사용 가능
- 관리자가 관리 페이지에서 권한 부여/회수 가능

#### 3.1.2 실행 방식

하나의 세션에 **여러 개의 Makefile 프로젝트**와 **여러 개의 단일 파일**이 공존할 수 있습니다:

| 선택한 파일 | 실행 방식 | 설명 |
|------------|----------|------|
| `Makefile` | Makefile 실행 | 해당 폴더에서 `make build` → `make run file=input.txt` |
| `*.cpp`, `*.c` | C/C++ 단일 파일 | 해당 파일만 컴파일 후 실행 (stdin 입력) |
| `*.py` | Python 단일 파일 | `python3 파일명` 실행 (stdin 입력) |
| `*.java` | Java 단일 파일 | `javac` → `java` 실행 (stdin 입력) |
| `*.rs` | Rust 단일 파일 | `rustc` → 실행 (stdin 입력) |
| `*.go` | Go 단일 파일 | `go build` → 실행 (stdin 입력) |
| `*.js` | JavaScript 단일 파일 | `node 파일명` 실행 (stdin 입력) |

**지원 언어**: C, C++, Python, Java, Rust, Go, JavaScript (기존 채점 시스템과 동일)

### 3.2 데이터베이스 스키마

```sql
-- users 테이블 확장 (권한)
ALTER TABLE users ADD COLUMN:
  - playground_access: boolean DEFAULT false  -- 플레이그라운드 사용 권한

-- 플레이그라운드 세션 테이블
CREATE TABLE playground_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER REFERENCES users(id) NOT NULL,
    name VARCHAR(100) NOT NULL DEFAULT 'Untitled',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 플레이그라운드 파일 테이블
CREATE TABLE playground_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES playground_sessions(id) ON DELETE CASCADE NOT NULL,
    path VARCHAR(500) NOT NULL,        -- 파일 경로 (e.g., "proj1/main.cpp", "solution.py")
    content TEXT NOT NULL DEFAULT '',  -- 파일 내용
    is_directory BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(session_id, path)
);

-- 인덱스
CREATE INDEX idx_playground_sessions_user ON playground_sessions(user_id);
CREATE INDEX idx_playground_files_session ON playground_files(session_id);
CREATE INDEX idx_users_playground_access ON users(playground_access) WHERE playground_access = true;
```

### 3.3 Judge Worker - Playground Job

```rust
// judge/src/playground/mod.rs

#[derive(Debug, Serialize, Deserialize)]
pub struct PlaygroundJob {
    pub session_id: String,
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
    pub time_limit: u32,               // ms (기본 5000)
    pub memory_limit: u32,             // MB (기본 512)
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
        RunType::Makefile { folder: folder.to_string() }
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
        RunType::SingleFile { file_path, language } => {
            process_single_file(job, &temp_dir, &file_path, &language).await
        }
        RunType::Makefile { folder } => {
            process_makefile(job, &temp_dir, &folder).await
        }
        RunType::Unknown => {
            Ok(PlaygroundResult {
                session_id: job.session_id.clone(),
                success: false,
                stdout: String::new(),
                stderr: "지원하지 않는 파일 형식입니다.".to_string(),
                exit_code: 1,
                time_ms: 0,
                memory_kb: 0,
                compile_output: None,
            })
        }
    }
}

async fn process_single_file(
    job: &PlaygroundJob,
    temp_dir: &tempfile::TempDir,
    file_path: &str,      // 실행할 파일 경로
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
        let adjusted_cmd: Vec<String> = compile_cmd.iter()
            .map(|s| s.replace(&lang_config.source_file, source_filename))
            .collect();
        
        let compile_result = compile_in_sandbox(
            &work_dir,
            &adjusted_cmd,
            30_000,  // 30초
            2048,    // 2GB
        ).await?;
        
        if !compile_result.success {
            return Ok(PlaygroundResult {
                session_id: job.session_id.clone(),
                success: false,
                stdout: String::new(),
                stderr: compile_result.message.unwrap_or_default(),
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
    let run_cmd: Vec<String> = lang_config.run_command.iter()
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
    
    Ok(PlaygroundResult {
        session_id: job.session_id.clone(),
        success: result.is_success(),
        stdout: result.stdout,
        stderr: result.stderr,
        exit_code: result.exit_code(),
        time_ms: result.time_ms,
        memory_kb: result.memory_kb,
        compile_output,
    })
}

async fn process_makefile(
    job: &PlaygroundJob,
    temp_dir: &tempfile::TempDir,
    folder: &str,         // Makefile이 있는 폴더 경로
) -> Result<PlaygroundResult> {
    // 작업 디렉토리 결정
    let work_dir = if folder.is_empty() {
        temp_dir.path().to_path_buf()
    } else {
        temp_dir.path().join(folder)
    };
    
    // 1. make build
    let build_spec = ExecutionSpec::new(&work_dir)
        .with_command(&["make", "build"])
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
            stdout: build_result.stdout,
            stderr: build_result.stderr,
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
    let run_spec = ExecutionSpec::new(&work_dir)
        .with_command(&["make", "run", "file=input.txt"])
        .with_limits(ExecutionLimits {
            time_ms: job.time_limit,
            memory_mb: job.memory_limit,
        });
    
    let run_result = execute_sandboxed(&run_spec).await?;
    
    Ok(PlaygroundResult {
        session_id: job.session_id.clone(),
        success: run_result.is_success(),
        stdout: run_result.stdout,
        stderr: run_result.stderr,
        exit_code: run_result.exit_code(),
        time_ms: run_result.time_ms,
        memory_kb: run_result.memory_kb,
        compile_output: None,
    })
}
```

### 3.4 Web API

#### 3.4.1 권한 체크 유틸리티

```typescript
// web/src/lib/playground-auth.ts
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * 사용자가 플레이그라운드 접근 권한이 있는지 확인
 * - admin 역할이거나
 * - playground_access가 true인 경우
 */
export async function hasPlaygroundAccess(userId: number): Promise<boolean> {
    const [user] = await db.select({
        role: users.role,
        playgroundAccess: users.playgroundAccess,
    })
    .from(users)
    .where(eq(users.id, userId));
    
    if (!user) return false;
    
    return user.role === "admin" || user.playgroundAccess === true;
}

/**
 * 권한 체크 후 에러 반환
 */
export async function requirePlaygroundAccess(userId: number) {
    const hasAccess = await hasPlaygroundAccess(userId);
    if (!hasAccess) {
        throw new Error("플레이그라운드 사용 권한이 없습니다.");
    }
}
```

#### 3.4.2 관리자 권한 관리 API

```typescript
// web/src/actions/admin-playground.ts
"use server";

import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";

// 플레이그라운드 권한 부여
export async function grantPlaygroundAccess(adminId: number, targetUserId: number) {
    await requireAdmin(adminId);
    
    await db.update(users)
        .set({ playgroundAccess: true })
        .where(eq(users.id, targetUserId));
    
    return { success: true };
}

// 플레이그라운드 권한 회수
export async function revokePlaygroundAccess(adminId: number, targetUserId: number) {
    await requireAdmin(adminId);
    
    await db.update(users)
        .set({ playgroundAccess: false })
        .where(eq(users.id, targetUserId));
    
    return { success: true };
}

// 플레이그라운드 권한 있는 사용자 목록 조회
export async function getPlaygroundUsers(adminId: number) {
    await requireAdmin(adminId);
    
    return db.select({
        id: users.id,
        name: users.name,
        email: users.email,
        playgroundAccess: users.playgroundAccess,
    })
    .from(users)
    .where(eq(users.playgroundAccess, true));
}
```

#### 3.4.3 플레이그라운드 세션 API

```typescript
// web/src/actions/playground.ts
"use server";

import { db } from "@/db";
import { playgroundSessions, playgroundFiles } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requirePlaygroundAccess } from "@/lib/playground-auth";

// 세션 생성 (빈 세션, 자동 파일 생성 없음)
export async function createPlaygroundSession(userId: number, name?: string) {
    // 권한 체크
    await requirePlaygroundAccess(userId);
    
    const [session] = await db.insert(playgroundSessions).values({
        userId,
        name: name ?? "Untitled",
    }).returning();
    
    // 자동 파일 생성 없음 - 사용자가 직접 파일 생성/업로드
    
    return session;
}

// 세션 목록 조회
export async function getPlaygroundSessions(userId: number) {
    await requirePlaygroundAccess(userId);
    
    return db.select()
        .from(playgroundSessions)
        .where(eq(playgroundSessions.userId, userId))
        .orderBy(playgroundSessions.updatedAt);
}

// 세션 상세 조회 (파일 포함)
export async function getPlaygroundSession(sessionId: string, userId: number) {
    await requirePlaygroundAccess(userId);
    
    const [session] = await db.select()
        .from(playgroundSessions)
        .where(and(
            eq(playgroundSessions.id, sessionId),
            eq(playgroundSessions.userId, userId)
        ));
    
    if (!session) return null;
    
    const files = await db.select()
        .from(playgroundFiles)
        .where(eq(playgroundFiles.sessionId, sessionId));
    
    return { ...session, files };
}

// 세션 삭제
export async function deletePlaygroundSession(sessionId: string, userId: number) {
    await requirePlaygroundAccess(userId);
    
    await db.delete(playgroundSessions)
        .where(and(
            eq(playgroundSessions.id, sessionId),
            eq(playgroundSessions.userId, userId)
        ));
    
    return { success: true };
}

// 파일 저장
export async function savePlaygroundFile(
    sessionId: string,
    path: string,
    content: string
) {
    await db.insert(playgroundFiles)
        .values({ sessionId, path, content })
        .onConflictDoUpdate({
            target: [playgroundFiles.sessionId, playgroundFiles.path],
            set: { content, updatedAt: new Date() },
        });
    
    // 세션 업데이트 시간 갱신
    await db.update(playgroundSessions)
        .set({ updatedAt: new Date() })
        .where(eq(playgroundSessions.id, sessionId));
}

// 파일 삭제
export async function deletePlaygroundFile(sessionId: string, path: string) {
    await db.delete(playgroundFiles)
        .where(and(
            eq(playgroundFiles.sessionId, sessionId),
            eq(playgroundFiles.path, path)
        ));
}

// 파일 이름 변경
export async function renamePlaygroundFile(
    sessionId: string,
    oldPath: string,
    newPath: string
) {
    await db.update(playgroundFiles)
        .set({ path: newPath, updatedAt: new Date() })
        .where(and(
            eq(playgroundFiles.sessionId, sessionId),
            eq(playgroundFiles.path, oldPath)
        ));
}
```

#### 3.4.2 파일 업로드/다운로드 API

```typescript
// web/src/actions/playground-files.ts
"use server";

import JSZip from "jszip";

// ZIP 업로드
export async function uploadZipToPlayground(
    sessionId: string,
    zipBuffer: ArrayBuffer
) {
    const zip = await JSZip.loadAsync(zipBuffer);
    const files: { path: string; content: string }[] = [];
    
    for (const [path, file] of Object.entries(zip.files)) {
        if (!file.dir) {
            const content = await file.async("string");
            files.push({ path, content });
        }
    }
    
    // 기존 파일 삭제 후 새로 삽입
    await db.delete(playgroundFiles)
        .where(eq(playgroundFiles.sessionId, sessionId));
    
    if (files.length > 0) {
        await db.insert(playgroundFiles).values(
            files.map(f => ({
                sessionId,
                path: f.path,
                content: f.content,
            }))
        );
    }
    
    return { success: true, fileCount: files.length };
}

// ZIP 다운로드 (전체 또는 특정 폴더)
export async function downloadPlaygroundAsZip(
    sessionId: string,
    folderPath?: string
): Promise<{ data: string; filename: string }> {
    const files = await db.select()
        .from(playgroundFiles)
        .where(eq(playgroundFiles.sessionId, sessionId));
    
    const zip = new JSZip();
    
    for (const file of files) {
        // folderPath가 지정되면 해당 폴더만 포함
        if (!folderPath || file.path.startsWith(folderPath + "/") || file.path === folderPath) {
            const relativePath = folderPath
                ? file.path.slice(folderPath.length).replace(/^\//, "")
                : file.path;
            
            if (relativePath) {
                zip.file(relativePath, file.content);
            }
        }
    }
    
    const base64 = await zip.generateAsync({ type: "base64" });
    const filename = folderPath
        ? `${folderPath.split("/").pop()}.zip`
        : "playground.zip";
    
    return { data: base64, filename };
}
```

#### 3.4.5 실행 API

```typescript
// web/src/app/api/playground/run/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getRedisClient } from "@/lib/redis";
import { requirePlaygroundAccess } from "@/lib/playground-auth";
import { getPlaygroundSession } from "@/actions/playground";
import { auth } from "@/auth";

export async function POST(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    // 권한 체크
    try {
        await requirePlaygroundAccess(session.user.id);
    } catch {
        return NextResponse.json({ error: "No playground access" }, { status: 403 });
    }
    
    const {
        sessionId,
        targetPath,    // 실행할 파일 경로 (Makefile 또는 소스 파일)
        input,         // stdin (단일 파일) 또는 file_input (Makefile)
    } = await request.json();
    
    // 세션 파일 조회
    const playgroundSession = await getPlaygroundSession(sessionId, session.user.id);
    if (!playgroundSession) {
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    
    const redis = await getRedisClient();
    
    // 실행 타입 판별 (Makefile인지 소스 파일인지)
    const filename = targetPath.split('/').pop() || '';
    const isMakefile = filename === 'Makefile' || filename === 'makefile';
    
    // Job 생성
    const job = {
        job_type: "playground",
        session_id: sessionId,
        target_path: targetPath,
        files: playgroundSession.files.map((f: any) => ({
            path: f.path,
            content: f.content,
        })),
        stdin_input: isMakefile ? null : input,    // 단일 파일 실행 시
        file_input: isMakefile ? input : null,     // Makefile 실행 시
        time_limit: 5000,   // 5초
        memory_limit: 512,  // 512MB
    };
    
    // 결과 키 생성
    const resultKey = `playground:result:${sessionId}:${Date.now()}`;
    
    // Job 큐에 추가
    await redis.rpush("judge:queue", JSON.stringify({
        ...job,
        result_key: resultKey,
    }));
    
    // 결과 대기 (최대 30초)
    const result = await redis.blpop(resultKey, 30);
    
    if (!result) {
        return NextResponse.json(
            { error: "Execution timeout" },
            { status: 408 }
        );
    }
    
    return NextResponse.json(JSON.parse(result[1]));
}
```

### 3.5 프론트엔드 컴포넌트

#### 3.5.1 페이지 구조

```
/web/src/app/
├── playground/
│   ├── page.tsx                    # 세션 목록
│   └── [sessionId]/
│       └── page.tsx                # IDE 메인

/web/src/components/
├── playground/
│   ├── ide-layout.tsx              # 전체 레이아웃 (리사이즈 패널)
│   ├── file-tree.tsx               # 파일 트리
│   ├── file-tree-item.tsx          # 파일/폴더 아이템
│   ├── code-editor.tsx             # Monaco Editor 래퍼
│   ├── editor-tabs.tsx             # 탭 UI
│   ├── output-panel.tsx            # 실행 결과
│   ├── input-panel.tsx             # 입력 패널 (stdin 또는 file input)
│   ├── toolbar.tsx                 # 도구 모음 (Run 버튼 포함)
│   ├── download-modal.tsx          # 다운로드 모달 (폴더 선택)
│   └── upload-modal.tsx            # 업로드 모달 (zip, 파일)
```

#### 3.5.2 IDE 레이아웃 컴포넌트

```tsx
// web/src/components/playground/ide-layout.tsx
"use client";

import { useState, useMemo } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { FileTree } from "./file-tree";
import { CodeEditor } from "./code-editor";
import { OutputPanel } from "./output-panel";
import { InputPanel } from "./input-panel";
import { Toolbar } from "./toolbar";

interface PlaygroundFile {
    path: string;
    content: string;
}

interface IDELayoutProps {
    sessionId: string;
    initialFiles: PlaygroundFile[];
}

// 실행 가능한 파일인지 확인
function isExecutableFile(path: string): boolean {
    const filename = path.split('/').pop() || '';
    if (filename === 'Makefile' || filename === 'makefile') return true;
    
    const ext = filename.split('.').pop()?.toLowerCase();
    return ['c', 'cpp', 'cc', 'cxx', 'py', 'java', 'rs', 'go', 'js'].includes(ext || '');
}

// Makefile인지 확인
function isMakefile(path: string): boolean {
    const filename = path.split('/').pop() || '';
    return filename === 'Makefile' || filename === 'makefile';
}

export function IDELayout({ sessionId, initialFiles }: IDELayoutProps) {
    const [files, setFiles] = useState<PlaygroundFile[]>(initialFiles);
    const [activeFile, setActiveFile] = useState<string>(initialFiles[0]?.path ?? "");
    const [openTabs, setOpenTabs] = useState<string[]>([initialFiles[0]?.path ?? ""]);
    const [input, setInput] = useState("");
    const [output, setOutput] = useState<{
        stdout: string;
        stderr: string;
        timeMs: number;
        memoryKb: number;
    } | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    
    // 현재 선택된 파일이 실행 가능한지
    const canRun = useMemo(() => isExecutableFile(activeFile), [activeFile]);
    
    // 입력 패널 라벨 (Makefile이면 input.txt, 아니면 stdin)
    const inputLabel = useMemo(() => 
        isMakefile(activeFile) ? "input.txt (파일 입력)" : "stdin (표준 입력)",
        [activeFile]
    );
    
    const handleRun = async () => {
        if (!canRun) {
            setOutput({
                stdout: "",
                stderr: "실행할 수 없는 파일입니다. Makefile 또는 소스 파일을 선택해주세요.",
                timeMs: 0,
                memoryKb: 0,
            });
            return;
        }
        
        setIsRunning(true);
        setOutput(null);
        
        try {
            const response = await fetch("/api/playground/run", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sessionId,
                    targetPath: activeFile,  // 현재 선택된 파일을 실행
                    input,
                }),
            });
            
            const result = await response.json();
            
            if (result.error) {
                setOutput({
                    stdout: "",
                    stderr: result.error,
                    timeMs: 0,
                    memoryKb: 0,
                });
            } else {
                setOutput({
                    stdout: result.stdout,
                    stderr: result.stderr,
                    timeMs: result.time_ms,
                    memoryKb: result.memory_kb,
                });
            }
        } catch (error) {
            setOutput({
                stdout: "",
                stderr: "실행 중 오류가 발생했습니다.",
                timeMs: 0,
                memoryKb: 0,
            });
        } finally {
            setIsRunning(false);
        }
    };
    
    return (
        <div className="h-screen flex flex-col">
            <Toolbar
                onRun={handleRun}
                isRunning={isRunning}
                canRun={canRun}
                activeFile={activeFile}
                sessionId={sessionId}
                files={files}
            />
            
            <PanelGroup direction="horizontal" className="flex-1">
                {/* 파일 트리 */}
                <Panel defaultSize={20} minSize={15}>
                    <FileTree
                        files={files}
                        activeFile={activeFile}
                        onSelect={(path) => {
                            setActiveFile(path);
                            if (!openTabs.includes(path)) {
                                setOpenTabs([...openTabs, path]);
                            }
                        }}
                        onCreateFile={(path, content) => {
                            setFiles([...files, { path, content }]);
                        }}
                        onDeleteFile={(path) => {
                            setFiles(files.filter(f => f.path !== path));
                            setOpenTabs(openTabs.filter(t => t !== path));
                        }}
                        onRenameFile={(oldPath, newPath) => {
                            setFiles(files.map(f =>
                                f.path === oldPath ? { ...f, path: newPath } : f
                            ));
                        }}
                    />
                </Panel>
                
                <PanelResizeHandle className="w-1 bg-border" />
                
                {/* 에디터 + 출력 */}
                <Panel defaultSize={80}>
                    <PanelGroup direction="vertical">
                        {/* 코드 에디터 */}
                        <Panel defaultSize={60}>
                            <CodeEditor
                                files={files}
                                activeFile={activeFile}
                                openTabs={openTabs}
                                onTabClose={(path) => {
                                    setOpenTabs(openTabs.filter(t => t !== path));
                                    if (activeFile === path) {
                                        setActiveFile(openTabs[0] ?? "");
                                    }
                                }}
                                onTabSelect={setActiveFile}
                                onChange={(path, content) => {
                                    setFiles(files.map(f =>
                                        f.path === path ? { ...f, content } : f
                                    ));
                                }}
                            />
                        </Panel>
                        
                        <PanelResizeHandle className="h-1 bg-border" />
                        
                        {/* 입력 + 출력 */}
                        <Panel defaultSize={40}>
                            <PanelGroup direction="horizontal">
                                <Panel defaultSize={50}>
                                    <InputPanel
                                        value={input}
                                        onChange={setInput}
                                        label={inputLabel}
                                    />
                                </Panel>
                                
                                <PanelResizeHandle className="w-1 bg-border" />
                                
                                <Panel defaultSize={50}>
                                    <OutputPanel
                                        output={output}
                                        isRunning={isRunning}
                                    />
                                </Panel>
                            </PanelGroup>
                        </Panel>
                    </PanelGroup>
                </Panel>
            </PanelGroup>
        </div>
    );
}
```

---

## 4. 의존성 추가

### 4.1 Judge Worker (Rust)

```toml
# judge/Cargo.toml
[dependencies]
zip = "2.1"           # ZIP 압축 해제
```

### 4.2 Web (npm)

```json
{
  "dependencies": {
    "@monaco-editor/react": "^4.6",
    "jszip": "^3.10",
    "react-resizable-panels": "^2.0",
    "react-arborist": "^3.4"
  }
}
```

---

## 5. 개발 우선순위 (현황 기반 재조정)

### ✅ Phase 1: Judge Worker 확장 - 완료!
- [x] `zip` crate 추가 및 압축 해제 유틸리티 ✅
- [x] `PlaygroundJob` 타입 및 처리 로직 ✅
  - [x] `target_path` 기반 실행 타입 판별 (Makefile vs 단일 파일) ✅
  - [x] 모든 지원 언어 (C, C++, Python, Java, Rust, Go, JS) 처리 ✅
- [x] `AnigmaJudgeJob` 타입 및 처리 로직 ✅
- [x] `AnigmaTask1JudgeJob` 타입 및 처리 로직 ✅
- [x] Makefile 기반 빌드/실행 ✅
- [x] args로 입력 파일 전달 ✅
- [x] Anigma 편집 거리 계산 (Levenshtein) ✅
- [x] 점수 계산 및 저장 ✅

**파일**: `judge/src/anigma.rs`, `judge/src/playground/mod.rs`

### ⚠️ Phase 2: 웹 백엔드 API - 부분 완료
- [x] DB 스키마 마이그레이션 ✅
  - [x] `playground_sessions` 테이블 ✅
  - [x] `playground_files` 테이블 ✅
  - [x] `users.playground_access` 컬럼 ✅
  - [x] Anigma 관련 컬럼 (edit_distance, anigma_task_type 등) ✅
- [ ] **플레이그라운드 권한 관리 API** (구현 필요)
  - [ ] `grantPlaygroundAccess` (관리자)
  - [ ] `revokePlaygroundAccess` (관리자)
  - [ ] `hasPlaygroundAccess` (권한 체크)
- [ ] **Playground CRUD API** (구현 필요)
  - [ ] 세션 생성/조회/삭제
  - [ ] 파일 저장/조회/삭제/이름변경
- [ ] **실행 API** (`/api/playground/run`) (구현 필요)
- [ ] ZIP 업로드/다운로드 API (구현 필요)
- [x] Anigma 제출 API ✅

**기존 파일**: `web/src/actions/anigma-submissions.ts`

### ❌ Phase 3: 웹 IDE 프론트엔드 - 미구현
- [ ] IDE 레이아웃 컴포넌트 (선택 파일 기반 실행)
- [ ] Monaco Editor 통합
- [ ] 파일 트리 컴포넌트 (다중 Makefile, 다중 단일 파일 지원)
- [ ] 입력 패널 (stdin vs input.txt 자동 전환)
- [ ] 실행 결과 패널
- [ ] ZIP 업로드/다운로드 UI
- [ ] 관리자 페이지: 플레이그라운드 권한 관리 UI

**참고**: 이 단계는 **대회 운영에 필수는 아님** (선택 사항)

### 통합 테스트
- [x] Anigma Task1 채점 플로우 테스트 ✅ (구현 완료)
- [x] Anigma Task2 채점 플로우 테스트 ✅ (구현 완료)
- [x] 편집 거리 저장 ✅
- [ ] Playground 실행 테스트 (프론트엔드 미구현으로 보류)

### ✅ Phase 5: 실시간 보너스 계산 - 완료!
- [x] `recalculateContestBonus` 함수 구현 ✅
- [x] 정답 제출 시 보너스 재계산 트리거 ✅
- [x] R_max, R_min 동적 계산 ✅
- [x] 모든 정답 제출자의 보너스 점수 실시간 업데이트 ✅
- [ ] 대규모 대회용 성능 최적화 (debounce/배치 처리) - 필요 시 구현

**파일**: `web/src/lib/anigma-bonus.ts`, `web/src/lib/redis-subscriber.ts`

---

## 6. 주의사항

### 6.1 보안
- **플레이그라운드 접근 권한 체크** (admin 또는 playground_access)
- ZIP 파일 크기 제한 (10MB 권장)
- 파일 개수 제한 (100개 권장)
- 경로 traversal 방지 (`../` 차단)
- Makefile 명령어 검증 (위험한 명령 차단)

### 6.2 성능
- 플레이그라운드 실행 결과 캐싱 불필요 (매번 실행)
- 대용량 파일 편집 시 debounce 저장
- ZIP 압축/해제는 Worker에서 처리

### 6.3 사용자 경험
- 실행 중 로딩 표시
- 컴파일 에러 시 라인 하이라이트
- 자동 저장 (변경 후 1초 debounce)

---

*마지막 업데이트: 2025-12-26*

