# ANIGMA 대회 지원을 위한 AOJ 확장 계획

> **Status**: Implementation Phase  
> **Last Updated**: 2025-12-26  
> **Target**: ANIGMA 대회 지원 완성  
> **Goal**: AOJ를 ANIGMA 대회의 공식 플랫폼으로 활용

---

## 1. 현재 AOJ 상태 분석

### ✅ 이미 구현된 기능

#### 1.1 ANIGMA 채점 시스템
- ✅ Task 1 (Differential Testing): input 파일 제출, A와 B 코드 출력 비교 (30점)
- ✅ Task 2 (ZIP 제출): 다중 파일 컴파일, Makefile 기반 빌드, 테스트케이스 채점 (50/70점)
- ✅ 편집 거리 계산 (Levenshtein) 및 DB 저장
- ✅ 보너스 점수 재계산 로직 (`recalculateContestBonus`)
- ✅ Redis subscriber에서 정답 시 자동 보너스 재계산 트리거

#### 1.2 대회 시스템 기본
- ✅ `contests` 테이블 (시작/종료 시간, 프리징 설정)
- ✅ `contestProblems`, `contestParticipants` 테이블
- ✅ 대회 전용 계정 (`contestAccountOnly`, `contestId` 필드)
- ✅ 사용자(user) 단위 참가 (팀 기능 없음 - 대회 전용 계정 공유 방식)
- ✅ 기본 스코어보드 (ICPC 스타일)
- ✅ Spotboard UI (ICPC 스타일, 프리징 지원)

#### 1.3 기타
- ✅ Multi-language 지원 (C, C++, Python, Java, Rust, Go, JS)
- ✅ Special Judge / Validator
- ✅ 샌드박스 환경 (isolate)
- ✅ Redis 큐 기반 워커
- ✅ SSE 기반 실시간 제출 상태 업데이트

---

### ❌ 부족한 기능 (ANIGMA 특화 요구사항)

| 요구사항 | 현재 상태 | 필요 작업 |
|---------|----------|----------|
| **ANIGMA 스코어보드 로직** | ICPC 스타일만 지원 | ANIGMA 점수 기반 순위 계산 강화 |
| **보너스 점수 실시간 반영** | 재계산은 됨 | 스코어보드에 보너스 점수 포함 표시 |
| **ANIGMA 최고 점수만 반영** | 모든 제출 추적 | 사용자별 문제당 최고 점수 제출만 스코어보드 반영 |
| **Spotboard ANIGMA 지원** | ICPC 전용 | ANIGMA 문제 점수 변화 애니메이션 |
| **대회 관리 UI 개선** | 기본 기능만 | ANIGMA 문제 설정, max_score 조정 등 |

---

## 2. 데이터베이스 스키마 현황

### 2.1 이미 존재하는 테이블 ✅

```sql
-- 대회 테이블 (이미 존재)
contests:
  - id: serial PRIMARY KEY
  - title: text NOT NULL
  - description: text
  - start_time: timestamp NOT NULL
  - end_time: timestamp NOT NULL
  - freeze_minutes: integer DEFAULT 60  -- 종료 전 N분 프리징
  - is_frozen: boolean DEFAULT false
  - visibility: enum('public', 'private')
  - scoreboard_type: enum('basic', 'spotboard')
  - penalty_minutes: integer DEFAULT 20
  - created_at, updated_at: timestamp

-- 대회-문제 매핑 (이미 존재)
contest_problems:
  - id: serial PRIMARY KEY
  - contest_id: integer REFERENCES contests(id)
  - problem_id: integer REFERENCES problems(id)
  - label: text  -- 'A', 'B', 'C' 등
  - order: integer

-- 대회 참가자 (사용자 단위, 이미 존재)
contest_participants:
  - id: serial PRIMARY KEY
  - contest_id: integer REFERENCES contests(id)
  - user_id: integer REFERENCES users(id)
  - registered_at: timestamp

-- 제출 테이블 (ANIGMA 확장 포함, 이미 존재)
submissions:
  - ... (기본 필드)
  - contest_id: integer                -- 대회 제출
  - zip_path: text                     -- Task 2 ZIP 경로
  - is_multifile: boolean
  - edit_distance: integer             -- Levenshtein 거리
  - anigma_task_type: integer          -- 1 (Task1) or 2 (Task2)
  - anigma_input_path: text            -- Task 1 입력 파일 경로
  - passed_testcases, total_testcases: integer
  - score: integer                     -- 점수 (보너스 포함)

-- 문제 테이블 (ANIGMA 확장 포함, 이미 존재)
problems:
  - ... (기본 필드)
  - problem_type: enum('icpc', 'special_judge', 'anigma')
  - input_method: enum('stdin', 'args')
  - reference_code_path: text          -- ANIGMA 코드 A (ZIP)
  - solution_code_path: text           -- ANIGMA 코드 B (ZIP)
  - max_score: integer DEFAULT 100

-- 사용자 테이블 (대회 전용 계정 지원, 이미 존재)
users:
  - ... (기본 필드)
  - contest_account_only: boolean DEFAULT false
  - contest_id: integer                -- 대회 전용 계정이 속한 대회
```

