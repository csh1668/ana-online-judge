# AOJ ANIGMA 대회 지원 개발 계획

> **Status**: In Progress  
> **Last Updated**: 2025-12-26  
> **Target**: ANIGMA 대회 완벽 지원  
> **Related Documents**: PLAN2.md, PLAN3.md

---

## 📊 현재 구현 상황 요약

### ✅ 완료된 핵심 기능

#### 1. ANIGMA 채점 시스템 (100% 완료)
- ✅ **Task 1 (Differential Testing)**: input 파일 제출, A와 B 코드 출력 비교 (30점)
- ✅ **Task 2 (ZIP 제출)**: 다중 파일 컴파일, Makefile 기반 빌드, 테스트케이스 채점 (50/70점)
- ✅ **편집 거리 계산**: Levenshtein 알고리즘으로 제출 코드와 원본 코드 차이 측정
- ✅ **보너스 점수 시스템**: 대회 제출 시 편집 거리 기반 동적 보너스 점수 (최대 20점)
- ✅ **실시간 재계산**: 새 정답 제출 시 모든 참가자 보너스 자동 재계산

**핵심 파일**:
- `judge/src/anigma.rs` - Task 1/Task 2 채점 로직
- `web/src/lib/anigma-bonus.ts` - 보너스 점수 계산
- `web/src/lib/redis-subscriber.ts` - 자동 트리거
- `web/src/actions/anigma-submissions.ts` - 제출 API

#### 2. 대회 시스템 기본 (80% 완료)
- ✅ 대회 테이블 (contests, contest_problems, contest_participants)
- ✅ 대회 전용 계정 (contest_account_only, contest_id 필드)
- ✅ 사용자 단위 참가 (팀 기능 제거)
- ✅ 기본 스코어보드 (ICPC 스타일)
- ✅ Spotboard UI (ICPC 스타일, 프리징 지원)
- ⚠️ **ANIGMA 전용 스코어보드 로직 부족** (개선 필요)

**핵심 파일**:
- `web/src/db/schema.ts` - DB 스키마
- `web/src/actions/scoreboard.ts` - 스코어보드 로직
- `web/src/components/contests/spotboard.tsx` - Spotboard UI
- `web/src/lib/spotboard/contest.ts` - 순위 계산 로직

#### 3. 인프라 & 기타 (100% 완료)
- ✅ Multi-language 지원 (C, C++, Python, Java, Rust, Go, JS)
- ✅ Special Judge / Validator
- ✅ 샌드박스 환경 (Linux isolate)
- ✅ Redis 큐 기반 워커
- ✅ SSE 기반 실시간 제출 상태 업데이트
- ✅ MinIO 파일 스토리지

---

## 🎯 남은 작업 (우선순위별)

### 🔥 긴급 (Phase 1): ANIGMA 스코어보드 강화 - 1주

**목표**: ANIGMA 문제 타입에 최적화된 스코어보드 로직 구현

#### 1.1 스코어보드 계산 로직 개선 ✅ 완료!

**수정 완료 (2025-12-26)**:
- ✅ `getScoreboard` 함수: 같은 점수일 때 먼저 제출한 것 우선 로직 명시화
- ✅ `recalculateContestBonus` 함수: **사용자당 최고 점수 제출만** 보너스 계산
  - 최고 점수 → 짧은 편집 거리 → 빠른 제출 순으로 선택
  - Task 2 (ZIP 제출)만 보너스 계산 대상
  - 로그 추가로 디버깅 용이

**수정된 파일**:
- ✅ `web/src/actions/scoreboard.ts`
- ✅ `web/src/lib/anigma-bonus.ts`

**남은 작업 항목**:
```typescript
// web/src/actions/scoreboard.ts

// ✅ ANIGMA 최고 점수 추적 (동점 시 먼저 제출한 것 우선)
if (problemType === "anigma") {
  const currentScore = submission.score ?? 0;
  if (
    !problemEntry.score ||
    currentScore > problemEntry.score ||
    (currentScore === problemEntry.score && !problemEntry.solvedTime)
  ) {
    problemEntry.score = currentScore;
    problemEntry.solvedTime = Math.floor(
      (submissionTime.getTime() - new Date(contest.startTime).getTime()) / 60000
    );
  }
}
```

