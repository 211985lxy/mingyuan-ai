---
phase: "03"
plan: "01"
subsystem: material-relevance-scoring
tags: [scoring, llm, deterministic, fallback, stock-media]
dependency_graph:
  requires:
    - apps/web/src/lib/llm/client.ts
    - apps/web/src/types/api.ts
  provides:
    - apps/web/src/lib/material-relevance.ts (scoreAndFilterMedia, generateAbstractFallbackQueries)
    - apps/web/src/types/api.ts (quality field on MaterialAssignment, abstract_fallback in planSource)
  affects:
    - apps/web/src/app/api/packaging-material-suggestions/route.ts (integration in Plan 02)
tech_stack:
  added: []
  patterns:
    - Two-tier scoring gate (deterministic Tier 1 + LLM batch Tier 2)
    - Industry archetype-to-tone mapping (INDUSTRY_ABSTRACT_QUERY_MAP)
    - Batched LLM scoring (one call per invocation, not per-item)
key_files:
  created:
    - apps/web/src/lib/material-relevance.ts
    - apps/web/__tests__/e2e/material-relevance.test.ts
  modified:
    - apps/web/src/types/api.ts
decisions:
  - "scoreDeterministic uses archetype.split() + entry.query.split() as business keyword derivation — avoids maintaining a separate keyword list"
  - "LLM unavailability returns neutral pass (score=50, rejected=false) rather than hard-rejecting all candidates"
  - "generateAbstractFallbackQueries returns query+tone metadata only; route.ts calls loadMediaFromAllProviders with the returned query"
  - "quality: 'generic' | 'matched' added to MaterialAssignment (individual item level) in addition to planSource for maximum frontend utility"
metrics:
  duration_minutes: 5
  completed_date: "2026-03-25"
  tasks_completed: 1
  files_created: 2
  files_modified: 1
  tests_written: 18
  tests_passing: 18
requirements_satisfied: [RSCO-01, RSCO-02, RSCO-03, FBACK-01, FBACK-02]
---

# Phase 03 Plan 01: Material Relevance Scoring Module Summary

**One-liner:** Two-tier stock media relevance gate — deterministic keyword blocklist (Tier 1, zero LLM cost) + single batched LLM call (Tier 2) triggered only when Tier 1 yield < 50%, with tone-appropriate abstract fallback queries for 21 industry archetypes.

## What Was Built

### New File: `apps/web/src/lib/material-relevance.ts` (559 lines)

Standalone scoring library with no dependency on route.ts internals.

**Exports:**
- `scoreAndFilterMedia(rows, context, entry)`: Two-tier scoring pipeline
- `generateAbstractFallbackQueries(role, archetype)`: Returns abstract fallback query + tone
- `INDUSTRY_ABSTRACT_QUERY_MAP`: 21-entry map from archetype to warm/clean tone + role queries
- `DETERMINISTIC_YIELD_THRESHOLD = 0.5` (50%)
- `LLM_PASS_SCORE = 5` (out of 10)
- `ScoredMediaRow` interface
- `ScorableMediaRow` interface

**Tier 1 (deterministic) logic:**
- Checks `row.alt` against `OFF_DOMAIN_TERMS` (16 nature/landscape terms)
- Rejects if off-domain term found AND zero business keyword overlap
- Skips off-domain check for `GENERIC_ARCHETYPE = "professional service business"`
- Business keywords derived from `archetype.split(" ")` + `entry.query.split(" ")`, filtered to >= 3 chars

**Tier 2 (LLM batch) logic:**
- Triggers only when Tier 1 acceptance rate < DETERMINISTIC_YIELD_THRESHOLD (50%)
- Sends exactly one LLM call per invocation (not per-item — RSCO-02 batching requirement)
- Chinese scoring prompt with 0-10 scale, `reject=true` when `score <= LLM_PASS_SCORE`
- Defensive JSON parse: accepts bare array, `parsed.scores`, or `parsed.results`
- Graceful fallback on LLM unavailability or parse failure (neutral pass, score=50)

**Abstract fallback:**
- `INDUSTRY_ABSTRACT_QUERY_MAP` covers all 21 `resolveVisualArchetype()` outputs
- Two tone buckets: "warm" (food/bakery/florist/nurturing/crafts) and "clean" (professional/clinical/technical)
- Returns `{query, tone}` metadata; route.ts supplies the actual `loadMediaFromAllProviders()` call

### Modified: `apps/web/src/types/api.ts`

- Added `quality?: "generic" | "matched"` to `MaterialAssignment` interface
- Extended `planSource` union to `"llm" | "deterministic" | "abstract_fallback"`

### New File: `apps/web/__tests__/e2e/material-relevance.test.ts` (280 lines)

18 tests covering all 5 requirements:

| Requirement | Tests |
|-------------|-------|
| RSCO-01 | Rejects "mountain lake reflection" for HVAC; accepts "HVAC technician installing unit"; skips blocklist for generic archetype |
| RSCO-02 | DETERMINISTIC_YIELD_THRESHOLD = 0.5; LLM triggered at threshold; structural results contract |
| RSCO-03 | LLM_PASS_SCORE = 5; ScoredMediaRow shape contract |
| FBACK-01 | Abstract query generation for known archetype; fallback to generic for unknown |
| FBACK-02 | "baker pastry bakery" → warm; "lawyer legal office" → clean; all 21 archetypes in map; all 3 roles per entry |

## Commits

| Commit | Message | Phase |
|--------|---------|-------|
| `8d30957` | `test(03-01): add failing tests for material-relevance module (RED)` | TDD RED |
| `d5541f0` | `feat(03-01): implement material-relevance scoring module and type updates (GREEN)` | TDD GREEN |

## Deviations from Plan

None — plan executed exactly as written.

The plan specified `generateAbstractFallbackMedia` as the function name but also showed the export signature as `generateAbstractFallbackQueries` — used `generateAbstractFallbackQueries` to match the explicit export signature in the plan's `<action>` section.

## Known Stubs

None. This plan creates a standalone library; the route.ts integration (wiring `scoreAndFilterMedia` into the per-entry loop) is deferred to Plan 02 as designed.

## Self-Check: PASSED

Files created:
- `apps/web/src/lib/material-relevance.ts` — FOUND
- `apps/web/__tests__/e2e/material-relevance.test.ts` — FOUND

Commits:
- `8d30957` — FOUND (test RED)
- `d5541f0` — FOUND (feat GREEN)

Tests: 18/18 passing
TypeScript: zero errors
