# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ANA Online Judge (AOJ) — an online judge system for in-school programming contests. Monorepo with two main components:

- **`web/`** — Next.js 16 web application (App Router, React 19, TypeScript, Tailwind CSS 4)
- **`judge/`** — Rust async judge worker (Tokio) that executes and evaluates submissions in an isolate sandbox

Infrastructure: PostgreSQL 18 (Drizzle ORM), Redis 7 (job queue), MinIO (S3-compatible object storage), Docker Compose.

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
make prod-db-migrate     # Production migrations
```

## Validation Requirements

- **Web**: Always run `cd web && pnpm lint:fix` after changes
- **Judge**: Always run `cd judge && cargo fmt && cargo check` after changes

## Architecture

### System Flow
```
Browser → Next.js (server actions/API routes)
  ├→ PostgreSQL (Drizzle ORM — queries, sessions, user data)
  ├→ MinIO (file storage — testcases, code, checker scripts)
  └→ Redis (enqueue judge job)
        └→ Judge Worker (dequeue)
             ├→ MinIO (fetch testcases/source)
             ├→ Isolate sandbox (execute code in cgroups v2)
             └→ Redis (store result → web polls for it)
```

### Web Architecture
- **Server Components** for data fetching and page rendering
- **Server Actions** (`web/src/actions/`) as the primary RPC pattern for mutations
- **API Routes** (`web/src/app/api/`) for file uploads, auth callbacks, real-time updates
- **Database schema** defined in `web/src/db/schema.ts` (single file, all tables)
- **Auth**: NextAuth v5 with credentials (bcrypt) and Google OAuth (`web/src/auth.ts`)
- **UI**: shadcn/ui components with Radix primitives, Monaco editor for code input

### Judge Architecture
- **Entry point**: `judge/src/main.rs` — infinite loop pulling jobs from Redis
- **Job types** (`judge/src/jobs/`): Judge, Validate, AnigmaTask1, AnigmaTask2, Playground
- **Engine** (`judge/src/engine/`): compiler, sandbox (isolate), executer
- **Sandbox**: Uses IOI `isolate` with cgroups v2; judge runs in privileged Docker container
- **Language config**: `judge/files/languages.toml` (C, C++, Python, Java with per-language time/memory multipliers)
- **Infra** (`judge/src/infra/`): Redis job queue management, MinIO S3 client

### Problem Types
- **ICPC**: Standard stdin/stdout comparison
- **Special Judge**: Custom checker binary (`components/checker.rs`)
- **Anigma**: ZIP submission with code comparison and edit distance scoring

### Contest System
- ICPC-style scoring with penalty, or Spotboard algorithm
- Configurable scoreboard freeze before contest end
- Explicit participant registration

## Code Style

- **Web**: Biome formatter — tabs, double quotes, semicolons, trailing commas (es5), line width 100
- **Judge**: `cargo fmt` defaults
- Split files >300 lines; split functions >50 lines
- Prevent race conditions in async code; optimize unnecessary re-renders and API calls
d
## Key Files

| File | Purpose |
|------|---------|
| `web/src/db/schema.ts` | All database table/enum definitions |
| `web/src/auth.ts` | NextAuth configuration |
| `web/src/actions/` | Server actions (submissions, problems, contests, etc.) |
| `judge/src/main.rs` | Judge worker entry point and job dispatch loop |
| `judge/files/languages.toml` | Supported language configurations |
| `docker-compose.yml` | Service definitions (postgres, redis, minio, judge) |
| `Makefile` | Dev/prod orchestration commands |
