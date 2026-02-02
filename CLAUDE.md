# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Smart Error Archiver V2 is a spaced repetition learning system built on the **B.E.R.R.S. Stack** (Bun, Elysia, React, Rust, Supabase). It combines an error question library with FSRS v5 memory scheduling for optimized learning.

## Development Commands

```bash
# Install dependencies (from root)
bun install

# Development servers (run from root)
bun run dev:server    # Elysia backend on port 3001
bun run dev:web       # Vite frontend on port 5173

# Or run individually
bun --cwd apps/server dev
bun --cwd apps/web dev

# Web app commands
bun --cwd apps/web build     # TypeScript check + Vite build
bun --cwd apps/web lint      # ESLint

# Generate Supabase types (requires project access)
bun --cwd packages/database run gen:types

# Build Rust packages
cd packages/fsrs-engine && cargo build --release    # FFI library for FSRS algorithm
cd packages/markdown-parser && wasm-pack build --target web --release  # WASM markdown parser
```

## Testing

```bash
# FSRS Engine tests (requires cargo build --release first)
bun --cwd packages/fsrs-engine test        # TypeScript FFI tests
cargo test --manifest-path packages/fsrs-engine/Cargo.toml  # Rust unit tests

# Run a single test file
bun test packages/fsrs-engine/ffi.test.ts
```

## Environment Setup

Create `.env` in `apps/server/` with:
```
SUPABASE_URL=http://localhost:54321  # or your Supabase project URL
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Bun automatically loads `.env` files. The server validates these on startup.

## Architecture

### Monorepo Structure (Bun Workspaces)

```
apps/
  server/     # Elysia.js API server (Bun runtime, port 3001)
  web/        # React + Vite frontend (port 5173)

packages/
  shared/          # Shared TypeScript types (UnifiedEvent, ViewResponse, etc.)
  database/        # Supabase generated types (database.types.ts)
  fsrs-engine/     # Rust FFI - FSRS v5 algorithm (rs-fsrs crate)
  markdown-parser/ # Rust WASM - Markdown with math support (KaTeX)
```

### Workspace Aliases (tsconfig.json paths)
- `@v2/shared` → `packages/shared/index.ts`
- `@v2/database` → `packages/database/database.types.ts`
- `@v2/fsrs` → `packages/fsrs-engine/ffi.ts`
- `@v2/server` → `apps/server/src/index.ts`

### Type-Safe API Communication
Frontend uses Elysia's Eden Treaty for end-to-end type safety. The `App` type is exported from the server and consumed by the web app, providing full type inference for API calls.

### Trust Boundary Model (Three-Layer Architecture)

| Layer | Technology | Role |
|-------|-----------|------|
| Frontend | React + Zustand + TanStack Query | UI, simple reads via user JWT |
| Backend | Elysia + Rust FFI | Orchestration, FSRS calculation, service_role access |
| Database | Supabase + RLS + RPC | Atomic writes, security enforcement |

**Key principle**: FSRS algorithm runs in Rust via Bun FFI on the backend. Frontend never computes scheduling directly.

### Data Model: Asset + Overlay

- **Asset Layer** (`error_questions`): Question content, supports fork/sync from public library
- **Overlay Layer** (`cards`): Per-user learning state (FSRS parameters: stability, difficulty, due)
- **Audit Layer** (`review_logs`): Every review with algo_version and config_id for reproducibility

### Realtime Sync (Supabase Realtime)

Three signal types via pulse tables:
- `cards_sync_pulse` - Learning progress sync
- `import_jobs_pulse` - Import job status
- `user_dashboard_pulse` - Dashboard aggregates (due_count, streak)

Frontend uses watermark-based deduplication with `(updatedAt, seq)` tuple comparison.

## Key Files

- `apps/server/src/index.ts` - Main Elysia API with all endpoints
- `apps/server/src/services/importService.ts` - CSV/batch import pipeline
- `apps/web/src/pages/ReviewSession.tsx` - Core review UI
- `packages/shared/index.ts` - Shared types (UnifiedEvent, RealtimeTopic, etc.)
- `packages/fsrs-engine/src/lib.rs` - FSRS algorithm FFI wrapper
- `packages/markdown-parser/src/lib.rs` - WASM markdown parser with math
- `supabase/schema_full.sql` - Complete database schema
- `supabase/config.toml` - Supabase local config

## Conventions

- API responses use camelCase, database columns use snake_case
- All workspace packages use `@v2/` namespace
- FSRS weights are content-addressed (SHA256 hash) in `fsrs_configs` table
- Soft delete pattern: `deleted_at` timestamp, never hard delete user data
- Review ratings: 1=Again, 2=Hard, 3=Good, 4=Easy
