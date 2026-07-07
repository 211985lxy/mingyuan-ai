---
phase: 08-enhancement-pipeline
plan: 01
subsystem: video-enhancement
tags: [enhancement, webhook, aliyun, pipeline]
dependency_graph:
  requires: [07-02]
  provides: [enhancement-trigger, webhook-handler]
  affects: [video-task-lifecycle]
tech_stack:
  added: []
  patterns: [fire-and-forget, webhook-deduplication, namespaced-redis-keys]
key_files:
  created:
    - apps/web/src/app/api/webhook/aliyun-enhancement/route.ts
  modified:
    - apps/web/src/lib/video-task-settlement.ts
decisions:
  - title: "Fire-and-forget enhancement trigger"
    rationale: "Enhancement failure must never block 1080p delivery (per ENHANCE-04)"
    alternatives: ["Await enhancement result", "Queue for async processing"]
    chosen: "Fire-and-forget with .catch()"
  - title: "Namespaced Redis deduplication keys"
    rationale: "Prevent collision with Shanjian webhook keys which use 'webhook:' prefix"
    impact: "Both webhook systems can safely use Redis SET NX without conflicts"
  - title: "Poll Aliyun API on webhook success"
    rationale: "Webhook payload format unverified — polling guarantees we get videoUrl"
    alternatives: ["Trust webhook payload", "Skip webhook, polling-only"]
    chosen: "Webhook + polling hybrid"
metrics:
  duration_seconds: 182
  completed_at: "2026-04-01T21:54:13Z"
  tasks_completed: 2
  files_created: 1
  files_modified: 1
---

# Phase 08 Plan 01: Enhancement Pipeline Integration Summary

**One-liner:** Auto-trigger 4K enhancement after 1080p delivery completion with webhook-based asynchronous settlement using namespaced Redis deduplication.

## What Was Built

Wired the enhancement trigger into the video task completion path and created the Aliyun webhook endpoint for enhancement callbacks. This connects Phase 7's enhancement primitives to the actual video generation lifecycle.

**Core integration:**
- `settleVideoTaskSuccess` now calls `triggerVideoEnhancement` in fire-and-forget mode when delivery is durable and videoUrl is managed OSS
- New webhook endpoint `/api/webhook/aliyun-enhancement` receives Aliyun callbacks, deduplicates via Redis, and settles enhancement status
- Enhancement trigger failure never blocks 1080p video delivery

**Key guarantees:**
- 1080p `videoUrl` is never modified by any enhancement code path
- Duplicate webhooks are silently ignored via Redis SET NX with 24h expiry
- Webhook always returns 200 to prevent Aliyun retry storms
- Enhancement trigger only fires when `deliveryStatus === "durable"` AND `isManagedOssUrl(videoUrl)` — degraded deliveries don't trigger enhancement

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Wire enhancement trigger into settleVideoTaskSuccess | 7eaf08a | apps/web/src/lib/video-task-settlement.ts |
| 2 | Create Aliyun enhancement webhook handler | d91f317 | apps/web/src/app/api/webhook/aliyun-enhancement/route.ts |

## Technical Implementation

### Enhancement Trigger (Task 1)

Modified `video-task-settlement.ts`:
```typescript
// Fire-and-forget after releaseSlot(), before final return
if (archived.deliveryStatus === "durable" && isManagedOssUrl(archived.videoUrl)) {
  triggerVideoEnhancement({
    taskId: input.taskId,
    sourceVideoUrl: archived.videoUrl,
  }).catch((err) => {
    console.error(`[enhancement] Failed to trigger for task ${input.taskId}:`, err);
  });
}
```

**Critical constraints met:**
- Non-blocking: no `await` before `triggerVideoEnhancement`
- Error handling: `.catch()` prevents unhandled rejection
- Conditional: only triggers for durable OSS URLs
- Positioned: after slot release, before final return

### Webhook Handler (Task 2)

