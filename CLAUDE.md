# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ANA Online Judge (AOJ) — an online judge system for in-school programming contests. Monorepo with two main components:

- **`web/`** — Next.js 16 web application (App Router, React 19, TypeScript, Tailwind CSS 4)
- **`judge/`** — Rust async judge worker (Tokio) that executes and evaluates submissions in an isolate sandbox

Infrastructure: PostgreSQL 18 (Drizzle ORM), Redis 7 (job queue + pub/sub), MinIO (S3-compatible object storage), Docker Compose.

## Common Commands

### Development Setup
```bash
cp web/.env.example web/.env && cp judge/.env.example judge/.env
make dev-up              # Start all services (postgres, redis, minio, judge) via Docker Compose
make dev-db-migrate      # Run database migrations
cd web && pnpm install && pnpm dev   # Start web dev server
```

### Web (`web/`)
```bash
pnpm dev                 # Next.js dev server with hot reload
pnpm build               # Production build
pnpm lint                # Biome check
pnpm lint:fix            # Biome fix (run after every code change)
pnpm db:generate         # Generate Drizzle migrations from schema changes
pnpm db:migrate          # Apply migrations
pnpm db:studio           # Open Drizzle Studio
```

### Judge (`judge/`)
```bash
cargo build --release    # Production build
cargo fmt                # Format (run after every code change)
cargo check              # Type check (run after every code change)
```

### Docker / Make
```bash
make dev-up              # Full rebuild all services
make dev-up-q            # Quick rebuild (judge only, uses cache)
make dev-judge-build     # Build judge image only
make dev-down            # Stop all services
make dev-reset           # Full reset (destroys volumes, rebuilds, re-migrates)
make prod-up             # Production deployment
make prod-down           # Stop production services
make prod-db-migrate     # Production migrations (runs in separate migrate container)
```

## Validation Requirements

- **Web**: Always run `cd web && pnpm lint:fix` after changes
- **Judge**: Always run `cd judge && cargo fmt && cargo check` after changes
- Husky pre-commit hook runs these automatically on staged files
- Husky pre-push hook runs `cargo check` and `pnpm build`

## Architecture

### System Flow
```
Browser → Next.js (server actions/API routes)
  ├→ PostgreSQL (Drizzle ORM — queries, sessions, user data)
  ├→ MinIO (file storage — testcases, code, checker scripts)
  └→ Redis (enqueue judge job)
        └→ Judge Worker (dequeue via BLPOP)
             ├→ MinIO (fetch testcases/source)
             ├→ Isolate sandbox (execute code in cgroups v2)
             └→ Redis (store result with 1h TTL, publish to channel → web SSE)
```

### Web Architecture
- **Server Components** for data fetching and page rendering
- **Service Layer** (`web/src/lib/services/`) — pure business logic functions (no auth, no revalidation) extracted from server actions. Both server actions and REST API routes call these shared functions to avoid code duplication.
  - `problems.ts`, `users.ts`, `testcases.ts`, `judge-tools.ts` — core admin CRUD
  - `contests.ts`, `contest-participants.ts`, `contest-problems.ts` — contest management
  - `settings.ts`, `files.ts` — site settings and file management
  - `api-auth.ts` — API key authentication for REST endpoints
- **Server Actions** (`web/src/actions/`) — thin wrappers that add auth (`requireAdmin()`) + cache revalidation (`revalidatePath()`) around `lib/services/` functions. Use `Parameters<typeof libFn>` to sync parameter types with the service layer.
  - `actions/submissions/` — submit code, query submission results
  - `actions/contests/` — CRUD contests, manage participants and problems
  - `actions/scoreboard/` — scoreboard calculation and spotboard data
  - `actions/admin/` — admin problem/testcase/user management, judge tools
  - Root-level: `problems.ts`, `users.ts`, `settings.ts`, `playground.ts`, `upload.ts`, `files.ts`