```typescript
// web/src/lib/anigma-bonus.ts

// ✅ 사용자당 최고 점수 제출만 선택
const bestSubmissionsByUser = new Map();
for (const sub of allAcceptedSubmissions) {
  const existing = bestSubmissionsByUser.get(sub.userId);
  if (!existing || 
      sub.score! > existing.score! ||
      (sub.score === existing.score && sub.editDistance! < existing.editDistance!) ||
      (sub.score === existing.score && sub.editDistance === existing.editDistance && sub.createdAt < existing.createdAt)
  ) {
    bestSubmissionsByUser.set(sub.userId, sub);
  }
}
```

**다음 작업**:
- [ ] 점수 상세 정보 표시 UI (Task1 + Task2 + Bonus 분리)
- [ ] 편집 거리 정보 표시

#### 1.2 스코어보드 UI 개선 (2일)

**작업 항목**:
```tsx
// web/src/components/contests/anigma-scoreboard.tsx (신규)

- [ ] ANIGMA 전용 스코어보드 컴포넌트 생성
- [ ] 점수 상세 표시 (Task1 + Task2 + Bonus)
- [ ] 편집 거리 표시 (툴팁 또는 별도 컬럼)
- [ ] 보너스 점수 하이라이트
```

**예시 UI**:
```
┌─────┬──────────┬────────┬────────┬───────┬────────┬────────┬───────────┐
│ 순위 │ 참가자   │ Task1  │ Task2  │ 보너스 │ 총점   │ 편집거리│ 최종 제출 │
├─────┼──────────┼────────┼────────┼───────┼────────┼────────┼───────────┤
│  1  │ team01   │   30   │   50   │  20   │  100   │  120   │ 14:23:45  │
│  2  │ team02   │   30   │   50   │  15   │   95   │  200   │ 14:25:10  │
│  3  │ team03   │    0   │   50   │  18   │   68   │  150   │ 14:20:30  │
└─────┴──────────┴────────┴────────┴───────┴────────┴────────┴───────────┘
```

**파일 생성/수정**:
- `web/src/components/contests/anigma-scoreboard.tsx` (신규)
- `web/src/components/contests/score-breakdown.tsx` (신규)
- `web/src/app/contests/[id]/scoreboard/page.tsx` (ANIGMA 타입 분기)

#### 1.3 실시간 업데이트 개선 (2일)

**현재 상황**: 보너스 재계산은 되지만 스코어보드 자동 갱신 없음

**작업 항목**:
```typescript
// web/src/lib/redis-subscriber.ts

- [ ] 보너스 재계산 완료 후 SSE 이벤트 발송
- [ ] 영향받는 모든 사용자에게 알림
- [ ] 스코어보드 페이지에서 실시간 갱신
```

**예상 코드 추가**:
```typescript
// redis-subscriber.ts
if (submission?.contestId) {
  await recalculateContestBonus(submission.contestId, submission.problemId);
  
  // 보너스 재계산 후 스코어보드 업데이트 알림
  await notifyScoreboardUpdate(submission.contestId);
}

// sse-manager.ts (신규 함수)
export async function notifyScoreboardUpdate(contestId: number) {
  // contestId를 구독 중인 모든 클라이언트에게 "scoreboard_update" 이벤트 전송
  const clients = getContestClients(contestId);
  for (const client of clients) {
    client.send({ type: "scoreboard_update", contestId });
  }
}
```

**파일 수정**:
- `web/src/lib/redis-subscriber.ts`
- `web/src/lib/sse-manager.ts`
- `web/src/app/contests/[id]/scoreboard/page.tsx` (SSE 구독)

---

### 📊 중요 (Phase 2): Spotboard ANIGMA 지원 - 4일

**목표**: Spotboard에 ANIGMA 문제 타입 점수 변화 애니메이션 추가

#### 2.1 Spotboard 로직 확장 (2일)

**현재 상황**: Spotboard는 ICPC 스타일 (AC/WA만 표시)

**작업 항목**:
```typescript
// web/src/lib/spotboard/types.ts

interface SpotboardRun {
  id: number;
  teamId: number;
  problemId: number;
  time: number;
  result: string;       // 'AC' | 'WA' | ...
  score?: number;       // ANIGMA: 점수 정보 추가
  prevScore?: number;   // ANIGMA: 이전 점수 (점수 증가 애니메이션용)
}

// web/src/lib/spotboard/contest.ts

- [ ] Run 클래스에 점수 필드 추가
- [ ] TeamStatus에 점수 누적 로직 추가
- [ ] ANIGMA 문제 점수 증가 시 애니메이션 트리거
```

