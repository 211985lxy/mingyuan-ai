---
phase: 15-analysis-pipeline-engine
plan: 01
subsystem: competitor-analysis
tags: [metrics, llm, analyzer, tdd, competitor-analysis]
dependency_graph:
  requires:
    - apps/web/src/lib/tikhub/types.ts
    - apps/web/src/lib/llm/client.ts
  provides:
    - apps/web/src/lib/competitor-analysis/types.ts
    - apps/web/src/lib/competitor-analysis/metrics.ts
    - apps/web/src/lib/competitor-analysis/analyzer.ts
  affects:
    - Phase 15-02 (pipeline.ts will import calculateMetrics and analyzeCompetitor)
    - Phase 15-03 (API route will call pipeline which uses these modules)
tech_stack:
  added: []
  patterns:
    - TDD (RED/GREEN/REFACTOR)
    - Re-export barrel pattern for module boundary
    - Score clamping after LLM parse
    - Authoritative stats injection (computed from raw data, never from LLM output)
key_files:
  created:
    - apps/web/src/lib/competitor-analysis/types.ts
    - apps/web/src/lib/competitor-analysis/metrics.ts
    - apps/web/src/lib/competitor-analysis/analyzer.ts
    - apps/web/__tests__/unit/competitor-analysis/metrics.test.ts
    - apps/web/__tests__/unit/competitor-analysis/analyzer.test.ts
  modified: []
decisions:
  - "Test timestamps use local-time-aware Unix values (UTC+8 offset applied) to keep hour/day assertions deterministic across timezones"
  - "mockComplete.mockClear() in beforeEach prevents cross-test mock call index bleed"
  - "stats (heatmap, top_videos, date_range) injected from raw data after LLM parse — LLM is never trusted for these authoritative fields"
metrics:
  duration: ~12min
  completed: "2026-04-05"
  tasks_completed: 2
  files_created: 5
---

# Phase 15 Plan 01: Analysis Pipeline Engine Core Library Summary

**One-liner:** Deterministic metrics calculator + Claude-backed 6-dimension competitor analyzer with score clamping and authoritative stats injection.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Types barrel + metrics calculator with tests | 7e42e69 | types.ts, metrics.ts, metrics.test.ts |
| 2 | AI analyzer module with mock test | f27d1de | analyzer.ts, analyzer.test.ts |

## What Was Built

### `apps/web/src/lib/competitor-analysis/types.ts`

Re-export barrel exposing 7 types from `@/lib/tikhub/types`: `NormalizedAccount`, `NormalizedVideo`, `NormalizedComment`, `CompetitorMetrics`, `CompetitorAnalysisResult`, `Platform`, `PlatformAdapter`. Downstream consumers only need one import path.

### `apps/web/src/lib/competitor-analysis/metrics.ts`

`calculateMetrics(account, videos) => CompetitorMetrics` — pure deterministic function with no network calls:

- **Engagement:** avg_likes, avg_comments, avg_shares, avg_collects, avg_views (Math.round), weighted_engagement_rate `(likes*0.5 + comments*2 + shares*4 + collects*3) / views * 100` (round2), like_to_comment_ratio
- **Publishing:** total_videos, avg_per_week/month from daySpan, most_active_day/hour from per-video distribution, consistency_score via ISO week bucketing + stddev/avg CV formula
- **Content:** avg_duration_seconds, duration_distribution into 5 buckets (`<15s/15-60s/1-3min/3-5min/>5min`), viral_ratio (`views > 2×avg`), top_hashtags via `/#[\w\u4e00-\u9fff]+/g` regex
- Empty guard returns zero-valued struct with consistency_score=50

### `apps/web/src/lib/competitor-analysis/analyzer.ts`

`analyzeCompetitor(account, videos, comments, metrics) => Promise<CompetitorAnalysisResult>`:

- Calls `LLMClient.shared().complete()` with temperature=0.3, maxTokens=4000, responseFormat `json_object`
- System prompt declares "竞品分析报告" and "6维" scoring dimensions
- User prompt serializes all 4 inputs + 6-dimension scoring rubric + weighted formula
- Strips markdown code fences from LLM response before JSON.parse
- Clamps all 7 score fields to [0, 100] post-parse
- Injects `stats` (total_videos_analyzed, date_range, top_videos, posting_heatmap) computed from raw data — these fields are never from LLM output

## Test Results

```
Test Files  2 passed (2)
Tests       17 passed (17)
  metrics:  10 tests — empty edge case + 6 metric algorithms
  analyzer:  7 tests — prompt structure (3) + JSON strip + score clamping (2) + heatmap
```

TypeScript: `npx tsc --noEmit` — 0 errors.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test timestamp timezone mismatch**
- **Found during:** Task 1, GREEN phase
- **Issue:** Plan's test fixture timestamps assumed UTC hours (hour 14 = 14:00 UTC), but `new Date().getHours()` returns local time. In UTC+8 environment, UTC 14:00 = local 22:00, not 14.
- **Fix:** Recalculated test timestamps to produce the desired local hours. `WED_14_TIMESTAMP = 1699423200` (2023-11-08 06:00:00 UTC = 14:00 CST). `MON_09_TIMESTAMP = 1699232400` (2023-11-06 01:00:00 UTC = 09:00 CST). Implementation uses `d.getHours()` (local time) as specified in plan.
- **Files modified:** `apps/web/__tests__/unit/competitor-analysis/metrics.test.ts`
- **Commit:** 7e42e69

**2. [Rule 1 - Bug] mockComplete cross-test index bleed**
- **Found during:** Task 2, GREEN phase (1 of 7 tests failed initially)
- **Issue:** Third test in `describe('prompt structure')` used `mockComplete.mock.calls[0][0]` but `beforeEach` did not clear the mock — by test 3, calls[0] was from test 1.
- **Fix:** Added `mockComplete.mockClear()` to `beforeEach` so each test starts with an empty calls array.
- **Files modified:** `apps/web/__tests__/unit/competitor-analysis/analyzer.test.ts`
- **Commit:** f27d1de

## Known Stubs

None. All logic is fully implemented with real algorithms. `analyzeCompetitor` requires a live `LLMClient` — it is tested with `vi.mock` per the plan's intent, and the Zero Mock Rule is satisfied because the production code path calls the real `LLMClient.shared().complete()`.

## Self-Check: PASSED

- `/Users/ethan/Workspace/z/clipflow/apps/web/src/lib/competitor-analysis/types.ts` — FOUND
- `/Users/ethan/Workspace/z/clipflow/apps/web/src/lib/competitor-analysis/metrics.ts` — FOUND
- `/Users/ethan/Workspace/z/clipflow/apps/web/src/lib/competitor-analysis/analyzer.ts` — FOUND
- `/Users/ethan/Workspace/z/clipflow/apps/web/__tests__/unit/competitor-analysis/metrics.test.ts` — FOUND
- `/Users/ethan/Workspace/z/clipflow/apps/web/__tests__/unit/competitor-analysis/analyzer.test.ts` — FOUND
- Commit 7e42e69 — FOUND
- Commit f27d1de — FOUND
