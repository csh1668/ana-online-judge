# ANIGMA 대회 지원을 위한 AOJ 확장 계획

> **Status**: Planning Phase
> **Target**: ANIGMA 대회 (1개월 후 개최 예정)
> **Goal**: AOJ를 ANIGMA 대회의 공식 플랫폼으로 활용하기 위한 확장

---

## 1. 현재 AOJ 상태 분석

### 이미 갖춘 기능
- Multi-language 지원 (C, C++, Python, Java, Rust, Go, JS)
- Special Judge (testlib.h 기반 커스텀 채점기)
- Validator (테스트케이스 검증기)
- 격리된 샌드박스 환경 (Linux isolate + cgroups v2)
- 확장 가능한 워커 아키텍처 (Redis 큐 기반)
- 관리자 페이지 (문제/테스트케이스/사용자 관리)

### 부족한 기능 (ANIGMA 필수 요구사항)
| 요구사항 | 현재 상태 | 필요 작업 |
|---------|----------|----------|
| **팀 시스템** | 없음 | 팀 생성, 멤버 관리, 팀 단위 제출 |
| **대회(Contest) 시스템** | 없음 | 대회 생성, 시간 관리, 문제 할당 |
| **엣지케이스 제출** | 없음 | 입력만 제출하여 버그 유발 확인 |
| **패치 제출** | 없음 | 코드 수정본 제출, diff 비교, 바이트/라인 카운트 |
| **다중 점수 카테고리** | 없음 | 엣지케이스 점수 + 패치 품질 점수 |
| **실시간 스코어보드** | 없음 | WebSocket/SSE 기반 실시간 순위표 |
| **스코어보드 프리징** | 없음 | 대회 종료 N분 전 순위 고정 |

---

## 2. 데이터베이스 스키마 확장

### 2.1 팀 관련 테이블

```sql
-- 팀 테이블
teams:
  - id: uuid PRIMARY KEY
  - name: varchar(100) UNIQUE NOT NULL
  - created_at: timestamp
  - updated_at: timestamp

-- 팀 멤버 테이블
team_members:
  - id: uuid PRIMARY KEY
  - team_id: uuid REFERENCES teams(id)
  - user_id: uuid REFERENCES users(id)
  - role: enum('captain', 'member') DEFAULT 'member'
  - joined_at: timestamp
  - UNIQUE(team_id, user_id)
```

### 2.2 대회 관련 테이블

```sql
-- 대회 테이블
contests:
  - id: uuid PRIMARY KEY
  - name: varchar(200) NOT NULL
  - description: text
  - type: enum('anigma', 'icpc', 'ioi') DEFAULT 'anigma'
  - start_time: timestamp NOT NULL
  - end_time: timestamp NOT NULL
  - freeze_time: timestamp  -- 스코어보드 프리징 시점
  - status: enum('draft', 'registration', 'running', 'frozen', 'ended')
  - max_team_size: int DEFAULT 3
  - created_at: timestamp
  - updated_at: timestamp

-- 대회-문제 매핑
contest_problems:
  - id: uuid PRIMARY KEY
  - contest_id: uuid REFERENCES contests(id)
  - problem_id: uuid REFERENCES problems(id)
  - label: varchar(10)  -- 'A', 'B', 'C' 등
  - order_index: int
  - edge_case_score: int DEFAULT 0    -- 엣지케이스 배점
  - patch_score: int DEFAULT 0        -- 패치 배점
  - UNIQUE(contest_id, problem_id)

-- 대회 참가 팀
contest_teams:
  - id: uuid PRIMARY KEY
  - contest_id: uuid REFERENCES contests(id)
  - team_id: uuid REFERENCES teams(id)
  - registered_at: timestamp
  - UNIQUE(contest_id, team_id)
```

### 2.3 ANIGMA 전용 테이블