Created `/api/webhook/aliyun-enhancement` endpoint following Shanjian webhook pattern:
- **Redis deduplication:** Namespaced key `webhook:enhancement:${jobId}` prevents collision with Shanjian's `webhook:${taskId}` keys
- **Lookup:** Finds VideoTask by `enhancementJobId` field (set by Phase 7's `triggerVideoEnhancement`)
- **Success path:** Polls Aliyun API via `getEnhancementJobResult()` to get full result with videoUrl, then calls `settleEnhancementSuccess()` which handles OSS transfer
- **Failure path:** Calls `settleEnhancementFailure()` with error code/message
- **Missing videoUrl:** If success webhook arrives but API poll returns no videoUrl, settles as failure with `MISSING_VIDEO_URL` code
- **Always 200:** Returns success even on errors to prevent Aliyun retry storms
- **maxDuration=60:** Allows OSS transfer of large 4K videos within settlement function

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

**TypeScript compilation:** ✓ Passed
**All acceptance criteria:** ✓ Passed

**Verified:**
1. Enhancement trigger is fire-and-forget (no `await`)
2. Webhook endpoint exists at `/api/webhook/aliyun-enhancement` with POST handler
3. Redis dedup uses `webhook:enhancement:` namespace
4. No code path modifies `videoUrl` field — only enhancement fields

## Known Stubs

None — all integrations use real APIs and real database operations.

## Integration Points

**Upstream dependencies (Phase 7):**
- `triggerVideoEnhancement()` — marks pending, submits to Aliyun, stores jobId
- `settleEnhancementSuccess()` — transfers from temp URL, generates 4K cover, updates DB
- `settleEnhancementFailure()` — marks failed with error code/message
- `getEnhancementJobResult()` — polls Aliyun API for job status and videoUrl

**Downstream consumers:**
- Phase 08 Plan 02 (polling recovery) — catches jobs webhook missed
- Phase 09 (frontend display) — shows 4K badge when `enhanced4kUrl` is set

**Data flow:**
1. Video completes 1080p delivery with durable status
2. `settleVideoTaskSuccess` fires enhancement trigger (non-blocking)
3. `triggerVideoEnhancement` submits to Aliyun, stores `enhancementJobId`
4. Aliyun processes video (5-15 minutes typical)
5. Aliyun sends webhook to `/api/webhook/aliyun-enhancement`
6. Webhook deduplicates, polls API for full result, settles via Phase 7 functions
7. `settleEnhancementSuccess` transfers 4K video to OSS, generates cover, updates DB
8. Frontend can now display 4K badge and serve enhanced video

## Testing Notes

**Manual verification steps:**
1. Complete a video task with durable delivery (OSS URL)
2. Check database: `enhancementStatus` should be `pending`, then `processing`, then `completed` or `failed`
3. Check Redis: `webhook:enhancement:${jobId}` key should exist with 24h TTL
4. Send duplicate webhook: should return 200 immediately, skip processing
5. Check 1080p URL: should remain unchanged throughout enhancement lifecycle

**Edge cases covered:**
- Degraded delivery (temporary URL) — no enhancement trigger
- Webhook arrives before jobId stored — polling will catch it (per Phase 7 two-phase trigger)
- Webhook duplicate — Redis dedup silently ignores
- Enhancement API failure — logged, 1080p delivery unaffected
- OSS transfer failure — marked as `TRANSFER_FAILED`, 1080p unaffected

## Performance Metrics

- **Execution time:** 182 seconds (~3 minutes)
- **Tasks completed:** 2/2
- **Files created:** 1
- **Files modified:** 1
- **TypeScript errors:** 0

## Next Steps

**Immediate (Phase 08 Plan 02):**
- Polling recovery cron for jobs webhook missed
- Stale job cleanup after 24h timeout

**Future (Phase 09):**
- Frontend 4K badge display
- 4K video playback UI

## Self-Check: PASSED

✓ File created: `apps/web/src/app/api/webhook/aliyun-enhancement/route.ts`
✓ File modified: `apps/web/src/lib/video-task-settlement.ts`
✓ Commit 7eaf08a exists: feat(08-01): wire enhancement trigger into settleVideoTaskSuccess
✓ Commit d91f317 exists: feat(08-01): create Aliyun enhancement webhook handler
✓ TypeScript compilation passes
✓ All acceptance criteria verified
