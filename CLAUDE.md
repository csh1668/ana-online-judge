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

### Database Tables (Drizzle)
`users`, `siteSettings`, `problems`, `testcases`, `submissions`, `submissionResults`, `contests`, `contestProblems`, `contestParticipants`, `playgroundSessions`, `playgroundFiles`

### Judge Architecture
- **Entry point**: `judge/src/main.rs` — infinite loop pulling jobs from Redis (BLPOP)
- **Job types** (`judge/src/jobs/`):
  - `judger.rs` — Standard judge (ICPC stdout comparison or Special Judge with testlib.h checker)
  - `validator.rs` — Testcase input validation using testlib.h validators
  - `anigma.rs` — Anigma Task 1 (differentiating input finder) and Task 2 (ZIP submission with edit distance scoring)
  - `playground/mod.rs` — Arbitrary code execution (single file or Makefile-based projects)
- **Engine** (`judge/src/engine/`): compiler (sandboxed + trusted), sandbox (isolate), executer
- **Core** (`judge/src/core/`): language registry, verdict enum, utilities
- **Components** (`judge/src/components/`): checker (testlib.h exit code mapping)
- **Sandbox**: Uses IOI `isolate` with cgroups v2; judge runs in privileged Docker container
- **Infra** (`judge/src/infra/`): Redis job queue management (10 workers max, distributed leasing), MinIO S3 client

### Supported Languages
| Language | Time Multiplier | Memory Multiplier |
|----------|----------------|-------------------|
| C, C++, Rust, Go | 1x | 1x |
| Java | 2x + 1s | 2x + 16MB |
| Python, JavaScript | 3x + 2s | 2x + 32MB |
| Text | 1x | 1x |

Config: `judge/files/languages.toml`

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
- Languages: C, C++, Python, Java, Rust, Go, JavaScript

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
| `judge/files/languages.toml` | Supported language configurations |
| `docker-compose.yml` | Service definitions (postgres, redis, minio, judge, web, migrate) |
| `docker-compose.prod.yml` | Production overrides (port exposure removal) |
| `Makefile` | Dev/prod orchestration commands |
