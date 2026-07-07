---
phase: 08-enhancement-pipeline
plan: 02
subsystem: enhancement-pipeline
tags: [cron, polling, backup-detection, zombie-expiry, aliyun-viapi]
requires: [07-02, runTaskRecoveryPass, Aliyun VIAPI SDK]
provides: [runEnhancementRecoveryPass, /api/cron/poll-enhancements, cron-poll-enhancements]
affects: [task-recovery, cron-infrastructure]
tech_stack:
  added: []
  patterns: [cron-polling, redis-locks, zombie-expiry]
key_files:
  created:
    - apps/web/src/app/api/cron/poll-enhancements/route.ts
  modified:
    - apps/web/src/lib/task-recovery.ts
    - k8s/cronjobs.yaml
decisions:
  - Use separate runEnhancementRecoveryPass function instead of integrating into runTaskRecoveryPass to avoid slowing down Shanjian task polling (Aliyun API calls take 1-5s each)
  - Use namespaced Redis lock keys (poll:enhancement:) to prevent collision with existing poll: keys
  - Check enhancementStartedAt (not updatedAt) for zombie timeout to ensure accurate 2-hour window
  - Set ENHANCEMENT_POLL_DELAY_MS to 2 minutes matching K8s cron schedule
  - Use 60-second timeout for cron endpoint matching Aliyun API latency expectations
metrics:
  duration_minutes: 4
  tasks_completed: 2
  files_modified: 3
  commits: 2
completed_at: "2026-04-01T13:47:04Z"
---

# Phase 08 Plan 02: Enhancement Polling & Zombie Expiry Summary

**One-liner:** Webhook backup polling for Aliyun 4K enhancement jobs with 2-minute cycle and 2-hour zombie expiry using dedicated cron infrastructure.

## What Was Built

Added enhancement polling, zombie expiry, and K8s cron job for backup detection of enhancement completion. This provides resilience against webhook failures (network issues, Aliyun outage, misconfigured callback URL) by polling Aliyun API every 2 minutes for in-progress enhancements and expiring zombies stuck >2 hours.

**Key components:**

1. **runEnhancementRecoveryPass** — New exported function in task-recovery.ts that:
   - Polls stale enhancement jobs (processing >2 mins) via Aliyun `getEnhancementJobResult`
   - Settles completed/failed jobs using Phase 7's `settleEnhancementSuccess`/`settleEnhancementFailure`
   - Expires zombie enhancements stuck in processing >2 hours with `ENHANCEMENT_TIMEOUT` error code
   - Uses namespaced Redis locks (`poll:enhancement:`) to prevent concurrent processing

2. **/api/cron/poll-enhancements** — Dedicated cron endpoint with CRON_SECRET auth that calls runEnhancementRecoveryPass

3. **cron-poll-enhancements** — K8s CronJob running every 2 minutes with Forbid concurrency policy, matching poll-tasks pattern

## Deviations from Plan

None — plan executed exactly as written.

## Tasks Completed

### Task 1: Add enhancement polling and zombie expiry to task-recovery.ts

**Status:** ✓ Complete
**Commit:** `91ca63d`
**Files modified:** `apps/web/src/lib/task-recovery.ts`

Added:
- Imports for `getEnhancementJobResult`, `settleEnhancementSuccess`, `settleEnhancementFailure`
- Constants: `ENHANCEMENT_ZOMBIE_TIMEOUT_MS` (2 hours), `ENHANCEMENT_POLL_DELAY_MS` (2 minutes)
- New exported function `runEnhancementRecoveryPass` with `EnhancementRecoverySummary` return type
- Polling logic: queries `enhancementStatus: "processing"` with `enhancementJobId` not null, updated >2 mins ago
- Settlement: calls Phase 7 primitives for completed/failed jobs
- Zombie expiry: checks `enhancementStartedAt` older than 2 hours, marks as `ENHANCEMENT_TIMEOUT`
- Redis locks: uses `poll:enhancement:${jobId}` namespace to avoid collision with Shanjian `poll:` keys

