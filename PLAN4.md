 web/src 리팩토링 계획

 Context

 프로젝트 가이드라인(CLAUDE.md, DEVELOPMENT_GUIDE.md)에 따라 파일 300줄 초과 시 분리, 함수 50줄 초과 시 분리, 중복 코드 제거를 적용한다. 현재 actions 4개
 파일(contests 697줄, scoreboard 600줄, admin 549줄, submissions 486줄)과 컴포넌트 2개(file-tree 934줄, spotboard 466줄), 페이지 1개(anigma 614줄)가 기준을
 초과한다. 또한 대회 검증 로직이 3곳에서 55줄씩 동일하게 반복되고, userId 파싱 패턴이 20회 이상 중복된다.

 ---
 Phase 0: 공유 유틸리티 추출 (다른 Phase의 선행 조건)

 0A. lib/auth-utils.ts에 세션 헬퍼 추가

 기존 requireAdmin() 옆에 추가:

 // 세션에서 userId를 안전하게 파싱 (null 허용)
 export function parseSessionUserId(session: { user?: { id?: string } } | null): number | null {
   return session?.user?.id ? parseInt(session.user.id, 10) : null;
 }

 // 인증 필수 — userId 반환 (미인증 시 throw)
 export async function requireAuth() {
   const session = await auth();
   if (!session?.user?.id) throw new Error("로그인이 필요합니다");
   return { session, userId: parseInt(session.user.id, 10) };
 }

 // 세션 정보 일괄 조회 (non-throwing)
 export async function getSessionInfo() {
   const session = await auth();
   const userId = parseSessionUserId(session);
   const isAdmin = session?.user?.role === "admin";
   return { session, userId, isAdmin };
 }

 수정 대상: parseInt(session.user.id, 10) 패턴을 사용하는 모든 actions 및 API route 파일 (~20개소)

 0B. 대회 제출 검증 공통화 → lib/contest-validation.ts 신규

 submissions.ts:248-303과 anigma-submissions.ts:50-104, 172-227에 동일하게 반복되는 55줄 블록을 하나의 validateContestSubmission({ contestId, problemId, userId
 }) 함수로 추출.

 수정 대상:
 - actions/submissions.ts — lines 248-303 → validateContestSubmission() 호출로 교체
 - actions/anigma-submissions.ts — lines 50-104, 172-227 → 동일. 동시에 불필요한 await import("@/db/schema") 동적 임포트 제거 (static import로 전환)

 0C. Judge 큐 push 공통화 → lib/judge-queue.ts 신규

 submissions.ts:352-397의 private pushJudgeJob()을 독립 모듈로 추출. anigma-submissions.ts의 인라인 Redis push(lines 122-135, 258-279)도 이 모듈의 함수로 통합.

 ---
 Phase 1: 300줄 초과 actions 파일 분리

 각 파일을 도메인별로 디렉토리로 전환하고, index.ts에서 barrel re-export하여 기존 import 경로 (@/actions/contests 등) 호환성 유지.

 1A. actions/contests.ts (697줄) → actions/contests/
 새 파일: mutations.ts
 내용: createContest, updateContest, deleteContest, toggleFreezeState
 원본 위치: L18-166, L588-611
 ────────────────────────────────────────
 새 파일: queries.ts
 내용: getContests, getContestById + 관련 타입
 원본 위치: L168-307, L693-695
 ────────────────────────────────────────
 새 파일: problems.ts
 내용: addProblemToContest, removeProblemFromContest, reorderContestProblems
 원본 위치: L309-429
 ────────────────────────────────────────
 새 파일: participants.ts
 내용: registerForContest, unregisterFromContest, isUserRegistered, getContestParticipants, addParticipantToContest, removeParticipantFromContest, searchUsers +

   관련 타입
 원본 위치: L431-697
 ────────────────────────────────────────
 새 파일: index.ts
 내용: export * from "./mutations" 등 barrel
 원본 위치: -
 각 파일 상단에 "use server" 필수. 타입 export는 해당 함수가 정의된 파일에 위치.

 1B. actions/scoreboard.ts (600줄) → actions/scoreboard/
 ┌───────────────────┬────────────────────────────────────────────────────────────────────────────────────────────────────────┐
 │      새 파일      │                                                  내용                                                  │
 ├───────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────┤
 │ spotboard-data.ts │ getSpotboardData (spotboard 형식 데이터 생성)                                                          │
 ├───────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────┤
 │ scoreboard.ts     │ ScoreboardEntry 인터페이스, getScoreboard, getAdminScoreboard, unfreezeScoreboard, getContestStandings │
 ├───────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────┤
 │ index.ts          │ barrel                                                                                                 │
 └───────────────────┴────────────────────────────────────────────────────────────────────────────────────────────────────────┘
 1C. actions/admin.ts (549줄) → actions/admin/
 ┌────────────────┬─────────────────────────────────────────────────────────────────────────────────────────────────────────┬───────────┐
 │    새 파일     │                                                  내용                                                   │ 원본 위치 │
 ├────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────┤
 │ problems.ts    │ getAdminProblems, createProblem, updateProblem, deleteProblem, getProblemForEdit + 타입                 │ L17-228   │
 ├────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────┤
 │ testcases.ts   │ getTestcases, createTestcase, deleteTestcase + 타입                                                     │ L230-266  │
 ├────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────┤
 │ users.ts       │ getAdminUsers, updateUserRole, togglePlaygroundAccess, deleteUser + 타입                                │ L268-343  │
 ├────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────┤
 │ judge-tools.ts │ uploadChecker, uploadValidator, validateTestcases, getValidationResult, refreshContestScoreboard + 타입 │ L345-549  │
 ├────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────┤
 │ index.ts       │ barrel                                                                                                  │ -         │
 └────────────────┴─────────────────────────────────────────────────────────────────────────────────────────────────────────┴───────────┘
 1D. actions/submissions.ts (486줄) → actions/submissions/
 ┌────────────┬──────────────────────────────────────────────────────────────────┬───────────────────┐
 │  새 파일   │                               내용                               │     원본 위치     │
 ├────────────┼──────────────────────────────────────────────────────────────────┼───────────────────┤
 │ queries.ts │ getSubmissions, getSubmissionById, getUserProblemStatuses + 타입 │ L17-212, L399-486 │
 ├────────────┼──────────────────────────────────────────────────────────────────┼───────────────────┤
 │ submit.ts  │ submitCode (Phase 0 추출 후 ~80줄로 축소)                        │ L214-350          │
 ├────────────┼──────────────────────────────────────────────────────────────────┼───────────────────┤
 │ index.ts   │ barrel                                                           │ -                 │
 └────────────┴──────────────────────────────────────────────────────────────────┴───────────────────┘
 1E. actions/anigma-submissions.ts 정리

 Phase 0에서 대회 검증 + judge queue push를 추출하면 ~200줄로 자연 축소. 추가 분리 불필요.

 ---
 Phase 2: 300줄 초과 컴포넌트/페이지 분리

 2A. components/playground/file-tree.tsx (934줄) → components/playground/file-tree/
 ┌───────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────┬───────────┐
 │    새 파일    │                                               내용                                                │ 예상 줄수 │
 ├───────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┼───────────┤
 │ types.ts      │ PlaygroundFile, FileTreeProps, Node, 다이얼로그 타입                                              │ ~25       │
 ├───────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┼───────────┤
 │ utils.ts      │ buildFileTree, flattenPaths, sortNodes, findNode, isZipFile, isBinaryExtension, getAllFolderPaths │ ~60       │
 ├───────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┼───────────┤
 │ file-node.tsx │ FileNode 컴포넌트 (폴더/파일 렌더링 + 컨텍스트 메뉴)                                              │ ~200      │
 ├───────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┼───────────┤
 │ dialogs.tsx   │ CreateItemDialog, RenameDialog, ExtractConflictDialog                                             │ ~115      │
 ├───────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┼───────────┤
 │ file-tree.tsx │ 메인 FileTree 컴포넌트 (상태 + 핸들러 + 조합)                                                     │ ~200      │
 ├───────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┼───────────┤
 │ index.ts      │ export { FileTree } from "./file-tree"                                                            │ -         │
 └───────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────┴───────────┘
 2B. components/contests/spotboard.tsx (466줄) → components/contests/spotboard/
 ┌───────────────┬──────────────────────────────────────────────┐
 │    새 파일    │                     내용                     │
 ├───────────────┼──────────────────────────────────────────────┤
 │ utils.ts      │ formatTime, hsvToRgb                         │
 ├───────────────┼──────────────────────────────────────────────┤
 │ team-row.tsx  │ TeamRow 컴포넌트 (팀 렌더링 로직)            │
 ├───────────────┼──────────────────────────────────────────────┤
 │ spotboard.tsx │ 메인 Spotboard 컴포넌트 (상태 + 시상식 로직) │
 ├───────────────┼──────────────────────────────────────────────┤
 │ index.ts      │ barrel                                       │
 └───────────────┴──────────────────────────────────────────────┘
 spotboard.css도 디렉토리 안으로 이동.

 2C. app/anigma/page.tsx (614줄) → 섹션별 분리
 ┌───────────────────────────────────┬──────────────────────┐
 │ 새 파일 (app/anigma/_components/) │         내용         │
 ├───────────────────────────────────┼──────────────────────┤
 │ hero-section.tsx                  │ 히어로 영역          │
 ├───────────────────────────────────┼──────────────────────┤
 │ task-sections.tsx                 │ Task 1 / Task 2 설명 │
 ├───────────────────────────────────┼──────────────────────┤
 │ scoring-section.tsx               │ 채점 시스템 설명     │
 ├───────────────────────────────────┼──────────────────────┤
 │ rules-section.tsx                 │ 규칙 섹션            │
 └───────────────────────────────────┴──────────────────────┘
 page.tsx는 ~30줄의 조합 컴포넌트로 축소.

 ---
 Phase 3: lib/storage.ts (359줄) 분리
 ┌────────────────────────┬───────────────────────────────────────────────────────────────────────────┐
 │ 새 파일 (lib/storage/) │                                   내용                                    │
 ├────────────────────────┼───────────────────────────────────────────────────────────────────────────┤
 │ client.ts              │ S3Client 인스턴스, BUCKET 상수, ensureBucket() — 내부 전용, barrel 미노출 │
 ├────────────────────────┼───────────────────────────────────────────────────────────────────────────┤
 │ operations.ts          │ uploadFile, downloadFile, deleteFile, uploadImage, listObjects 등         │
 ├────────────────────────┼───────────────────────────────────────────────────────────────────────────┤
 │ paths.ts               │ generate*Path 함수들, getImageUrl, getFileUrl, deleteAllProblemFiles 등   │
 ├────────────────────────┼───────────────────────────────────────────────────────────────────────────┤
 │ index.ts               │ operations + paths barrel re-export                                       │
 └────────────────────────┴───────────────────────────────────────────────────────────────────────────┘
 ---
 실행 순서 요약

 Phase 0 (공유 유틸) ─┬─ 0A: auth-utils 헬퍼 추가
                      ├─ 0B: contest-validation.ts 추출
                      └─ 0C: judge-queue.ts 추출
                           │
 Phase 1 (actions 분리) ─┬─ 1A: contests/ (0A 의존)
                         ├─ 1B: scoreboard/ (0A 의존)
                         ├─ 1C: admin/
                         ├─ 1D: submissions/ (0B, 0C 의존)
                         └─ 1E: anigma-submissions 정리 (0B, 0C 의존)
                           │
 Phase 2 (컴포넌트 분리) ─┬─ 2A: file-tree/
                          ├─ 2B: spotboard/
                          └─ 2C: anigma page
                           │
 Phase 3 (lib 분리) ──── storage/

 Phase 2, 3은 Phase 0-1과 독립적이므로 병렬 진행 가능.

 ---
 검증 방법

 각 Phase 완료 후:
 1. cd web && pnpm lint:fix — Biome 검증 통과 확인
 2. cd web && pnpm build — 빌드 성공 확인 (import 경로 호환성)
 3. barrel export를 통해 기존 @/actions/contests, @/lib/storage 등의 import 경로가 변경 없이 동작하는지 확인