- **REST API** (`web/src/app/api/v1/admin/`) — API key-authenticated endpoints for CLI access, also calling `lib/admin/` functions
- **API Routes** (`web/src/app/api/`) for file uploads/downloads, auth callbacks, SSE streaming, playground execution
- **Database schema** defined in `web/src/db/schema.ts` (single file, all tables)
- **Auth**: NextAuth v5 with credentials (bcrypt) and Google OAuth (`web/src/auth.ts`)
- **UI**: shadcn/ui components with Radix primitives, Monaco editor for code input

### UI 작업 (필수)

**UI 페이지나 컴포넌트를 작성·수정하기 전에 반드시:**

1. `.claude/design-system.md`를 처음부터 끝까지 읽는다. 색상 토큰·shadow·radius·금지 패턴 + 페이지 레이아웃 패턴(목록/상세/생성/편집)이 모두 거기 있다.
2. 작업 도메인에서 가장 가까운 **기존 페이지**를 read한다 (예: 새 목록 페이지 → `web/src/app/practices/page.tsx`). 그 페이지의 wrapper, spacing, typography를 그대로 mimic한다 — 즉흥적 새 패턴 만들지 말 것.
3. 공용 컴포넌트(`PageBreadcrumb`, `PaginationLinks`, `ProblemListTable`, `ProblemTitleCell`, `ProblemPickerDialog` 등)를 우선 재사용한다. 자체 테이블/다이얼로그 자체 구현 금지.
4. 색상은 시맨틱 토큰만(`--primary`, `--accent`, `--muted-foreground`, `--verdict-*`). `bg-emerald-*`, `bg-blue-*` 같은 raw Tailwind 팔레트는 verdict 외 사용 금지.
5. 작업 후 `.claude/design-system.md`의 "작업 완료 후 검증" grep 명령을 실행해 토큰/레이아웃 위반 0 hit 확인.

> 이 절차를 건너뛰면 자주 일관성 위반이 누적되어 사후 리팩토링 비용이 커진다.

### Layer Rules

- **Components (pages, layouts, server/client components) MUST NOT import `@/db`
  or call `@/lib/services/*` functions directly.** All data fetching goes through
  server actions in `actions/<domain>/queries.ts` (or `actions/<domain>.ts` for
  small domains). Type-only imports (`import type { ... }`) are allowed.
- **Server actions SHOULD call `@/lib/services/*`** for shared business logic.
  Direct `db` access in actions is permitted as a transitional pattern; new code
  should prefer services.
- **`app/api/**` routes** may call services directly — they are REST/SSE entry
  points equivalent to server actions in their layer position.

### Database Tables (Drizzle)
`users`, `siteSettings`, `problems`, `testcases`, `submissions`, `submissionResults`, `contests`, `contestProblems`, `contestParticipants`, `playgroundSessions`, `playgroundFiles`, `languages`

### Judge Architecture
- **Entry point**: `judge/src/main.rs` — infinite loop pulling jobs from Redis (BLPOP)
- **Job types** (`judge/src/jobs/`):
  - `judger.rs` — Standard judge (ICPC stdout comparison or Special Judge with testlib.h checker)
  - `validator.rs` — Testcase input validation using testlib.h validators
  - `anigma.rs` — Anigma Task 1 (differentiating input finder) and Task 2 (ZIP submission with edit distance scoring)
  - `playground/mod.rs` — Arbitrary code execution (single file or Makefile-based projects)
  - `language_install.rs` — `install_language` / `uninstall_language` jobs (toolchains under `/opt/aoj-langs`)
- **Engine** (`judge/src/engine/`): compiler (sandboxed + trusted), sandbox (isolate), executer
- **Core** (`judge/src/core/`): language registry (loaded from the Redis `judge:languages` snapshot published by web), verdict enum, utilities
- **Components** (`judge/src/components/`): checker (testlib.h exit code mapping)
- **Sandbox**: Uses IOI `isolate` with cgroups v2; judge runs in privileged Docker container
- **Infra** (`judge/src/infra/`): Redis job queue management (10 workers max, distributed leasing), MinIO S3 client