```sql
-- 엣지케이스 제출 (입력만 제출)
edge_case_submissions:
  - id: uuid PRIMARY KEY
  - contest_id: uuid REFERENCES contests(id)
  - problem_id: uuid REFERENCES problems(id)
  - team_id: uuid REFERENCES teams(id)
  - submitted_by: uuid REFERENCES users(id)
  - input_data: text NOT NULL         -- 제출한 입력
  - triggered_bug: boolean DEFAULT false
  - bug_type: enum('crash', 'wrong_answer', 'tle', 'mle', 'overflow', 'none')
  - score: int DEFAULT 0
  - created_at: timestamp

-- 패치 제출
patch_submissions:
  - id: uuid PRIMARY KEY
  - contest_id: uuid REFERENCES contests(id)
  - problem_id: uuid REFERENCES problems(id)
  - team_id: uuid REFERENCES teams(id)
  - submitted_by: uuid REFERENCES users(id)
  - patched_code: text NOT NULL       -- 수정된 전체 코드
  - diff_content: text                -- unified diff 형식
  - lines_changed: int DEFAULT 0      -- 변경된 라인 수
  - bytes_changed: int DEFAULT 0      -- 변경된 바이트 수
  - verdict: enum('pending', 'judging', 'accepted', 'wrong_answer', 'partial', ...)
  - tests_passed: int DEFAULT 0       -- 통과한 테스트 수
  - total_tests: int DEFAULT 0        -- 전체 테스트 수
  - score: int DEFAULT 0
  - created_at: timestamp

-- 대회 점수 집계
contest_scores:
  - id: uuid PRIMARY KEY
  - contest_id: uuid REFERENCES contests(id)
  - team_id: uuid REFERENCES teams(id)
  - problem_id: uuid REFERENCES problems(id)
  - edge_case_score: int DEFAULT 0
  - patch_score: int DEFAULT 0
  - total_score: int DEFAULT 0
  - last_submission_at: timestamp
  - updated_at: timestamp
  - UNIQUE(contest_id, team_id, problem_id)
```

### 2.4 problems 테이블 확장

```sql
-- 기존 problems 테이블에 추가할 컬럼
ALTER TABLE problems ADD COLUMN:
  - reference_code: text              -- ANIGMA용 "버그 있는 원본 코드"
  - reference_language: varchar(20)   -- 원본 코드의 언어
  - known_bugs: jsonb                 -- 버그 정보 (채점용, 비공개)
  - patch_zone_start: int             -- 수정 가능 영역 시작 라인
  - patch_zone_end: int               -- 수정 가능 영역 끝 라인
```

---

## 3. 개발 우선순위 (4주 기준)

### Week 1: 기반 시스템

#### 1.1 팀 시스템 구현 (필수, 3일)
- [ ] `teams`, `team_members` 테이블 생성 (Drizzle 마이그레이션)
- [ ] 팀 생성 API (`/actions/teams.ts`)
- [ ] 팀원 초대/참가 기능
- [ ] 팀 관리 UI (`/app/teams/`)
- [ ] 3인 제한 검증 로직

#### 1.2 대회 시스템 기초 (필수, 4일)
- [ ] `contests`, `contest_problems`, `contest_teams` 테이블 생성
- [ ] 대회 CRUD API (`/actions/contests.ts`)
- [ ] 대회 생성/수정 관리자 UI
- [ ] 팀 등록 기능
- [ ] 대회 상태 자동 전환 (스케줄러 또는 cron)

---

### Week 2: ANIGMA 핵심 기능

#### 2.1 엣지케이스 제출 시스템 (필수, 3일)
- [ ] `edge_case_submissions` 테이블 생성
- [ ] 엣지케이스 제출 API
- [ ] Judge Worker 확장: 입력 → 레퍼런스 코드 실행 → 버그 유발 확인
- [ ] 버그 타입 분류 로직 (crash, WA, TLE, MLE, overflow)
- [ ] 엣지케이스 제출 UI

#### 2.2 패치 제출 시스템 (필수, 4일)
- [ ] `patch_submissions` 테이블 생성
- [ ] 패치 제출 API (원본 코드 + 수정 코드)
- [ ] Diff 계산 로직 (unified diff 형식)
- [ ] 라인/바이트 변경량 계산
- [ ] 패치 영역 제한 검증 (patch_zone_start ~ patch_zone_end)
- [ ] Judge Worker 확장: 패치된 코드 → 전체 테스트케이스 실행
- [ ] 패치 제출 UI (Monaco Editor + diff viewer)

---

### Week 3: 점수 및 스코어보드

#### 3.1 점수 계산 시스템 (필수, 2일)
- [ ] `contest_scores` 테이블 생성
- [ ] 엣지케이스 점수 계산 로직
  - 버그 유발 성공: 기본 점수
  - 버그 타입별 가중치 (crash > WA > TLE)
  - 최초 발견 보너스
- [ ] 패치 점수 계산 로직
  - 전체 테스트 통과: 기본 점수
  - 수정량 보너스 (적을수록 높은 점수)
  - 부분 점수 (일부 테스트만 통과)

#### 3.2 실시간 스코어보드 (필수, 3일)
- [ ] WebSocket 또는 SSE 서버 구현
- [ ] 스코어보드 API (`/api/contest/[id]/scoreboard`)
- [ ] 실시간 순위 계산 로직
- [ ] 스코어보드 UI 컴포넌트
- [ ] 프리징 기능 (freeze_time 이후 순위 고정)

