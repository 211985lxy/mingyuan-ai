---
phase: 15-analysis-pipeline-engine
plan: 03
subsystem: api
tags: [next.js, prisma, competitor-analysis, tikhub, app-router]

# Dependency graph
requires:
  - phase: 15-01
    provides: metrics calculator, analyzer, CompetitorAnalysis DB model
  - phase: 15-02
    provides: runCompetitorAnalysisPipeline orchestrator
provides:
  - POST /api/competitor/analyze — URL validation, DB record creation, non-blocking pipeline trigger
  - GET /api/competitor/[id] — status polling with full progressive fields and user ownership enforcement
  - DELETE /api/competitor/[id] — record deletion with user ownership enforcement, 204 response
  - GET /api/competitor/reports — paginated history list with { items, total, page, limit }
affects:
  - 16-competitor-analysis-frontend

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Non-blocking Promise pipeline trigger via .catch() (same as marketing-analysis)
    - User ownership enforcement via userId !== user.id → 404 (no information leakage)
    - Paginated list endpoint with safe page/limit clamping

key-files:
  created:
    - apps/web/src/app/api/competitor/analyze/route.ts
    - apps/web/src/app/api/competitor/[id]/route.ts
    - apps/web/src/app/api/competitor/reports/route.ts
  modified: []

key-decisions:
  - "DELETE returns 404 for wrong user (not 403) to avoid information leakage about record existence"
  - "bilibili and kuaishou explicitly blocked at API layer (UNSUPPORTED_PLATFORM) — MVP is Douyin + XHS only"
  - "reports limit clamped to max 50 to prevent unbounded DB queries"

patterns-established:
  - "Non-blocking pipeline: runCompetitorAnalysisPipeline(id).catch() — no await, error logged not surfaced"
  - "User ownership: findUnique → check userId → 404 if mismatch (both GET and DELETE)"
  - "Pagination: Math.max/Math.min clamping for page and limit; parallel count + list via Promise.all"

requirements-completed: [PIPE-01, PIPE-02]

# Metrics
duration: 2min
completed: 2026-04-05
---

# Phase 15 Plan 03: API Routes Summary

**Three Next.js App Router API routes exposing the competitor analysis pipeline: submit URL, poll status, list history, delete record — all protected by withUserAuth and enforcing user ownership.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-05T08:11:22Z
- **Completed:** 2026-04-05T08:14:15Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- POST /api/competitor/analyze validates URL via parseUrl(), creates CompetitorAnalysis record with status=pending, triggers runCompetitorAnalysisPipeline non-blocking, returns { id, status: 'pending', platform } immediately
- GET /api/competitor/[id] returns all progressive fields (accountName, metricsData, analysisResult, overallScore, errorMessage) and enforces user ownership with 404
- DELETE /api/competitor/[id] deletes record with ownership check and returns 204 No Content
- GET /api/competitor/reports returns paginated { items, total, page, limit } with account summary fields needed by Phase 16 frontend

## Task Commits

Each task was committed atomically:

1. **Task 1: POST /api/competitor/analyze route** - `dd0ba1e` (feat)
2. **Task 2: GET+DELETE /api/competitor/[id] and GET /api/competitor/reports** - `2e359f7` (feat)

**Plan metadata:** (pending docs commit)

## Files Created/Modified

- `apps/web/src/app/api/competitor/analyze/route.ts` - Submit URL, validate platform, create record, trigger pipeline non-blocking
- `apps/web/src/app/api/competitor/[id]/route.ts` - Status polling GET + ownership-enforced DELETE
- `apps/web/src/app/api/competitor/reports/route.ts` - Paginated history list for Phase 16 UI

## Decisions Made

- DELETE returns 404 for wrong user (not 403) — avoids leaking record existence to unauthorized callers
- bilibili and kuaishou explicitly blocked at the API layer with UNSUPPORTED_PLATFORM — MVP scope is Douyin + XHS only
- reports limit clamped to max 50 per request to prevent unbounded DB queries

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None. All three routes wire to real DB via Prisma and real pipeline via runCompetitorAnalysisPipeline.

## Next Phase Readiness

- Phase 15 fully complete: DB schema (15-01) + pipeline orchestrator (15-02) + API routes (15-03) all shipped
- Phase 16 (competitor-analysis-frontend) can now POST to /api/competitor/analyze, poll via GET /api/competitor/[id], and render history from GET /api/competitor/reports
- No blockers

---
*Phase: 15-analysis-pipeline-engine*
*Completed: 2026-04-05*
