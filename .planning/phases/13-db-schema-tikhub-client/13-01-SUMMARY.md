---
phase: 13
plan: 01
subsystem: database
tags: [prisma, schema, migration, mysql, competitor-analysis]
dependency_graph:
  requires: []
  provides: [CompetitorAnalysis-table, prisma-competitorAnalysis-delegate]
  affects: [phase-14-data-acquisition, phase-15-pipeline, phase-16-frontend]
tech_stack:
  added: []
  patterns: [prisma-model, prisma-migrate, mysql-json-columns, composite-index]
key_files:
  created:
    - apps/web/prisma/migrations/20260405000001_add_competitor_analysis/migration.sql
  modified:
    - apps/web/prisma/schema.prisma
decisions:
  - "Used prisma migrate resolve --applied to baseline all 14 existing migrations before deploying new migration (Docker MySQL container had schema but no _prisma_migrations history)"
  - "Generated Prisma client is gitignored (correct — built at container startup)"
metrics:
  duration: "13 minutes"
  completed_date: "2026-04-05"
  tasks_completed: 2
  files_modified: 2
---

# Phase 13 Plan 01: CompetitorAnalysis DB Schema Summary

**One-liner:** Added CompetitorAnalysis Prisma model (22 fields, 2 indexes) to schema.prisma, created migration SQL, applied to live DB, and regenerated Prisma client with typed competitorAnalysis delegate.

## What Was Built

Added the `CompetitorAnalysis` table as the foundational data layer for the v5.0 competitor analysis feature. All downstream phases (Data Acquisition, Analysis Pipeline, Report Frontend) depend on this table.

## Exact Model Fields Added

| Field | Type | Constraints | Purpose |
|-------|------|-------------|---------|
| id | String | @id @default(cuid()) | Primary key |
| userId | String | FK → User | Owner reference |
| targetUrl | VarChar(500) | NOT NULL | Input competitor URL |
| platform | VarChar(20) | NOT NULL | douyin/xiaohongshu/bilibili/kuaishou |
| platformUserId | VarChar(200) | nullable | sec_user_id/user_id/uid |
| status | VarChar(20) | DEFAULT 'pending' | Pipeline state |
| currentStep | VarChar(20) | nullable | Current pipeline step |
| errorMessage | Text | nullable | Error details |
| rawAccountData | Json | nullable | Platform account info |
| rawVideoData | Json | nullable | Video list + stats |
| rawCommentData | Json | nullable | Comment samples |
| metricsData | Json | nullable | Quantitative metrics |
| analysisResult | Json | nullable | 6-dimension report JSON |
| overallScore | Int | nullable | Overall score 0-100 |
| accountName | VarChar(100) | nullable | Cached display name |
| accountAvatar | VarChar(500) | nullable | Cached avatar URL |
| followerCount | Int | nullable | Cached follower count |
| videoCount | Int | nullable | Cached video count |
| createdAt | DateTime | DEFAULT now() | Creation timestamp |
| updatedAt | DateTime | @updatedAt | Last update timestamp |
| completedAt | DateTime | nullable | Completion timestamp |
| apiCostUsd | Float | DEFAULT 0 | Cost tracking |

**Indexes:**
- `@@index([userId, createdAt(sort: Desc)])` — for user's analysis history ordered by newest
- `@@index([userId, platform])` — for filtering by platform per user

## Migration File

**Path:** `apps/web/prisma/migrations/20260405000001_add_competitor_analysis/migration.sql`
**Migration name:** `20260405000001_add_competitor_analysis`
**Status:** Applied ✓ (confirmed via `_prisma_migrations` table and `DESCRIBE CompetitorAnalysis`)

## DESCRIBE Output Confirmation

All 22 columns confirmed in live DB via `DESCRIBE CompetitorAnalysis`:
id, userId, targetUrl, platform, platformUserId, status, currentStep, errorMessage, rawAccountData, rawVideoData, rawCommentData, metricsData, analysisResult, overallScore, accountName, accountAvatar, followerCount, videoCount, createdAt, updatedAt, completedAt, apiCostUsd

## Prisma Client

- `prisma.competitorAnalysis` delegate available with full CRUD methods (findMany, create, update, delete, etc.)
- User model has `competitorAnalyses CompetitorAnalysis[]` back-relation
- Generated client path: `apps/web/src/generated/prisma` (gitignored, regenerated at build time)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Baselining migration history for restored Docker DB container**
- **Found during:** Task 2 — `prisma migrate deploy` failed with P3005 (non-empty DB schema, no migration history)
- **Issue:** The local Docker MySQL container (`clipflow-mysql`) had all 14 previous migrations already applied to the schema but was missing the `_prisma_migrations` history table (container was restored from a snapshot/backup)
- **Fix:** Used `npx prisma migrate resolve --applied <migration_name>` to baseline all 14 existing migrations, then ran `prisma migrate deploy` successfully to apply only the new `20260405000001_add_competitor_analysis` migration
- **Files modified:** None (DB metadata only)
- **Commit:** N/A (DB state change)

## Commits

| Task | Commit | Message |
|------|--------|---------|
| Task 1 | 51f7cdd | feat(13-01): add CompetitorAnalysis model to schema.prisma |
| Task 2 | fbf3a3e | feat(13-01): create CompetitorAnalysis migration and regenerate Prisma client |

## Self-Check: PASSED

- [x] `apps/web/prisma/schema.prisma` has `model CompetitorAnalysis` at line 644
- [x] `apps/web/prisma/migrations/20260405000001_add_competitor_analysis/migration.sql` exists
- [x] Commits 51f7cdd and fbf3a3e exist in git log
- [x] `DESCRIBE CompetitorAnalysis` returns 22 rows in live DB
- [x] `prisma.competitorAnalysis` delegate confirmed in generated client
- [x] `prisma migrate status` shows "Database schema is up to date!"