**파일 수정**:
- `web/src/lib/spotboard/types.ts`
- `web/src/lib/spotboard/contest.ts`
- `web/src/actions/scoreboard.ts` (getSpotboardData에 score 포함)

#### 2.2 Spotboard UI 개선 (2일)

**작업 항목**:
```tsx
// web/src/components/contests/spotboard.tsx

- [ ] ANIGMA 문제 셀에 점수 표시
- [ ] 점수 증가 애니메이션 (숫자 카운트업)
- [ ] 보너스 점수 재계산 시 점수 변화 표시
- [ ] 순위 변동 애니메이션
```

**예시 UI**:
```
ICPC 문제:  [✓] AC  (초록색)
ANIGMA 문제: [95] 점  (점수에 따라 색상 변화)
              ↑ 
          90 → 95 (애니메이션)
```

**파일 수정**:
- `web/src/components/contests/spotboard.tsx`
- `web/src/components/contests/spotboard.css` (애니메이션 스타일)

---

### 🎨 개선 (Phase 3): 대회 관리 UI - 3일

**목표**: 관리자가 ANIGMA 대회를 쉽게 관리할 수 있도록 UI 개선

#### 3.1 ANIGMA 문제 설정 UI (2일)

**작업 항목**:
```tsx
// web/src/components/admin/problems/anigma-problem-form.tsx (신규)

- [ ] ANIGMA 문제 생성/수정 폼
- [ ] max_score 설정 (대회용 50, 비대회용 70)
- [ ] 코드 A (reference_code_path) ZIP 업로드
- [ ] 코드 B (solution_code_path) ZIP 업로드
- [ ] 입력 방식 선택 (stdin / args)
```

**파일 생성**:
- `web/src/components/admin/problems/anigma-problem-form.tsx`
- `web/src/app/admin/problems/new/page.tsx` (ANIGMA 타입 분기)
- `web/src/actions/admin-problems.ts` (ANIGMA 문제 생성 API)

#### 3.2 대회 전용 계정 일괄 생성 (1일)

**작업 항목**:
```tsx
// web/src/components/admin/contests/contest-accounts-manager.tsx (신규)

- [ ] CSV 업로드 UI (팀명, 비밀번호)
- [ ] 자동 username 생성 (team01, team02, ...)
- [ ] 대회 자동 등록
- [ ] 계정 목록 표시 및 다운로드
```

**CSV 형식**:
```csv
team_name,password
Alpha Team,alpha123!
Beta Team,beta456!
Gamma Team,gamma789!
```

**파일 생성**:
- `web/src/components/admin/contests/contest-accounts-manager.tsx`
- `web/src/actions/admin-contests.ts` (일괄 생성 API)
- `web/src/app/admin/contests/[id]/accounts/page.tsx`

---

### 🔧 선택 (Phase 4): 플레이그라운드 (대회 필수 아님) - 1~2주

**목표**: 대회 참가자를 위한 웹 기반 코드 테스트 환경

**현재 상황**:
- ✅ Judge Worker 플레이그라운드 로직 완료
- ✅ DB 스키마 완료
- ❌ 웹 API 미구현
- ❌ 프론트엔드 미구현

**작업 항목** (생략 가능):
- [ ] Playground API 구현 (`/actions/playground.ts`)
- [ ] 실행 API (`/api/playground/run`)
- [ ] IDE 레이아웃 (Monaco Editor, 파일 트리)
- [ ] 관리자 권한 관리 UI

**우선순위**: 낮음 (대회 운영에 필수 아님)

---

## 📅 개발 일정 (추천)

### Week 1: ANIGMA 스코어보드 강화
- Day 1-3: 스코어보드 계산 로직 개선
- Day 4-5: 스코어보드 UI 개선
- Day 6-7: 실시간 업데이트 개선 및 테스트

### Week 2: Spotboard & 관리 UI
- Day 1-2: Spotboard ANIGMA 지원
- Day 3-4: Spotboard UI 개선 및 애니메이션
- Day 5: ANIGMA 문제 설정 UI
- Day 6: 대회 전용 계정 일괄 생성
- Day 7: 통합 테스트 및 버그 수정

