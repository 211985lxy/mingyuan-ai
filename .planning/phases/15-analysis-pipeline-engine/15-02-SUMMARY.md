---
phase: 15-analysis-pipeline-engine
plan: "02"
subsystem: api
tags: [pipeline, prisma, tikhub, llm, competitor-analysis, state-machine]

# Dependency graph
requires:
  - phase: 15-01
    provides: calculateMetrics, analyzeCompetitor, types (NormalizedAccount, NormalizedVideo, NormalizedComment, CompetitorMetrics, CompetitorAnalysisResult)
  - phase: 14
    provides: getAdapter, PlatformAdapter (DouyinAdapter, XiaohongshuAdapter), resolveUrl, fetchAccount, fetchVideos, fetchVideoStats, fetchComments
  - phase: 13
    provides: CompetitorAnalysis Prisma model with all status/data fields
provides:
  - "runCompetitorAnalysisPipeline(analysisId): Promise<void> — full scrape → enrich → analyze orchestrator"
  - "DB status transitions: pending → scraping → enriching → analyzing → completed (or failed)"
  - "Non-blocking pipeline entry point designed for fire-and-forget from API route"
affects:
  - 15-03 (API route that triggers this pipeline non-blocking)
  - future polling/SSE endpoints that read DB status fields

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Non-blocking pipeline: fire-and-forget with .catch() guard (same pattern as marketing-analysis)"
    - "State machine via atomic DB status updates at each pipeline phase boundary"
    - "as never cast for Prisma Json fields (consistent with existing codebase pattern)"
    - "Promise.all for parallel independent fetches (account + videos), sequential for rate-sensitive (comments per video)"
    - "Child logger with analysisId for full trace correlation across pipeline steps"
    - "Best-effort error persistence: secondary DB update in catch with .catch(() => {}) guard"

key-files:
  created:
    - apps/web/src/lib/competitor-analysis/pipeline.ts
  modified: []

key-decisions:
  - "Comment fetch is sequential per video (not parallel) to avoid TikHub rate limiting"
  - "platform field cast as 'douyin' | 'xiaohongshu' — Prisma stores String, cast is safe because API validation in PIPE-01 ensures only valid Platform values are persisted"
  - "apiCostUsd not tracked in MVP — field left at DB default (0)"
  - "top5 comment sampling by likes (not views) — likes are a stronger signal for comment quality"

patterns-established:
  - "Pipeline: each step calls updateStatus() then does work then persists results — never skips the status transition"
  - "Error recovery: single catch block at pipeline root, best-effort DB update, secondary error only logged"

requirements-completed: [PIPE-02]

# Metrics
duration: 3min
completed: "2026-04-05"
---

# Phase 15 Plan 02: Analysis Pipeline Engine — Pipeline Orchestrator Summary

**DB-tracked async state machine wiring TikHub scraping, metrics calculation, and Claude AI analysis into a single non-blocking `runCompetitorAnalysisPipeline()` function**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-05T08:03:54Z
- **Completed:** 2026-04-05T08:06:20Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Created `pipeline.ts` with `runCompetitorAnalysisPipeline(analysisId)` that drives the full 3-step pipeline
- DB status transitions occur atomically at each phase boundary: scraping → enriching → analyzing → completed
- Parallel fetch for account + videos in scraping step (reduces TikHub latency); sequential per-video for comment fetching (avoids rate limits)
- Error path: single `catch` at pipeline root sets `status='failed'` with `errorMessage`, secondary DB error is only logged (no re-throw)

## Task Commits

Each task was committed atomically:

1. **Task 1: Pipeline orchestrator** - `8d4aeef` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `apps/web/src/lib/competitor-analysis/pipeline.ts` — Full pipeline orchestrator: resolveUrl if platformUserId missing, fetchAccount+fetchVideos in parallel, fetchVideoStats batch-merge, top-5 comment sampling, calculateMetrics, analyzeCompetitor, DB status updates at each step, error handling

## Decisions Made

- Comment fetch is sequential per video to avoid TikHub rate limiting (parallelizing 5 concurrent fetchComments requests could hit API limits)
- `platform` cast as `'douyin' | 'xiaohongshu'` — Prisma stores as String; cast is safe because API validation in Plan 01 ensures only valid Platform values reach the pipeline
- `apiCostUsd` not tracked in this MVP; DB field stays at default 0
- Top-5 comment sample sourced by likes (highest-liked videos), not views — comment quality is better correlated with likes

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `runCompetitorAnalysisPipeline` is export-ready for Plan 03 (API route)
- API route (Plan 03) must call `runCompetitorAnalysisPipeline(id).catch(err => logger.error({err}, '...'))` without `await` — fire-and-forget
- No blockers

---
*Phase: 15-analysis-pipeline-engine*
*Completed: 2026-04-05*

## Self-Check: PASSED

- FOUND: `apps/web/src/lib/competitor-analysis/pipeline.ts`
- FOUND: `.planning/phases/15-analysis-pipeline-engine/15-02-SUMMARY.md`
- FOUND: commit `8d4aeef`
