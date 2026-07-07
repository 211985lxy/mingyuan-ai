---
phase: 14-data-acquisition-layer
plan: "02"
subsystem: api
tags: [tikhub, douyin, platform-adapter, typescript]

# Dependency graph
requires:
  - phase: 14-01
    provides: PlatformAdapter interface and tikhubGet client function from types.ts and client.ts
provides:
  - DouyinAdapter class implementing all 5 PlatformAdapter methods
  - Internal TikHub wire types for Douyin API response shapes
affects:
  - 14-03 (XiaohongshuAdapter — same pattern)
  - 15-pipeline (getAdapter('douyin') uses this adapter to drive scrape step)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Platform adapter pattern: class implements PlatformAdapter, all TikHub errors bubble up to pipeline"
    - "Cursor-based pagination: fetchVideos loops until results.length >= count or has_more === 0"
    - "Batch chunking: fetchVideoStats splits >50 IDs into chunks of 50 per API call"
    - "Internal wire types: private interfaces in adapter file for TikHub response shapes (not exported)"

key-files:
  created:
    - apps/web/src/lib/tikhub/adapters/douyin.ts
  modified: []

key-decisions:
  - "DouyinAdapter lets TikHubError propagate without catching — pipeline (Phase 15) handles failures"
  - "resolveUrl always calls TikHub resolver regardless of URL form — endpoint is the canonical resolver"
  - "fetchVideos page size fixed at 20 (TikHub App V3 limit)"
  - "fetchComments single-page only, capped at min(count, 20) — spec states 20 per call is sufficient"

patterns-established:
  - "Adapter wire types: define DouyinXxx interfaces privately in adapter file, not in types.ts"
  - "Optional chaining: access all nested API fields via ?. with ?? 0 / ?? '' fallbacks"

requirements-completed: [DATA-02, DATA-03, DATA-04, DATA-05]

# Metrics
duration: 2min
completed: 2026-04-05
---

# Phase 14 Plan 02: Douyin Adapter Summary

**DouyinAdapter implementing all 5 PlatformAdapter methods using TikHub App V3 endpoints with cursor pagination, 50-ID batch stats, and typed internal wire types**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-05T07:24:37Z
- **Completed:** 2026-04-05T07:26:37Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- DouyinAdapter class with `implements PlatformAdapter` satisfying the full contract
- `resolveUrl` calls `/api/v1/douyin/web/get_sec_user_id` for canonical sec_user_id from any Douyin URL form
- `fetchAccount` maps TikHub user profile to NormalizedAccount (handles string total_favorited via Number())
- `fetchVideos` cursor-based pagination using max_cursor, stops at count or has_more === 0, slices to exact count
- `fetchVideoStats` chunks videoIds into batches of 50, builds Map<string, VideoStats>
- `fetchComments` single-page call capped at min(count, 20)
- All internal TikHub response wire types defined privately in the adapter file

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement DouyinAdapter with all 5 PlatformAdapter methods** - `41b7ae4` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `apps/web/src/lib/tikhub/adapters/douyin.ts` - DouyinAdapter class with full PlatformAdapter implementation

## Decisions Made

- DouyinAdapter does not catch errors — lets TikHubError propagate to Phase 15 pipeline layer
- `resolveUrl` always calls the TikHub resolver API regardless of URL shape (canonical approach per plan)
- Duration field from Douyin API is in milliseconds, divided by 1000 and rounded
- `total_favorited` wrapped with `Number()` since TikHub may return it as a string

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- DouyinAdapter is complete and ready for use via `getAdapter('douyin')` in Phase 15 pipeline
- Plan 14-03 (XiaohongshuAdapter) can proceed using the same adapter pattern established here

---
*Phase: 14-data-acquisition-layer*
*Completed: 2026-04-05*