### 2.2 필요 없는 테이블 (팀 기능 제거)

**팀 시스템은 구현하지 않음!**
- 대회 참가는 **사용자(user) 단위**로 진행
- 대회 전용 계정을 생성하고 여러 팀원이 공유하는 방식 사용
- `teams`, `team_members`, `contest_teams` 테이블 불필요

### 2.3 추가 검토 필요한 컬럼

```sql
-- submissions 테이블에 추가 고려
ALTER TABLE submissions ADD COLUMN (optional):
  - bonus_score: integer DEFAULT 0    -- 보너스 점수 별도 추적 (선택)
  
-- contest_problems 테이블에 추가 고려 (향후)
ALTER TABLE contest_problems ADD COLUMN (future):
  - task1_score: integer DEFAULT 30   -- Task 1 배점
  - task2_base_score: integer DEFAULT 50  -- Task 2 기본 배점
```

---

## 3. 개발 우선순위 (재조정)

> **기존 구현 활용**: ANIGMA Task1/Task2 채점, 보너스 재계산, 대회 기본 구조는 이미 완료  
> **집중 영역**: ANIGMA 전용 스코어보드 로직 강화 및 UI 개선

---

### Phase 1: ANIGMA 스코어보드 로직 강화 (1주)

#### 1.1 스코어보드 계산 로직 개선 (3일)
- [x] 기본 스코어보드 구현 (ICPC 스타일)
- [ ] **ANIGMA 전용 스코어보드 로직 추가**
  - 사용자별 문제당 **최고 점수 제출만 반영**
  - Task 1 + Task 2 점수 합산 (보너스 포함)
  - 점수 기반 순위 계산 (높은 점수 우선, 동점 시 마지막 제출 시간 오름차순)
- [ ] **보너스 점수 표시 강화**
  - 기본 점수 / 보너스 점수 / 총점 분리 표시
  - 편집 거리 정보 표시 (선택)

#### 1.2 실시간 업데이트 개선 (2일)
- [x] SSE 기반 제출 상태 업데이트
- [ ] **보너스 재계산 후 스코어보드 자동 갱신**
  - 새 정답 제출 → 보너스 재계산 → 모든 사용자 점수 업데이트 → SSE 알림
- [ ] 스코어보드 폴링 간격 최적화

#### 1.3 스코어보드 API 확장 (2일)
- [ ] `/api/contests/[id]/scoreboard` API 개선
  - ANIGMA 점수 계산 로직 적용
  - 최고 점수 제출 필터링
  - 보너스 점수 정보 포함
- [ ] 프리징 로직 검증 및 개선

---

### Phase 2: Spotboard ANIGMA 지원 (4일)

#### 2.1 Spotboard 로직 확장
- [x] Spotboard 기본 구현 (ICPC 스타일)
- [ ] **ANIGMA 문제 타입 지원 추가**
  - Run에 점수 정보 추가
  - 점수 변화 애니메이션 (점수 증가 시 하이라이트)
  - 순위 변동 애니메이션
- [ ] **보너스 점수 실시간 반영**
  - 새 제출로 인한 보너스 재계산 시 해당 사용자들 점수 업데이트 애니메이션

#### 2.2 Spotboard UI 개선
- [ ] ANIGMA 문제 셀 디자인 (점수 표시)
- [ ] 점수 증가/감소 시각 효과
- [ ] 보너스 점수 별도 표시 (툴팁 또는 배지)

---

### Phase 3: 대회 관리 UI 개선 (3일)

