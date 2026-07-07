---
phase: 02-infrastructure-prerequisites
plan: "02"
subsystem: packaging-material-suggestions
tags: [cache, schema-versioning, pexels, pixabay, prisma, migration]
dependency_graph:
  requires: [INFRA-01]
  provides: [cache-schema-versioning, cache-invalidation-on-scoring-deploy]
  affects: [packaging-material-suggestions, pexels, pixabay, PexelsQueryCache]
tech_stack:
  added: []
  patterns: [schema-version-in-hash, cache-bust-via-constant]
key_files:
  created:
    - apps/web/prisma/migrations/20260325120000_add_schema_version_to_query_cache/migration.sql
    - apps/web/__tests__/e2e/cache-schema-version.test.ts
  modified:
    - apps/web/prisma/schema.prisma
    - apps/web/src/lib/pexels.ts
    - apps/web/src/lib/pixabay.ts
    - apps/web/src/app/api/packaging-material-suggestions/route.ts
decisions:
  - schemaVersion is baked into the hash rather than added to the cache lookup where clause — old entries become dead rows instead of causing conflicts
  - schemaVersion param is optional with default 1 in computeQueryHash — callers outside route.ts are not forced to change
  - Migration created manually due to shadow database permission constraints in dev environment
metrics:
  duration: "8 minutes"
  completed: "2026-03-25"
  tasks_completed: 3
  files_modified: 6
requirements_fulfilled: [INFRA-02]
---

# Phase 02 Plan 02: Cache Schema Versioning Summary

**One-liner:** PexelsQueryCache gains a schemaVersion field baked into the query hash, so incrementing CACHE_SCHEMA_VERSION from 1 to 2 at Phase 3 deploy will auto-invalidate all pre-scoring cache entries without any WHERE clause changes.

## Objective

Add schema versioning to the PexelsQueryCache layer so that when Phase 3 deploys relevance scoring, the cache can be force-invalidated by incrementing a single constant, rather than flushing the table manually or silently serving pre-scoring results.

## Tasks Completed

### Task 1: Add schemaVersion to PexelsQueryCache and create migration (commit: 233cd81)

Added `schemaVersion Int @default(1)` field to the `PexelsQueryCache` model in schema.prisma after the `color` field. Created migration SQL at `apps/web/prisma/migrations/20260325120000_add_schema_version_to_query_cache/migration.sql` that runs `ALTER TABLE PexelsQueryCache ADD COLUMN schemaVersion INT NOT NULL DEFAULT 1`. Regenerated the Prisma client.

**Key design detail:** Existing rows get backfilled to 1 by the DEFAULT value. The migration was created manually because the dev database user lacks CREATE DATABASE privilege needed for the Prisma shadow database.

### Task 2: Add CACHE_SCHEMA_VERSION and schemaVersion to all cache sites (commit: 8773483)

Four coordinated changes across three files:

- **route.ts:** Added `CACHE_SCHEMA_VERSION = 1` constant with JSDoc comment explaining version history (v1 pre-scoring, v2 reserved for Phase 3). Total of 7 occurrences (1 definition + 6 usages).
- **pexels.ts `computeQueryHash`:** Added optional `schemaVersion?: number` param. Appended `String(params.schemaVersion ?? 1)` to the hash array. Default 1 preserves backward compatibility for any callers outside route.ts.
- **pixabay.ts `computeQueryHash`:** Same change as pexels.ts.
- **route.ts — 3 hash call sites:** All three (loadPhotosForQuery, loadPixabayImagesForQuery, loadVideosForQuery) now pass `schemaVersion: CACHE_SCHEMA_VERSION`.
- **route.ts — 3 cache write sites:** All three `pexelsQueryCache.upsert` create blocks now include `schemaVersion: CACHE_SCHEMA_VERSION`.

TypeScript compilation: zero errors.

### Task 3: Add test verifying schemaVersion cache invalidation behavior (commit: 72eaefb)

Created `apps/web/__tests__/e2e/cache-schema-version.test.ts` with 6 tests:

- **Pexels computeQueryHash (2):** v1 != v2 hash for same query; omitted version equals explicit version 1
- **Pixabay computeQueryHash (2):** v1 != v2 hash for same query; omitted version equals explicit version 1
- **Static analysis (2):** route.ts defines `CACHE_SCHEMA_VERSION = 1`; route.ts has >= 6 `schemaVersion: CACHE_SCHEMA_VERSION` occurrences

All 6 tests pass. Zero mocks — compliant with Zero Mock Rule.

## Verification Results

- `npx prisma validate` → valid
- `npx tsc --noEmit` (from apps/web) → zero errors
- All 6 vitest tests pass
- `grep -c "CACHE_SCHEMA_VERSION" route.ts` → 7
- `grep -c "schemaVersion: CACHE_SCHEMA_VERSION" route.ts` → 6
- `grep -n "schemaVersion" pexels.ts` → 2 matches (param definition + hash array)
- `grep -n "schemaVersion" pixabay.ts` → 2 matches (param definition + hash array)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Manual migration creation due to shadow database permissions**
- **Found during:** Task 1
- **Issue:** `npx prisma migrate dev --create-only` failed with P3014 — dev DB user lacks CREATE DATABASE permission for shadow database
- **Fix:** Created migration directory and SQL file manually following existing naming convention (`20260325120000_add_schema_version_to_query_cache/migration.sql`)
- **Files modified:** `apps/web/prisma/migrations/20260325120000_add_schema_version_to_query_cache/migration.sql`
- **Impact:** None — same SQL output, functionally identical

## Known Stubs

None — all changes are real implementation, no stubs introduced.

## Self-Check: PASSED

- File `apps/web/prisma/schema.prisma` contains `schemaVersion Int @default(1)` in PexelsQueryCache model
- File `apps/web/prisma/migrations/20260325120000_add_schema_version_to_query_cache/migration.sql` exists
- File `apps/web/src/lib/pexels.ts` contains `schemaVersion` in computeQueryHash
- File `apps/web/src/lib/pixabay.ts` contains `schemaVersion` in computeQueryHash
- File `apps/web/src/app/api/packaging-material-suggestions/route.ts` contains `CACHE_SCHEMA_VERSION` (7 occurrences)
- File `apps/web/__tests__/e2e/cache-schema-version.test.ts` exists
- Commit 233cd81 exists (Task 1)
- Commit 8773483 exists (Task 2)
- Commit 72eaefb exists (Task 3)