### Supported Languages
언어는 `languages` 테이블에서 관리하며 `/admin/languages` 또는 `aoj languages …`로 추가·수정한다. 이미지 내장은 C, C++, Python, Rust, Text. 나머지(Java, Go, JavaScript, C#, PyPy 시드 + 관리자가 추가한 언어)는 설치 스크립트가 `/opt/aoj-langs`(named volume `aoj-langs`)에 설치한다. web이 `judge:languages` 스냅샷(+ `judge:languages:scripts` 해시)을 Redis에 발행하고 judge가 부팅 시 읽고 `judge:languages:changed`로 갱신한다. 설치는 `install_language` 잡(`judge/src/jobs/language_install.rs`)이며, 부팅 시 `.installed` 마커가 스냅샷의 `install_hash`와 다르면 자동 재설치(self-heal)한다.

- 명령 플레이스홀더: `{prefix}` → `/opt/aoj-langs/<id>/current`, `{heap_mb}`, `{include_flags}`
- 시간/메모리 제한 = `ceil(base × multiplier) + bonus` (언어별 `time_multiplier`/`time_bonus_ms`/`memory_multiplier`/`memory_bonus_mb`)
- 시드 초기값: `web/src/db/seed/languages-seed.ts` (= `web/drizzle/0058_dynamic_languages.sql`의 INSERT)

### Problem Types
- **ICPC**: Standard stdin/stdout comparison
- **Special Judge**: Custom checker binary (testlib.h, `components/checker.rs`)
- **Anigma**: Two tasks — Task 1 finds differentiating inputs, Task 2 scores ZIP submissions via edit distance

### Contest System
- ICPC-style scoring with penalty, or Spotboard algorithm (`scoreboardTypeEnum`: basic, spotboard)
- Configurable scoreboard freeze before contest end
- Explicit participant registration; contest-only accounts supported
- Award ceremony / spotboard animation display

### Playground
- Code playground with session management (UUID-based sessions, file tree)
- Supports single-file execution and Makefile-based projects
- Languages: 확장자로 활성 언어 스냅샷에서 결정 (`file_extension`)

## App Routes

| Route | Purpose |
|-------|---------|
| `/` | Home page |
| `/login`, `/register` | Authentication |
| `/problems`, `/problems/[id]` | Problem listing and detail |
| `/submissions`, `/submissions/[id]` | Submission listing and detail |
| `/contests/[id]` | Contest page (problems, scoreboard, my-submissions) |
| `/anigma` | Anigma problem page |
| `/playground/[sessionId]` | Code playground |
| `/admin/*` | Admin dashboard (problems, contests, users, files, settings) |

## Code Style

- **Web**: Biome formatter — tabs, double quotes, semicolons, trailing commas (es5), line width 100
- **Judge**: `cargo fmt` defaults
- Split files >300 lines; split functions >50 lines
- Prevent race conditions in async code; optimize unnecessary re-renders and API calls

## Key Files

| File | Purpose |
|------|---------|
| `web/src/db/schema.ts` | All database table/enum definitions |
| `web/src/auth.ts` | NextAuth configuration |
| `web/src/lib/services/` | Shared service layer — pure business logic (auth-free, revalidation-free) |
| `web/src/actions/` | Server actions — thin wrappers around lib/services/ with auth + revalidation |
| `web/src/lib/judge-queue.ts` | Redis judge job queue management |
| `web/src/lib/storage/` | MinIO/S3 client and operations |
| `web/src/lib/spotboard/` | Spotboard algorithm implementation |
| `web/biome.json` | Biome linter/formatter configuration |
| `judge/src/main.rs` | Judge worker entry point and job dispatch loop |
| `judge/src/jobs/` | Job handlers (judger, validator, anigma, playground) |
| `web/src/lib/services/languages.ts` | Language CRUD, install requests, Redis snapshot publishing |
| `docker-compose.yml` | Service definitions (postgres, redis, minio, judge, web, migrate) |
| `docker-compose.prod.yml` | Production overrides (port exposure removal) |
| `Makefile` | Dev/prod orchestration commands |
