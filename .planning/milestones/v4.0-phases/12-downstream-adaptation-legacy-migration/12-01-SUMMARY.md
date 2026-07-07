---
phase: 12-downstream-adaptation-legacy-migration
plan: "01"
subsystem: ip-profile-downstream
tags: [v2-compatibility, script-generator, hot-topic-intelligence, packaging-materials, typescript]
dependency_graph:
  requires:
    - "11-02 (3D positioning result display + v2 schema migration)"
  provides:
    - "resolveScriptScoringFields helper in script-generator.ts"
    - "FitInput v2-extended type in hot-topic-intelligence.ts"
    - "v2-aware effectiveIndustry/effectiveOffer/effectiveAudience in packaging-material-suggestions"
  affects:
    - "script-generator scoring (scoreWithAI, scoreWithKeywords, generateWithFallback)"
    - "hot-topic-intelligence FitInput type compatibility"
    - "packaging-material-suggestions archetype resolution and search planning"
tech_stack:
  added: []
  patterns:
    - "resolveScriptScoringFields: v1-flat to v2-JSON field resolution pattern"
    - "effectiveX: fallback chain from flat field to JSON sub-field"
key_files:
  created: []
  modified:
    - apps/web/src/lib/script-generator.ts
    - apps/web/src/lib/hot-topic-intelligence.ts
    - apps/web/src/app/api/packaging-material-suggestions/route.ts
decisions:
  - "Used unknown|null for business/persona/content in FitInput.ipProfile to avoid Prisma JsonValue import; added explicit cast at buildIpProfilePromptSnapshot call site"
  - "resolveScriptScoringFields helper centralizes v1/v2 field resolution to avoid scatter across scoring functions"
  - "effectiveIndustry falls back to business.core (not primaryOffer) following BusinessPositioning semantics"
metrics:
  duration: "~25 minutes"
  completed: "2026-04-02"
  tasks_completed: 2
  files_modified: 3
---

# Phase 12 Plan 01: Downstream Adaptation for v2 IP Profile Fields Summary

Three downstream LLM consumers adapted to read v2 IP profile 3D positioning fields, ensuring v2 users get meaningful scoring context instead of "未指定" fallbacks.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add resolveScriptScoringFields helper + adapt script-generator.ts (INTG-01) | 0105645 | apps/web/src/lib/script-generator.ts |
| 2 | Extend FitInput type + v2-aware packaging-material-suggestions (INTG-02, INTG-03) | 21f3498 | apps/web/src/lib/hot-topic-intelligence.ts, apps/web/src/app/api/packaging-material-suggestions/route.ts |

## What Was Built

**INTG-01 (script-generator.ts):**
- Added `import type { BusinessPositioning, PersonaDesign } from "@/types/ip-profile-v2"`
- Extended `GenerateScriptCandidatesParams.ipProfile` type with optional v2 fields: `profileVersion`, `business`, `persona`, `content`
- Created `ResolvedScoringFields` interface and `resolveScriptScoringFields` helper function that reads flat fields first, falls back to v2 JSON sub-fields
- Updated `scoreWithAI`, `scoreWithKeywords`, `generateWithFallback` to all call `resolveScriptScoringFields` instead of reading `ipProfile.industry`, `ipProfile.ipTraits`, etc. directly
- `buildContextBlock` remains untouched (already v2-aware via `promptSnapshot`)

**INTG-02 (hot-topic-intelligence.ts):**
- Extended `FitInput.ipProfile` inline type with four optional v2 fields: `profileVersion`, `business`, `persona`, `content`
- Added explicit cast at `buildIpProfilePromptSnapshot(input.ipProfile)` call site to resolve `unknown` vs `JsonValue` type incompatibility
- No functional changes needed (the function already uses `buildIpProfilePromptSnapshot` for prompt text)

**INTG-03 (packaging-material-suggestions/route.ts):**
- Added `import type { BusinessPositioning } from "@/types/ip-profile-v2"`
- Added `effectiveIndustry`, `effectiveOffer`, `effectiveAudience` variables with v2 fallback chain: flat field OR `business.core/differentiator/audience`
- Updated `buildSearchPlan` call to use effective variables
- Updated `resolveVisualArchetype` call to use `effectiveIndustry` and `effectiveOffer`
- Updated `scoringContext` object to use all three effective variables

## Verification Results

- `grep -c "resolveScriptScoringFields" script-generator.ts` = 4 (definition + 3 call sites)
- `grep "interface ResolvedScoringFields" script-generator.ts` = 1 match
- `grep "profileVersion" hot-topic-intelligence.ts` = 1 match
- `grep -c "effectiveIndustry" packaging-material-suggestions/route.ts` = 4 matches
- TypeScript compiles without errors in modified files (pre-existing errors in ip-profile.ts, generate-positioning/route.ts, test files are unrelated)

## Deviations from Plan

**1. [Rule 1 - Bug] Fixed type incompatibility in hot-topic-intelligence.ts FitInput**
- **Found during:** Task 2
- **Issue:** `FitInput.ipProfile.business` typed as `unknown | null` is not assignable to `Partial<IpProfile>.business` which is `JsonValue` — causes TS error at the `buildIpProfilePromptSnapshot(input.ipProfile)` call site
- **Fix:** Added explicit cast `input.ipProfile as Parameters<typeof buildIpProfilePromptSnapshot>[0]` at the call site
- **Files modified:** apps/web/src/lib/hot-topic-intelligence.ts
- **Commit:** 21f3498

## Known Stubs

None — all v2 field access uses real fallback chains reading actual JSON fields from the database-stored business/persona positioning objects.

## Self-Check: PASSED

- `apps/web/src/lib/script-generator.ts` — modified, committed at 0105645
- `apps/web/src/lib/hot-topic-intelligence.ts` — modified, committed at 21f3498
- `apps/web/src/app/api/packaging-material-suggestions/route.ts` — modified, committed at 21f3498
- Both commits verified in `git log --oneline -5`
