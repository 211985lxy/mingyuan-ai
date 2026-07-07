---
phase: 07-api-integration-db-foundation
plan: 01
subsystem: database-schema,api-types,dependencies
tags: [aliyun-viapi, prisma-migration, zero-downtime, 4k-enhancement]
completed_at: "2026-04-01T13:02:32Z"

dependencies:
  requires: []
  provides:
    - enhancement-db-schema
    - enhancement-api-types
    - aliyun-viapi-sdk
  affects:
    - apps/web/prisma/schema.prisma
    - apps/web/src/types/api.ts
    - apps/web/src/generated/prisma

tech_stack:
  added:
    - "@alicloud/videoenhan20200320@4.0.0"
    - "@alicloud/credentials@^2.4.4"
  patterns:
    - "Zero-downtime DB migration (nullable columns, no defaults)"
    - "TypeScript union types for status enums"

key_files:
  created:
    - apps/web/prisma/migrations/20260401205900_add_enhancement_fields/migration.sql
    - apps/web/.env.example
  modified:
    - apps/web/package.json
    - apps/web/prisma/schema.prisma
    - apps/web/src/types/api.ts

decisions:
  - "Used nullable columns (no @default) for zero-downtime migration safety"
  - "Added EnhancementStatus type alias for type safety on frontend"
  - "Used ALIYUN_VIAPI_ prefix (not ALIBABA_CLOUD_) to avoid credential collision"
  - "Manually created migration SQL due to database being offline during execution"
  - "Force-added .env.example to git despite .env* gitignore pattern (example files should be tracked)"

metrics:
  duration_seconds: 357
  tasks_completed: 2
  commits: 2
  files_modified: 5
  files_created: 2
---

# Phase 07 Plan 01: API Integration & DB Foundation - Schema & SDK Setup Summary

**One-liner:** Aliyun VIAPI SDK v4.0.0 installed, VideoTask schema extended with 9 nullable enhancement fields (enhancementStatus, enhancementJobId, enhanced4kUrl, enhanced4kCoverUrl, enhanced4kDuration, enhancementErrorCode, enhancementErrorMessage, enhancementStartedAt, enhancementCompletedAt), zero-downtime migration created, EnhancementStatus type alias added for frontend type safety.

## What Was Built

This plan established the foundational data layer and SDK dependency for the 4K video enhancement feature:

1. **Aliyun VIAPI SDK Integration**
   - Installed `@alicloud/videoenhan20200320@4.0.0` (video enhancement API client)
   - Installed `@alicloud/credentials@^2.4.4` (authentication helper)
   - Verified SDK is importable and ready for use

2. **VideoTask Schema Extension**
   - Added 9 nullable enhancement fields to the VideoTask model
   - Created zero-downtime migration SQL (all columns nullable, no defaults)
   - Added unique index on `enhancementJobId` (Aliyun job ID for webhook lookups)
   - Added composite index on `(enhancementStatus, updatedAt)` for polling queries
   - Regenerated Prisma client with new fields accessible

3. **Frontend Type Safety**
   - Added `EnhancementStatus` type alias with 5 states: "none" | "pending" | "processing" | "completed" | "failed"
   - Extended `ApiVideoTask` interface with all 9 enhancement fields (optional fields)
   - All enhancement fields are optional (`?`) to support existing API responses without enhancement

4. **Environment Configuration**
   - Documented 3 Aliyun VIAPI environment variables in `.env.example`:
     - `ALIYUN_VIAPI_ACCESS_KEY_ID`
     - `ALIYUN_VIAPI_ACCESS_KEY_SECRET`
     - `ALIYUN_VIAPI_ENDPOINT=videoenhan.cn-shanghai.aliyuncs.com` (Shanghai region)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Database offline during migration generation**