#### 3.1 ANIGMA 문제 설정 UI
- [ ] 관리자 페이지: ANIGMA 문제 생성 폼 개선
  - `max_score` 설정 (대회용 50, 비대회용 70)
  - 코드 A (reference_code_path) 업로드
  - 코드 B (solution_code_path) 업로드
- [ ] 대회-문제 매핑 시 ANIGMA 문제 표시 강화

#### 3.2 대회 모니터링 대시보드
- [ ] 실시간 제출 현황 (ANIGMA Task1/Task2 구분)
- [ ] 보너스 점수 재계산 로그
- [ ] 편집 거리 분포 그래프 (선택)

---

### Phase 4: 대회 전용 계정 관리 강화 (2일)

#### 4.1 대회 전용 계정 생성/관리
- [x] `contest_account_only`, `contest_id` 필드 추가
- [ ] **관리자 UI: 대회 전용 계정 일괄 생성**
  - CSV 업로드 (팀명, 비밀번호)
  - 자동으로 username 생성 (예: `team01`, `team02`)
  - 대회 자동 등록
- [ ] 대회 종료 후 계정 비활성화 기능

#### 4.2 대회 참가자 관리
- [ ] 대회 참가 신청 UI
- [ ] 관리자: 참가자 승인/거부
- [ ] 참가자 목록 조회

---

### Phase 5: 테스트 및 안정화 (3일)

#### 5.1 통합 테스트
- [ ] ANIGMA Task1/Task2 제출 → 채점 → 보너스 재계산 전체 플로우
- [ ] 동시 제출 시 보너스 재계산 정확성 검증
- [ ] 스코어보드 프리징 동작 확인

#### 5.2 성능 최적화
- [ ] 대규모 대회(100명+) 시 보너스 재계산 성능 개선
  - Debounce 또는 배치 처리
  - DB 인덱스 추가
- [ ] 스코어보드 쿼리 최적화

#### 5.3 UI/UX 개선
- [ ] 로딩 상태 표시
- [ ] 에러 메시지 개선
- [ ] 반응형 디자인 검증

---

## 4. Judge Worker 현황

### 4.1 이미 구현된 Job 타입 ✅

```rust
enum WorkerJob {
    Judge(JudgeJob),           // 일반 코드 제출 채점
    Validate(ValidateJob),     // 테스트케이스 검증
    Anigma(AnigmaJudgeJob),    // ANIGMA Task 2 (ZIP 제출)
    AnigmaTask1(AnigmaTask1JudgeJob), // ANIGMA Task 1 (input 제출)
    Playground(PlaygroundJob), // 플레이그라운드 실행
}
```

### 4.2 ANIGMA Task 1 채점 플로우 (이미 구현됨) ✅

```
1. Redis에서 AnigmaTask1 Job 수신
2. 사용자가 제출한 input 파일 다운로드
3. 코드 A (reference_code_path) 다운로드 → 압축 해제 → make build
4. 코드 B (solution_code_path) 다운로드 → 압축 해제 → make build
5. input 파일로 A와 B 각각 실행 (make run INPUT=input.bin)
6. A와 B의 stdout 비교
   - 다르면 → verdict: 'accepted', score: 30
   - 같으면 → verdict: 'wrong_answer', score: 0
7. 결과 Redis에 저장 및 publish
```

**파일**: `judge/src/anigma.rs::process_anigma_task1_job`

### 4.3 ANIGMA Task 2 채점 플로우 (이미 구현됨) ✅

```
1. Redis에서 Anigma Job 수신
2. 사용자가 제출한 ZIP 파일 다운로드 → 압축 해제
3. Makefile 존재 확인
4. make build 실행 (컴파일)
5. 각 테스트케이스 실행 (make run INPUT=input.txt)
6. 결과 분석:
   - 모두 통과 → verdict: 'accepted', score: max_score (50 또는 70)
   - 일부 통과 → verdict: 'partial', score: 0
   - 실패 → score: 0
7. 편집 거리 계산 (제출 코드 vs reference_code)
8. 결과 Redis에 저장 및 publish (ANIGMA 채널)
```

**파일**: `judge/src/anigma.rs::process_anigma_job`

### 4.4 보너스 점수 재계산 플로우 (이미 구현됨) ✅

```
1. Redis subscriber가 ANIGMA 채점 결과 수신
2. verdict='accepted' && edit_distance != null 확인
3. contest_id가 있는지 확인
4. recalculateContestBonus(contestId, problemId) 호출
   - 해당 대회/문제의 모든 정답 제출 조회
   - R_max, R_min 계산
   - 각 제출의 보너스 점수 재계산
   - DB 업데이트 (score = baseScore + bonus)
5. 결과 SSE 알림
```