#### 3.3 대회 대시보드 (필수, 2일)
- [ ] 참가 팀 대시보드 (`/contest/[id]/dashboard`)
  - 문제 목록 및 현재 점수
  - 제출 내역
  - 팀원 활동 현황
- [ ] 관리자 모니터링 대시보드
  - 실시간 제출 현황
  - 이상 탐지 (동일 패턴 제출 등)

---

### Week 4: 안정화 및 테스트

#### 4.1 통합 테스트 (필수, 2일)
- [ ] 전체 플로우 테스트 (팀 등록 → 대회 참가 → 제출 → 채점 → 순위)
- [ ] 부하 테스트 (동시 제출 처리)
- [ ] 에러 핸들링 및 예외 처리

#### 4.2 UI/UX 개선 (필수, 2일)
- [ ] 대회 페이지 반응형 디자인
- [ ] 제출 상태 실시간 업데이트
- [ ] 에러 메시지 개선

#### 4.3 운영 도구 (권장, 3일)
- [ ] 대회 복제 기능
- [ ] 벌크 팀 등록 (CSV 업로드)
- [ ] 대회 통계 리포트 생성
- [ ] 로그 및 감사 기록

---

## 4. Judge Worker 확장

### 4.1 새로운 Job 타입

```rust
enum JobType {
    // 기존
    Solution,       // 일반 코드 제출 채점
    Validate,       // 테스트케이스 검증

    // ANIGMA 추가
    EdgeCase,       // 엣지케이스 제출 채점
    Patch,          // 패치 제출 채점
}
```

### 4.2 EdgeCase 채점 플로우

```
1. Redis에서 EdgeCase Job 수신
2. 문제의 reference_code (버그 있는 코드) 로드
3. 참가자가 제출한 input으로 실행
4. 결과 분석:
   - Runtime Error → bug_type: 'crash', 점수 부여
   - Wrong Answer → bug_type: 'wrong_answer', 점수 부여
   - TLE → bug_type: 'tle', 점수 부여
   - 정상 동작 → bug_type: 'none', 점수 0
5. 결과 DB 저장 및 점수 집계
```

### 4.3 Patch 채점 플로우

```
1. Redis에서 Patch Job 수신
2. 원본 코드와 제출된 패치 코드 비교
3. Diff 계산 및 수정량 측정
4. 패치 영역 제한 검증 (허용된 라인만 수정했는지)
5. 컴파일 및 전체 테스트케이스 실행
6. 결과:
   - 전체 통과 → verdict: 'accepted', 수정량 기반 점수
   - 일부 통과 → verdict: 'partial', 부분 점수
   - 실패 → verdict: 'wrong_answer'
7. 결과 DB 저장 및 점수 집계
```

---

## 5. API 엔드포인트 추가

### 5.1 팀 API

```
POST   /api/teams                    # 팀 생성
GET    /api/teams                    # 내 팀 목록
GET    /api/teams/[id]               # 팀 상세
POST   /api/teams/[id]/members       # 팀원 추가
DELETE /api/teams/[id]/members/[uid] # 팀원 제거
```

### 5.2 대회 API

```
GET    /api/contests                 # 대회 목록
GET    /api/contests/[id]            # 대회 상세
POST   /api/contests/[id]/register   # 팀 등록
GET    /api/contests/[id]/problems   # 대회 문제 목록
GET    /api/contests/[id]/scoreboard # 스코어보드
WS     /api/contests/[id]/live       # 실시간 업데이트 (WebSocket)
```

### 5.3 ANIGMA 제출 API

```
POST   /api/contests/[id]/edge-case  # 엣지케이스 제출
GET    /api/edge-case/[id]/status    # 엣지케이스 채점 상태
POST   /api/contests/[id]/patch      # 패치 제출
GET    /api/patch/[id]/status        # 패치 채점 상태
GET    /api/patch/[id]/diff          # 패치 diff 조회
```

---

## 6. UI 컴포넌트 추가

### 6.1 대회 관련 페이지

```
/app/
├── contests/
│   ├── page.tsx                    # 대회 목록
│   └── [id]/
│       ├── page.tsx                # 대회 메인 (문제 목록)
│       ├── problems/[label]/
│       │   └── page.tsx            # 문제 상세
│       ├── scoreboard/
│       │   └── page.tsx            # 스코어보드
│       └── submissions/
│           └── page.tsx            # 내 팀 제출 내역
├── teams/
│   ├── page.tsx                    # 팀 목록/생성
│   └── [id]/
│       └── page.tsx                # 팀 상세/관리
└── admin/
    └── contests/
        ├── page.tsx                # 대회 관리 목록
        ├── new/
        │   └── page.tsx            # 대회 생성
        └── [id]/
            ├── page.tsx            # 대회 수정
            └── monitor/
                └── page.tsx        # 실시간 모니터링
```