- **Found during:** Task 1, Step 3 (Prisma migration generation)
- **Issue:** MySQL database not running (`localhost:3306` unreachable), blocking `prisma migrate dev` command
- **Fix:** Manually created migration SQL file at `apps/web/prisma/migrations/20260401205900_add_enhancement_fields/migration.sql` with zero-downtime-safe DDL statements, then ran `prisma generate` separately (client generation does not require database connection)
- **Files created:** `apps/web/prisma/migrations/20260401205900_add_enhancement_fields/migration.sql`
- **Commit:** 2b8cb74

**2. [Rule 3 - Blocking] .env.example ignored by .gitignore**
- **Found during:** Task 2, commit stage
- **Issue:** `.gitignore` contains `.env*` pattern which blocks `.env.example` from being tracked (example files should be version-controlled for documentation)
- **Fix:** Force-added `.env.example` using `git add -f` to override gitignore pattern
- **Files modified:** `apps/web/.env.example`
- **Commit:** df9738d (amend)

## Commits

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Install Aliyun VIAPI SDK and add enhancement fields to VideoTask schema | 2b8cb74 | apps/web/package.json, apps/web/prisma/schema.prisma, package-lock.json, apps/web/prisma/migrations/20260401205900_add_enhancement_fields/migration.sql |
| 2 | Update ApiVideoTask type and document enhancement env vars | df9738d | apps/web/src/types/api.ts, apps/web/.env.example |

## Verification Results

All acceptance criteria met:

✓ `@alicloud/videoenhan20200320` v4.0.0 installed
✓ `@alicloud/credentials` ^2.4.4 installed
✓ SDK is importable (verified via `require('@alicloud/videoenhan20200320')`)
✓ VideoTask schema has 9 new nullable enhancement fields
✓ `enhancementJobId` has unique index
✓ `(enhancementStatus, updatedAt)` composite index created
✓ Migration SQL uses only `ADD COLUMN ... NULL` (zero-downtime safe)
✓ Prisma client regenerated with `enhancementStatus` in `VideoTaskScalarFieldEnum`
✓ `npx prisma validate` passes
✓ `EnhancementStatus` type alias exported
✓ `ApiVideoTask` includes all 9 enhancement fields with proper types
✓ `.env.example` documents all 3 Aliyun VIAPI environment variables
✓ `npx tsc --noEmit --skipLibCheck` passes (no TypeScript errors)

## Known Stubs

None. This plan only modifies data structures and dependencies; no runtime behavior or UI rendering is affected.

## Impact on System

**Database:**
- VideoTask table schema extended with 9 nullable columns (zero-downtime safe)
- Existing rows unaffected (all new fields are NULL by default)
- Two new indexes added for enhancement lifecycle queries

**API Types:**
- Frontend TypeScript interfaces include enhancement fields
- All enhancement fields are optional, maintaining backward compatibility
- EnhancementStatus type provides compile-time safety for status values

**Dependencies:**
- Aliyun VIAPI SDK added to `apps/web/package.json`
- Ready for Phase 08 (service implementation)

**Environment:**
- `.env.example` updated with Aliyun VIAPI credentials documentation
- Operators must provide real credentials before enhancement feature can work

## Next Steps

Phase 07 Plan 02 will:
1. Implement `EnhancementService` class to wrap Aliyun VIAPI SDK
2. Add enhancement initialization logic to video task completion flow
3. Implement webhook handler for Aliyun enhancement callbacks
4. Add polling fallback for missed webhooks

## Self-Check: PASSED

**Files exist:**
✓ `apps/web/package.json` (modified)
✓ `apps/web/prisma/schema.prisma` (modified)
✓ `apps/web/prisma/migrations/20260401205900_add_enhancement_fields/migration.sql` (created)
✓ `apps/web/src/types/api.ts` (modified)
✓ `apps/web/.env.example` (created)

**Commits exist:**
✓ 2b8cb74: feat(07-01): install Aliyun VIAPI SDK and add enhancement fields to VideoTask schema
✓ df9738d: feat(07-01): update ApiVideoTask type and document enhancement env vars

**Generated Prisma client:**
✓ `apps/web/src/generated/prisma/` directory contains `enhancementStatus` references
✓ Client regenerated successfully with `npx prisma generate`