**파일**: 
- `web/src/lib/redis-subscriber.ts::handleMessage`
- `web/src/lib/anigma-bonus.ts::recalculateContestBonus`

---

## 5. API 엔드포인트 현황

### 5.1 이미 구현된 API ✅

**대회 API**
```
GET    /api/contests                 # 대회 목록 ✅
GET    /api/contests/[id]            # 대회 상세 ✅
POST   /api/contests/[id]/register   # 사용자 등록 ✅
GET    /api/contests/[id]/problems   # 대회 문제 목록 ✅
GET    /api/contests/[id]/scoreboard # 스코어보드 ✅ (개선 필요)
```

**ANIGMA 제출 API**
```
POST   /actions/anigma-submissions/submitAnigmaTask1  # Task 1 제출 ✅
POST   /actions/anigma-submissions/submitAnigmaCode   # Task 2 제출 ✅
GET    /api/submissions/[id]                          # 제출 상태 조회 ✅
```

### 5.2 추가/개선 필요한 API

**스코어보드 API 개선**
```
GET    /api/contests/[id]/scoreboard # ANIGMA 로직 강화 필요
  - 최고 점수 제출만 반영
  - 보너스 점수 정보 포함
  - 프리징 로직 검증
```

**실시간 업데이트** (선택)
```
GET    /api/contests/[id]/scoreboard/stream  # SSE 기반 실시간 스코어보드
```

**대회 관리 API**
```
POST   /api/admin/contests/[id]/accounts     # 대회 전용 계정 일괄 생성
POST   /api/admin/contests/[id]/freeze       # 스코어보드 프리징 수동 토글
GET    /api/admin/contests/[id]/stats        # 대회 통계
```

---

## 6. UI 컴포넌트 현황

### 6.1 이미 존재하는 페이지 ✅

```
/app/
├── contests/
│   ├── page.tsx                    # 대회 목록 ✅
│   └── [id]/
│       ├── page.tsx                # 대회 메인 ✅
│       ├── problems/[label]/page.tsx  # 문제 상세 ✅
│       └── scoreboard/page.tsx     # 스코어보드 ✅ (개선 필요)
├── problems/
│   └── [id]/
│       ├── page.tsx                # 문제 상세 ✅
│       └── submit-section.tsx      # ANIGMA Task1/Task2 제출 UI ✅
└── admin/
    └── contests/
        ├── page.tsx                # 대회 관리 목록 ✅
        └── [id]/page.tsx           # 대회 수정 ✅
```

### 6.2 이미 존재하는 컴포넌트 ✅

```
/components/
├── contests/
│   ├── spotboard.tsx               # Spotboard UI ✅ (ANIGMA 지원 추가 필요)
│   └── (기타 대회 관련 컴포넌트)
├── problems/
│   └── (문제 관련 컴포넌트)
└── submissions/
    └── (제출 관련 컴포넌트)
```

### 6.3 추가/개선 필요한 컴포넌트

**ANIGMA 스코어보드 컴포넌트 개선**
```
/components/contests/
├── anigma-scoreboard.tsx           # ANIGMA 전용 스코어보드 (신규)
├── score-breakdown.tsx             # 점수 상세 표시 (Task1 + Task2 + Bonus)
└── spotboard.tsx                   # ANIGMA 문제 타입 지원 추가
```

**대회 관리 컴포넌트**
```
/components/admin/contests/
├── contest-accounts-manager.tsx    # 대회 전용 계정 일괄 생성 (신규)
├── anigma-problem-form.tsx         # ANIGMA 문제 설정 폼 (신규)
└── contest-monitor.tsx             # 실시간 모니터링 (신규)
```

---

## 7. 외부 의존성 현황

### 7.1 이미 추가된 패키지 ✅

**NPM 패키지**
```json
{
  "dependencies": {
    "@monaco-editor/react": "^4.6",    // 코드 에디터 ✅
    "jszip": "^3.10",                   // ZIP 처리 ✅
    "react-resizable-panels": "^2.0"   // 레이아웃 ✅
  }
}
```

**Rust Crates**
```toml
[dependencies]
zip = "2.1"                # ZIP 압축 해제 ✅
strsim = "0.11"            // Levenshtein 거리 계산 ✅
```