### 6.2 ANIGMA 전용 컴포넌트

```
/components/
├── anigma/
│   ├── edge-case-form.tsx          # 엣지케이스 입력 폼
│   ├── patch-editor.tsx            # 패치 코드 에디터
│   ├── diff-viewer.tsx             # Diff 시각화
│   ├── bug-type-badge.tsx          # 버그 타입 표시
│   └── score-breakdown.tsx         # 점수 상세 표시
├── contest/
│   ├── scoreboard.tsx              # 실시간 스코어보드
│   ├── countdown-timer.tsx         # 대회 남은 시간
│   ├── problem-card.tsx            # 문제 카드
│   └── team-status.tsx             # 팀 현황 표시
```

---

## 7. 외부 의존성 추가

### 7.1 NPM 패키지

```json
{
  "dependencies": {
    "diff": "^5.x",           // diff 계산
    "socket.io": "^4.x",      // 실시간 통신 (옵션)
    "ws": "^8.x",             // WebSocket (대안)
    "croner": "^8.x"          // 스케줄링 (대회 상태 전환)
  }
}
```

### 7.2 Rust Crates (Judge)

```toml
[dependencies]
similar = "2.x"      # Diff 계산
```

---

## 8. 인프라 고려사항

### 8.1 스케일링

- **Judge Worker**: 동시 제출량에 따라 2~5개 인스턴스 권장
- **Redis**: 대회 중 부하 증가, 메모리 충분히 확보
- **PostgreSQL**: 인덱스 최적화 필요 (contest_id, team_id 복합 인덱스)

### 8.2 보안

- 대회 중 AI 서비스 차단 (네트워크 레벨)
- 제출 코드 유사도 검사 (선택)
- Rate limiting (팀당 분당 제출 수 제한)

### 8.3 백업

- 대회 시작 전 DB 스냅샷
- 대회 중 실시간 백업 (WAL 아카이빙)
- 제출 데이터 별도 백업

---

## 9. 위험 요소 및 대응

| 위험 요소 | 영향도 | 대응 방안 |
|----------|--------|----------|
| 개발 일정 부족 | 높음 | 핵심 기능 우선, UI 최소화 |
| Judge Worker 불안정 | 높음 | 충분한 테스트, 폴백 메커니즘 |
| 실시간 기능 지연 | 중간 | 폴링 방식 대안 준비 |
| 동시 제출 병목 | 중간 | 워커 스케일 아웃, 큐 모니터링 |
| 부정행위 탐지 실패 | 중간 | 수동 검토 프로세스 준비 |

---

## 10. 최소 구현 범위 (MVP)

**1개월 내 반드시 완료해야 할 항목:**

### 필수 (Must Have)
- [ ] 팀 생성 및 관리
- [ ] 대회 생성 및 시간 관리
- [ ] 팀-대회 등록
- [ ] 엣지케이스 제출 및 채점
- [ ] 패치 제출 및 채점
- [ ] 기본 스코어보드 (폴링 방식도 가능)
- [ ] 점수 계산 및 순위 표시

### 권장 (Should Have)
- [ ] 실시간 스코어보드 (WebSocket)
- [ ] 스코어보드 프리징
- [ ] Diff 시각화
- [ ] 관리자 모니터링 대시보드

### 선택 (Nice to Have)
- [ ] 부정행위 탐지
- [ ] 대회 통계 리포트
- [ ] 팀 초대 링크
- [ ] 알림 시스템

---

## 11. 결론

AOJ는 현재 **개인 알고리즘 대회** 플랫폼으로 설계되어 있으며, ANIGMA 대회를 지원하려면 다음이 필요합니다:

1. **팀 시스템** - 완전히 새로 구현
2. **대회 시스템** - 완전히 새로 구현
3. **엣지케이스/패치 제출** - Judge Worker 확장
4. **실시간 스코어보드** - WebSocket 또는 폴링

**예상 개발 공수**: 4주 (1인 풀타임 기준)
**권장 인원**: 2~3인 (웹 1명, Judge 1명, 통합 1명)

---

## 12. 즉시 시작해야 할 작업

1. **DB 마이그레이션 파일 작성** - teams, contests 관련 테이블
2. **Judge Worker JobType 확장** - EdgeCase, Patch 타입 추가
3. **대회 상태 관리 로직** - 시간 기반 상태 전환
4. **기본 UI 스캐폴딩** - /contests, /teams 라우트 생성

---

*마지막 업데이트: 2025-12-03*
