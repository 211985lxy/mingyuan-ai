---
phase: "03"
plan: "02"
subsystem: scoring-integration
tags: [scoring, fallback, cache-invalidation, route-integration]
dependency_graph:
  requires:
    - apps/web/src/lib/material-relevance.ts (from Plan 01)
    - apps/web/src/types/api.ts (quality field + abstract_fallback planSource from Plan 01)
  provides:
    - apps/web/src/app/api/packaging-material-suggestions/route.ts (scoring gate active, abstract fallback wired, CACHE_SCHEMA_VERSION=2)
  affects:
    - All cached packaging-material-suggestions results (auto-invalidated by schema bump)
tech_stack:
  added: []
  patterns:
    - Two-tier scoring gate wired into per-entry candidate loop
    - Abstract fallback fills gaps when scored candidates < entry.count
    - Cache schema version bump auto-invalidates pre-scoring entries
key_files:
  created: []
  modified:
    - apps/web/src/app/api/packaging-material-suggestions/route.ts
    - apps/web/__tests__/e2e/cache-schema-version.test.ts
decisions:
  - "Abstract fallback uses same loadMediaFromAllProviders path as primary queries — no special provider handling"
  - "effectivePlanSource uses majority-vote (>50% generic) to signal abstract_fallback — prevents a single fallback item from misrepresenting a mostly-matched response"
  - "archetype computed once before loop to avoid redundant resolveVisualArchetype calls per entry"
  - "collected counter tracks per-entry accepted count independently from role-scoped filter to avoid O(n^2) suggestions.filter on each item push"
metrics:
  duration_minutes: 5
  completed_date: "2026-03-25"
  tasks_completed: 2
  files_created: 0
  files_modified: 2
  tests_written: 0
  tests_passing: 24
requirements_satisfied: [RSCO-01, RSCO-02, RSCO-03, FBACK-01, FBACK-02]
---

# Phase 03 Plan 02: Scoring Integration Summary

**One-liner:** Activated the two-tier relevance scoring gate in the packaging-material-suggestions endpoint — off-domain stock results are now rejected before reaching the user, abstract fallback fills gaps, and CACHE_SCHEMA_VERSION=2 auto-invalidates all pre-scoring cache entries.

## What Was Built

### Modified: `apps/web/src/app/api/packaging-material-suggestions/route.ts`

**Import additions (lines 24-27):**
- `scoreAndFilterMedia` and `generateAbstractFallbackQueries` imported from `@/lib/material-relevance`

**CACHE_SCHEMA_VERSION bumped from 1 to 2:**
- Updated comment block to describe v1 (pre-scoring era) vs v2 (Phase 3 scoring deployed)
- All 6 `schemaVersion: CACHE_SCHEMA_VERSION` references now bake v2 into query hashes, making all v1 cache entries automatic misses

**SearchPlanResult.source type extended:**
- Added `"abstract_fallback"` to the source union (was `"llm" | "deterministic"`, now includes `"abstract_fallback"`)

**Per-entry candidate loop replaced:**
- Fetch multiplier raised from `entry.count * 2` to `entry.count * 3` to compensate for scoring rejection
- `archetype` and `scoringContext` computed once before the loop
- `scoreAndFilterMedia(rows, scoringContext, { role, query })` called on every batch
- Only `accepted` rows (non-rejected) are pushed as suggestions with `quality: "matched"`
- Abstract fallback path fires when `collected < entry.count`: calls `generateAbstractFallbackQueries(entry.role, archetype)` then `loadMediaFromAllProviders` with the returned abstract query; fallback items get `quality: "generic"`

**Response meta.planSource updated:**
- `effectivePlanSource` computed as `"abstract_fallback"` when more than half of suggestions are generic, otherwise uses `searchPlan.source`

### Modified: `apps/web/__tests__/e2e/cache-schema-version.test.ts`

- Test description updated from `"defines CACHE_SCHEMA_VERSION = 1"` to `"defines CACHE_SCHEMA_VERSION = 2"`
- Regex updated from `/const CACHE_SCHEMA_VERSION\s*=\s*1/` to `/const CACHE_SCHEMA_VERSION\s*=\s*2/`
- All 6 tests pass

## Commits

| Commit | Message |
|--------|---------|
| `33bcb79` | `feat(03-02): wire scoreAndFilterMedia and abstract fallback into per-entry loop` |
| `1c0b717` | `test(03-02): update cache-schema-version assertion from v1 to v2` |

## Deviations from Plan

None — plan executed exactly as written.

Minor note: The plan's acceptance criteria grep patterns for multi-function imports (`grep -q "import.*scoreAndFilterMedia.*from.*material-relevance"`) would only match single-line imports. The actual import is multi-line (each function on its own line) per the project's formatting convention. Both functions are present in the file and TypeScript compiled with zero errors — the real acceptance gate was met.

## Known Stubs

None. All scoring and fallback logic is wired to real implementations from Plan 01. No hardcoded payloads, mock providers, or placeholder data.

## Self-Check: PASSED

Files modified:
- `apps/web/src/app/api/packaging-material-suggestions/route.ts` — FOUND
- `apps/web/__tests__/e2e/cache-schema-version.test.ts` — FOUND

Commits:
- `33bcb79` — FOUND (scoring integration)
- `1c0b717` — FOUND (test update)

Verification results:
- TypeScript: zero errors (`npx tsc --noEmit` exits 0)
- cache-schema-version tests: 6/6 passing
- material-relevance tests: 18/18 passing (Plan 01 regression check)
- CACHE_SCHEMA_VERSION = 2: confirmed
- scoreAndFilterMedia: appears 2 times (import + call)
- generateAbstractFallbackQueries: appears 2 times (import + call)