### 7.2 추가 검토 필요한 패키지

**NPM (선택)**
```json
{
  "dependencies": {
    "papaparse": "^5.x"     // CSV 파싱 (대회 계정 일괄 생성)
  }
}
```

---

## 8. 인프라 고려사항

### 8.1 스케일링

- **Judge Worker**: 동시 제출량에 따라 2~5개 인스턴스 권장
- **Redis**: 대회 중 부하 증가, 메모리 충분히 확보
- **PostgreSQL**: 인덱스 최적화 필요
  ```sql
  CREATE INDEX idx_submissions_contest_user_problem 
  ON submissions(contest_id, user_id, problem_id, score DESC);
  
  CREATE INDEX idx_submissions_anigma_bonus 
  ON submissions(contest_id, problem_id, verdict, edit_distance) 
  WHERE verdict = 'accepted' AND edit_distance IS NOT NULL;
  ```

### 8.2 보너스 재계산 성능

**현재 구현**: 정답 제출 시마다 모든 정답자의 보너스 재계산
- 소규모 대회(~100명): 문제없음
- 대규모 대회(100명+): 성능 개선 필요
  - Debounce (5초 내 재계산 요청은 1회만 실행)
  - 배치 처리 (N개 제출마다 재계산)
  - 백그라운드 작업 큐 사용

### 8.3 보안

- 대회 중 AI 서비스 차단 (네트워크 레벨, 선택)
- Rate limiting (사용자당 분당 제출 수 제한)
- 대회 전용 계정 비밀번호 강제 변경 (선택)

### 8.4 백업

- 대회 시작 전 DB 스냅샷
- 대회 중 실시간 백업 (WAL 아카이빙)
- 제출 데이터(ZIP 파일) MinIO 백업

---

## 9. 위험 요소 및 대응

| 위험 요소 | 영향도 | 현황 | 대응 방안 |
|----------|--------|------|----------|
| 보너스 재계산 성능 병목 | 중간 | 구현됨 | 대규모 대회 시 debounce/배치 처리 추가 |
| 동시 제출 시 스코어보드 갱신 지연 | 중간 | SSE 있음 | 보너스 재계산 후 SSE 알림 추가 |
| ANIGMA 스코어보드 로직 복잡도 | 중간 | 기본만 구현 | 최고 점수 필터링 로직 추가 |
| 대회 전용 계정 관리 복잡도 | 낮음 | 필드 있음 | 일괄 생성 UI 추가 |

---

## 10. 우선순위 요약

### ✅ 이미 완료된 핵심 기능
- [x] ANIGMA Task 1/Task 2 채점
- [x] 편집 거리 계산 및 저장
- [x] 보너스 점수 재계산 로직
- [x] Redis subscriber 자동 트리거
- [x] 대회 기본 시스템 (테이블, 참가 등록)
- [x] 기본 스코어보드
- [x] Spotboard UI

### 🔥 즉시 구현 필요 (Phase 1)
- [ ] ANIGMA 전용 스코어보드 로직 (최고 점수만 반영)
- [ ] 보너스 점수 표시 강화 (기본/보너스/총점 분리)
- [ ] 보너스 재계산 후 스코어보드 자동 갱신

### 📊 중요 (Phase 2)
- [ ] Spotboard ANIGMA 지원 (점수 변화 애니메이션)
- [ ] 대회 전용 계정 일괄 생성 UI

### 🎨 개선 (Phase 3~4)
- [ ] ANIGMA 문제 설정 UI 개선
- [ ] 대회 모니터링 대시보드
- [ ] 성능 최적화 (대규모 대회)

---

## 11. 결론

**현재 상태**:
- ✅ ANIGMA 채점 시스템 **완전 구현됨**
- ✅ 대회 기본 구조 **완전 구현됨**
- ✅ 팀 기능 **불필요** (대회 전용 계정 공유 방식 채택)
- ⚠️ 스코어보드 로직 **ANIGMA 특화 강화 필요**

**남은 작업**: 주로 **스코어보드 로직 개선** 및 **UI/UX 강화**

**예상 개발 공수**: 2~3주 (1인 기준)
- Phase 1 (스코어보드): 1주
- Phase 2 (Spotboard): 4일
- Phase 3~5 (나머지): 1주

---

*마지막 업데이트: 2025-12-26*
