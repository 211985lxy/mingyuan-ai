---
phase: 14-data-acquisition-layer
plan: "04"
subsystem: api
tags: [tikhub, douyin, xiaohongshu, adapter-pattern, url-parser, factory]

# Dependency graph
requires:
  - phase: 14-02
    provides: DouyinAdapter implementing PlatformAdapter
  - phase: 14-03
    provides: XiaohongshuAdapter implementing PlatformAdapter
  - phase: 14-01
    provides: url-parser (detectPlatform, extractUserId, parseUrl)
provides:
  - getAdapter factory function in adapters/index.ts
  - tikhub/index.ts unified public API (all symbols accessible via single import)
  - data-acquisition-smoke-test.ts (23 structural assertions, all passing)
affects:
  - 15-analysis-pipeline
  - any consumer importing from lib/tikhub

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Adapter registry factory with exhaustive switch + never check for future Platform values
    - Public API barrel export pattern (single index.ts entry point for entire module)
    - Structural smoke test for module wiring validation (no live API calls required)

key-files:
  created:
    - apps/web/src/lib/tikhub/adapters/index.ts
    - apps/web/src/worker/data-acquisition-smoke-test.ts
  modified:
    - apps/web/src/lib/tikhub/index.ts

key-decisions:
  - "Exhaustive switch with never check ensures TypeScript compile-time safety when new Platform values are added"
  - "Smoke test performs structural checks only (instanceof + typeof function) — no live API calls or TIKHUB_API_KEY needed"

patterns-established:
  - "getAdapter(platform): PlatformAdapter — single factory function for all adapters"
  - "lib/tikhub/index.ts as single entry point: import { getAdapter, parseUrl, DouyinAdapter, ... } from '../lib/tikhub'"

requirements-completed: [DATA-01, DATA-02, DATA-03, DATA-04, DATA-05]

# Metrics
duration: 2min
completed: 2026-04-05
---

# Phase 14 Plan 04: Adapter Registry + Public API Wiring Summary

**getAdapter factory + tikhub barrel index wiring Douyin/XHS adapters and url-parser into a single Phase 15-ready public API, verified by 23-check structural smoke test**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-05T07:30:12Z
- **Completed:** 2026-04-05T07:32:51Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created `adapters/index.ts` with `getAdapter` factory: returns `DouyinAdapter` for `'douyin'`, `XiaohongshuAdapter` for `'xiaohongshu'`, throws with "not supported in MVP" for `bilibili`/`kuaishou`, exhaustive never check for future Platform values
- Updated `lib/tikhub/index.ts` to re-export `detectPlatform`, `extractUserId`, `parseUrl`, `ParsedUrl`, `getAdapter`, `DouyinAdapter`, `XiaohongshuAdapter` — Phase 15 can `import { getAdapter, parseUrl } from '../lib/tikhub'` with no additional imports
- `data-acquisition-smoke-test.ts` passes all 23 assertions: ALL CHECKS PASSED — zero TypeScript errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Create adapters/index.ts with getAdapter factory** - `923ffda` (feat)
2. **Task 2: Update tikhub/index.ts + create smoke test** - `2702f84` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `apps/web/src/lib/tikhub/adapters/index.ts` - getAdapter factory + re-exports DouyinAdapter, XiaohongshuAdapter
- `apps/web/src/lib/tikhub/index.ts` - unified barrel: now re-exports all of client, types, url-parser, adapters
- `apps/web/src/worker/data-acquisition-smoke-test.ts` - 23 structural assertions verifying full module wiring

## Decisions Made

- Exhaustive `never` check in `getAdapter` switch ensures compile-time safety when new `Platform` values are added to the union type
- Smoke test uses `instanceof` and `typeof function` checks — no live API calls needed — so it runs without `TIKHUB_API_KEY` in any environment

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 14 (data-acquisition-layer) is complete. Phase 15 (analysis-pipeline) can now import directly:

```typescript
import { getAdapter, parseUrl } from '../lib/tikhub'
```

Both `getAdapter('douyin')` and `getAdapter('xiaohongshu')` return fully wired adapter instances. The `parseUrl` round-trip (`detectPlatform → getAdapter`) works as designed.

---
*Phase: 14-data-acquisition-layer*
*Completed: 2026-04-05*

## Self-Check: PASSED

- FOUND: apps/web/src/lib/tikhub/adapters/index.ts
- FOUND: apps/web/src/lib/tikhub/index.ts
- FOUND: apps/web/src/worker/data-acquisition-smoke-test.ts
- FOUND: .planning/phases/14-data-acquisition-layer/14-04-SUMMARY.md
- FOUND commit: 923ffda (feat: adapters/index.ts)
- FOUND commit: 2702f84 (feat: index.ts + smoke test)
