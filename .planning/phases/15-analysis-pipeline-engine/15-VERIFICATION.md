---
phase: 15-analysis-pipeline-engine
verified: 2026-04-05T08:25:00Z
status: passed
score: 7/7 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "Submit real Douyin URL via POST /api/competitor/analyze and observe pipeline progression"
    expected: "Status transitions through scraping → enriching → analyzing → completed in DB; GET /api/competitor/[id] returns populated accountName, metricsData, analysisResult, overallScore"
    why_human: "Requires live TikHub API credentials and Claude API key; cannot be exercised without running the server and external services"
  - test: "Submit Xiaohongshu URL and confirm platform detection and full pipeline execution"
    expected: "platform='xiaohongshu' record created; pipeline completes with XHS-specific data populated"
    why_human: "Requires live XHS adapter and real platform credentials"
---

# Phase 15: Analysis Pipeline Engine Verification Report

**Phase Goal:** Users can submit a URL and the system asynchronously processes it through the full scrape → enrich → analyze pipeline to produce a scored report
**Verified:** 2026-04-05T08:25:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | POST /api/competitor/analyze validates URL, creates DB record, triggers pipeline non-blocking, returns { id, status: 'pending', platform } | ✓ VERIFIED | `analyze/route.ts` line 47: `runCompetitorAnalysisPipeline(analysis.id).catch(...)` — no await; returns NextResponse.json immediately |
| 2 | POST with unrecognized URL returns 400 UNSUPPORTED_PLATFORM; POST with missing url returns 400 INVALID_URL | ✓ VERIFIED | Lines 16, 21, 26, 31 in `analyze/route.ts` confirm both error codes |
| 3 | Pipeline transitions DB status: pending → scraping → enriching → analyzing → completed; on failure → failed with errorMessage | ✓ VERIFIED | `pipeline.ts` calls `updateStatus()` at each step; catch block sets `status: 'failed'` with `err.message` |
| 4 | calculateMetrics returns correct weighted_engagement_rate, duration buckets, viral_ratio, consistency_score; handles empty videos | ✓ VERIFIED | 17/17 unit tests pass (10 metrics + 7 analyzer), all algorithm branches verified by vitest |
| 5 | analyzeCompetitor calls LLMClient.shared() with correct parameters, strips markdown fences, clamps scores, injects authoritative stats | ✓ VERIFIED | `analyzer.ts` — temperature=0.3, maxTokens=4000, responseFormat json_object confirmed; clamp applied to all 7 score fields; stats injected post-parse |
| 6 | GET /api/competitor/[id] returns analysis fields and enforces user ownership (404 for wrong user) | ✓ VERIFIED | `[id]/route.ts` line 12: `if (!analysis \|\| analysis.userId !== user.id) → 404` |
| 7 | GET /api/competitor/reports returns paginated { items, total, page, limit } | ✓ VERIFIED | `reports/route.ts`: parallel count+findMany, page/limit clamped, shape confirmed |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/web/src/lib/competitor-analysis/types.ts` | Re-export barrel for 7 types from tikhub/types | ✓ VERIFIED | 10 lines; exports NormalizedAccount, NormalizedVideo, NormalizedComment, CompetitorMetrics, CompetitorAnalysisResult, Platform, PlatformAdapter |
| `apps/web/src/lib/competitor-analysis/metrics.ts` | `calculateMetrics(account, videos) => CompetitorMetrics` | ✓ VERIFIED | 197 lines; full algorithm implementation with empty-case guard |
| `apps/web/src/lib/competitor-analysis/analyzer.ts` | `analyzeCompetitor(account, videos, comments, metrics) => Promise<CompetitorAnalysisResult>` | ✓ VERIFIED | 141 lines; LLM call, fence-stripping, clamping, stats injection all present |
| `apps/web/src/lib/competitor-analysis/pipeline.ts` | `runCompetitorAnalysisPipeline(analysisId): Promise<void>` | ✓ VERIFIED | 137 lines; full 3-step state machine with error path |
| `apps/web/src/app/api/competitor/analyze/route.ts` | POST — validate URL, trigger pipeline non-blocking | ✓ VERIFIED | 57 lines; maxDuration=300, withUserAuth, parseUrl, .catch() pattern |
| `apps/web/src/app/api/competitor/[id]/route.ts` | GET (status polling) + DELETE | ✓ VERIFIED | 55 lines; both handlers present, ownership check on both |
| `apps/web/src/app/api/competitor/reports/route.ts` | GET paginated history | ✓ VERIFIED | 47 lines; { items, total, page, limit } shape |
| `apps/web/__tests__/unit/competitor-analysis/metrics.test.ts` | Unit tests for calculateMetrics | ✓ VERIFIED | 10 tests, all passing |
| `apps/web/__tests__/unit/competitor-analysis/analyzer.test.ts` | Unit tests for analyzeCompetitor | ✓ VERIFIED | 7 tests, all passing |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `pipeline.ts` | `tikhub/adapters/index.ts` | `getAdapter(analysis.platform)` | ✓ WIRED | Lines 3, 27 in pipeline.ts |
| `pipeline.ts` | `competitor-analysis/metrics.ts` | `calculateMetrics(account, videosWithStats)` | ✓ WIRED | Lines 5, 79 in pipeline.ts |
| `pipeline.ts` | `competitor-analysis/analyzer.ts` | `analyzeCompetitor(account, videosWithStats, allComments, metrics)` | ✓ WIRED | Lines 6, 93 in pipeline.ts |
| `pipeline.ts` | `lib/prisma.ts` | `prisma.competitorAnalysis.update()` for each status transition | ✓ WIRED | Lines 50, 81, 100, 116, 132 — 5 DB updates across 3 steps + error path |
| `analyze/route.ts` | `competitor-analysis/pipeline.ts` | `runCompetitorAnalysisPipeline(analysis.id).catch(...)` | ✓ WIRED | Lines 5, 47 in analyze/route.ts |
| `analyze/route.ts` | `tikhub/url-parser.ts` | `parseUrl(rawUrl)` | ✓ WIRED | Lines 4, 24 in analyze/route.ts |
| `[id]/route.ts` | `lib/user-auth.ts` | `withUserAuth` middleware | ✓ WIRED | Lines 3, 5, 39 in [id]/route.ts |
| `metrics.ts` | `tikhub/types.ts` | imports NormalizedAccount, NormalizedVideo, CompetitorMetrics | ✓ WIRED | Line 1 in metrics.ts via `./types` barrel |
| `analyzer.ts` | `lib/llm` | `LLMClient.shared().complete()` | ✓ WIRED | Line 1: `import { LLMClient } from '@/lib/llm'`; line 103: `llm.complete(...)` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `pipeline.ts` | `account`, `videos` | `adapter.fetchAccount()`, `adapter.fetchVideos()` — real TikHub API calls | Yes — TikHub adapters are live (Phase 14) | ✓ FLOWING |
| `pipeline.ts` | `metrics` | `calculateMetrics(account, videosWithStats)` — deterministic, no mock | Yes — pure function over real scraped data | ✓ FLOWING |
| `pipeline.ts` | `result` | `analyzeCompetitor(...)` → `LLMClient.shared().complete()` — real Claude API | Yes — LLMClient calls real API, no fallback | ✓ FLOWING |
| `[id]/route.ts` | `analysis` | `prisma.competitorAnalysis.findUnique(...)` — real DB query | Yes — reads actual record created by pipeline | ✓ FLOWING |
| `reports/route.ts` | `items`, `total` | `prisma.competitorAnalysis.findMany/count` — real DB queries with userId filter | Yes — no static returns | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `calculateMetrics` exports from metrics.ts | `grep "^export function calculateMetrics"` | Line 34 found | ✓ PASS |
| `analyzeCompetitor` exports from analyzer.ts | `grep "^export async function analyzeCompetitor"` | Line 18 found | ✓ PASS |
| `runCompetitorAnalysisPipeline` exports from pipeline.ts | `grep "^export async function runCompetitorAnalysisPipeline"` | Line 19 found | ✓ PASS |
| 17 unit tests pass | `npx vitest run __tests__/unit/competitor-analysis/` | 2 files, 17 tests — all green | ✓ PASS |
| TypeScript compilation | `npx tsc --noEmit` | Exit code 0, no errors | ✓ PASS |
| Non-blocking pipeline trigger | grep `.catch(` in analyze/route.ts | Line 47: `.catch((err: unknown) =>` | ✓ PASS |
| Error path sets status='failed' | grep `status: 'failed'` in pipeline.ts | Lines 119, confirmed | ✓ PASS |
| Live pipeline execution (real URL) | Requires running server + TikHub API | N/A | ? SKIP |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| PIPE-01 | 15-03 | User can submit a competitor account URL to start analysis (POST /api/competitor/analyze) | ✓ SATISFIED | `analyze/route.ts` — validates URL via parseUrl, creates CompetitorAnalysis record, returns { id, status: 'pending', platform } immediately |
| PIPE-02 | 15-02, 15-03 | System runs async pipeline (scrape → enrich → analyze) with DB-driven status tracking | ✓ SATISFIED | `pipeline.ts` — full state machine with 5 atomic DB updates; non-blocking trigger in route via .catch() |
| PIPE-03 | 15-01 | System calculates quantitative metrics: weighted engagement rate, posting frequency, consistency score, viral ratio, duration distribution, top hashtags, posting time heatmap | ✓ SATISFIED | `metrics.ts` calculates all listed metrics; `analyzer.ts` builds heatmap from raw video timestamps; 10 unit tests cover all metric algorithms |
| PIPE-04 | 15-01 | System generates AI analysis report via Claude with 6-dimension radar scores and structured narrative sections | ✓ SATISFIED | `analyzer.ts` — calls LLMClient.shared() with 6-dimension prompt; parses CompetitorAnalysisResult with scores.content_power/growth_power/engagement_power/monetization_power/persona_power/operation_power + sections |

All 4 requirements are SATISFIED. No orphaned requirements found.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No TODO/FIXME/placeholder found in any phase 15 file | — | — |
| — | — | No empty return null or stub handler found | — | — |
| — | — | No hardcoded mock data or static JSON returns | — | — |

Zero anti-patterns found across all 7 production files.

### Human Verification Required

#### 1. End-to-End Pipeline with Real Douyin URL

**Test:** POST to `/api/competitor/analyze` with a valid Douyin profile URL. Poll `GET /api/competitor/[id]` every 5 seconds to observe status transitions.
**Expected:** Status progresses through scraping → enriching → analyzing → completed; `metricsData`, `analysisResult`, and `overallScore` are populated; 6 score dimensions are all 0-100.
**Why human:** Requires live TikHub credentials, live Claude API key, and a running Next.js server. Cannot be verified with grep or unit tests.

#### 2. Xiaohongshu URL Support

**Test:** POST a valid Xiaohongshu creator profile URL and wait for pipeline completion.
**Expected:** `platform='xiaohongshu'` in record; full analysis completes without error.
**Why human:** Requires live XHS adapter, distinct TikHub API paths, and running server.

### Gaps Summary

No gaps. All 7 observable truths verified. All 9 artifacts exist, are substantive, and are wired. All 9 key links confirmed present. All 4 requirements satisfied. TypeScript exits 0. 17/17 unit tests pass. Zero stubs or placeholder anti-patterns found.

The two human verification items are integration smoke tests requiring external services — they are flagged as informational, not blockers.

---

_Verified: 2026-04-05T08:25:00Z_
_Verifier: Claude (gsd-verifier)_