### Week 3: 안정화 (선택)
- 성능 최적화 (대규모 대회)
- 보너스 재계산 debounce
- DB 인덱스 최적화
- UI/UX 개선

---

## 🧪 테스트 계획

### 필수 테스트 항목

#### 1. ANIGMA 스코어보드
- [ ] 최고 점수만 반영되는지 확인
- [ ] Task1 + Task2 점수 합산 정확성
- [ ] 보너스 점수 표시 정확성
- [ ] 동점 시 순위 계산 (최종 제출 시간)

#### 2. 실시간 보너스 재계산
- [ ] 새 정답 제출 → 보너스 재계산 트리거
- [ ] 모든 참가자 점수 업데이트
- [ ] 스코어보드 자동 갱신
- [ ] 동시 제출 시 정확성

#### 3. Spotboard
- [ ] ANIGMA 점수 표시
- [ ] 점수 변화 애니메이션
- [ ] 순위 변동 애니메이션
- [ ] 프리징 동작

#### 4. 성능 테스트
- [ ] 100명 동시 제출
- [ ] 보너스 재계산 성능 (100명 대상)
- [ ] 스코어보드 로딩 시간

---

## 🚀 배포 체크리스트

### Phase 1 배포 전
- [ ] DB 마이그레이션 실행 (없음, 스키마 변경 없음)
- [ ] ANIGMA 스코어보드 로직 테스트
- [ ] 실시간 업데이트 동작 확인
- [ ] 기존 대회 데이터 영향 없음 확인

### Phase 2 배포 전
- [ ] Spotboard ANIGMA 모드 테스트
- [ ] 애니메이션 성능 확인
- [ ] 모바일 반응형 확인

### Phase 3 배포 전
- [ ] 대회 전용 계정 생성 테스트
- [ ] CSV 업로드 검증
- [ ] 권한 체크 확인

---

## 📝 추가 고려사항

### 1. 성능 최적화

**보너스 재계산 성능 개선** (대규모 대회 시):
```typescript
// web/src/lib/anigma-bonus.ts

// Debounce 추가 (5초 내 재계산 요청은 1회만)
const recalculationQueue = new Map<string, NodeJS.Timeout>();

export async function recalculateContestBonus(contestId: number, problemId: number) {
  const key = `${contestId}-${problemId}`;
  
  if (recalculationQueue.has(key)) {
    clearTimeout(recalculationQueue.get(key)!);
  }
  
  const timeout = setTimeout(async () => {
    await doRecalculation(contestId, problemId);
    recalculationQueue.delete(key);
  }, 5000);
  
  recalculationQueue.set(key, timeout);
}
```

**DB 인덱스 추가**:
```sql
-- 스코어보드 쿼리 최적화
CREATE INDEX idx_submissions_contest_user_problem 
ON submissions(contest_id, user_id, problem_id, score DESC, created_at ASC);

-- 보너스 재계산 최적화
CREATE INDEX idx_submissions_anigma_bonus 
ON submissions(contest_id, problem_id, verdict, edit_distance) 
WHERE verdict = 'accepted' AND edit_distance IS NOT NULL;
```

### 2. 모니터링

**추가 권장 로그**:
```typescript
// 보너스 재계산 로그
console.log(`[Bonus] Recalculating for contest ${contestId}, problem ${problemId}`);
console.log(`[Bonus] Found ${acceptedSubmissions.length} accepted submissions`);
console.log(`[Bonus] R_min=${R_min}, R_max=${R_max}`);

// 스코어보드 조회 로그
console.log(`[Scoreboard] Loading for contest ${contestId}, participants: ${count}`);
```

### 3. 문서화

**필요한 문서**:
- [ ] ANIGMA 문제 출제 가이드 (관리자용)
- [ ] 대회 운영 매뉴얼
- [ ] 참가자 가이드 (Task 1/Task 2 설명)
- [ ] API 문서 업데이트

---

## 📞 지원 및 질문

문제 발생 시:
1. GitHub Issues 확인
2. 로그 확인 (`web/logs`, `judge/logs`)
3. DB 상태 확인 (`psql` 또는 관리자 도구)

---

*마지막 업데이트: 2025-12-26*
*다음 리뷰: Phase 1 완료 후*