**CRITICAL: Existing `runTaskRecoveryPass` is untouched** — enhancement polling is isolated to avoid slowing down Shanjian task recovery.

### Task 2: Create poll-enhancements cron endpoint and K8s CronJob

**Status:** ✓ Complete
**Commit:** `33d96f4`
**Files created:** `apps/web/src/app/api/cron/poll-enhancements/route.ts`
**Files modified:** `k8s/cronjobs.yaml`

**Cron endpoint:**
- Pattern matches `/api/cron/poll-tasks` exactly
- Validates CRON_SECRET before processing
- Calls `runEnhancementRecoveryPass({ trigger: "cron" })`
- Returns polled summary in JSON response
- Runtime: nodejs, maxDuration: 60 seconds

**K8s CronJob:**
- Schedule: `*/2 * * * *` (every 2 minutes)
- Concurrency: Forbid (prevents overlapping runs)
- Timeout: 60 seconds (matching endpoint maxDuration)
- HTTP GET to `/api/cron/poll-enhancements` with CRON_SECRET auth
- Resources: 250m CPU / 256Mi memory (same as poll-tasks)

## Verification Results

✓ TypeScript compilation passes
✓ `runEnhancementRecoveryPass` exported from task-recovery.ts
✓ Enhancement polling queries `enhancementStatus: "processing"`
✓ Zombie expiry checks `enhancementStartedAt` (not updatedAt)
✓ Redis lock keys use `poll:enhancement:` namespace
✓ Cron endpoint validates CRON_SECRET
✓ K8s cronjobs.yaml has valid YAML with `cron-poll-enhancements` entry
✓ All acceptance criteria met for both tasks

## Known Stubs

None. This plan adds backup polling infrastructure — all enhancement settlement logic delegates to Phase 7 primitives which are already implemented and tested.

## Integration Points

**Consumes from Phase 7:**
- `getEnhancementJobResult` (Aliyun VIAPI SDK wrapper)
- `settleEnhancementSuccess` (OSS transfer + DB update)
- `settleEnhancementFailure` (error recording)

**Provides to Phase 9:**
- `runEnhancementRecoveryPass` for manual recovery if needed
- Cron infrastructure for automatic polling every 2 minutes

**Pattern alignment:**
- Mirrors existing poll-tasks pattern (same cron schedule, concurrency policy, auth)
- Reuses Redis lock strategy from Shanjian task recovery
- Follows zombie expiry pattern (timeout → settle as failed)

## Self-Check

**Files created:**
- `apps/web/src/app/api/cron/poll-enhancements/route.ts` — ✓ EXISTS

**Files modified:**
- `apps/web/src/lib/task-recovery.ts` — ✓ EXISTS
- `k8s/cronjobs.yaml` — ✓ EXISTS

**Commits:**
- `91ca63d` — ✓ EXISTS (feat: add enhancement polling and zombie expiry to task-recovery)
- `33d96f4` — ✓ EXISTS (feat: add poll-enhancements cron endpoint and K8s CronJob)

**Exports verified:**
- `runEnhancementRecoveryPass` — ✓ EXPORTED from task-recovery.ts
- `EnhancementRecoverySummary` — ✓ EXPORTED type from task-recovery.ts

**Self-Check: PASSED**

## Next Steps

**For Phase 08 Plan 03 (if exists):** Continue enhancement pipeline implementation.

**For Phase 09 (Frontend 4K UI):** UI can now safely assume:
- Enhancements will be polled every 2 minutes if webhook fails
- Zombies will be expired after 2 hours
- `enhancementStatus` field is reliable for displaying 4K badge/progress

**Deployment checklist:**
1. Deploy updated `task-recovery.ts` and `/api/cron/poll-enhancements` endpoint
2. Apply `k8s/cronjobs.yaml` to create `cron-poll-enhancements` job
3. Verify K8s CronJob runs successfully (`kubectl get cronjobs`, `kubectl logs`)
4. Monitor logs for `[enhancement-recovery:cron]` entries
5. Verify Aliyun VIAPI polling works with real enhancement jobs

---

*Completed: 2026-04-01 at 13:47:04 UTC — Duration: 4 minutes*
