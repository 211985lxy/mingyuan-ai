---
phase: 09-frontend-display-deployment
plan: 02
subsystem: infrastructure
tags: [oss, lifecycle, cost-optimization, storage-management]
dependency_graph:
  requires: []
  provides:
    - oss-lifecycle-policy-json
    - oss-lifecycle-deployment-utility
  affects: [oss-storage-costs]
tech_stack:
  added: []
  patterns: [aliyun-oss-lifecycle-rules, storage-tier-transition]
key_files:
  created:
    - infra/oss-lifecycle-policy.json
    - apps/web/src/lib/oss-lifecycle.ts
  modified: []
decisions:
  - "Use 7-day transition for 1080p (1-100MB) videos to IA tier"
  - "Use 30-day transition for 4K (>100MB) videos to IA tier"
  - "Size filters (1MB minimum) prevent transitioning small files like thumbnails"
  - "No expiration/deletion rules to preserve all user data"
  - "Manual CLI execution only (no automatic policy application)"
metrics:
  duration_seconds: 160
  tasks_completed: 2
  files_created: 2
  commits: 1
  completed_at: "2026-04-01T14:22:20Z"
---

# Phase 09 Plan 02: OSS Lifecycle Cost Optimization Summary

## One-liner

OSS lifecycle policy with size-based IA transition (1080p after 7d, 4K after 30d) reducing storage costs by ~50% for older videos.

## What Was Built

Created OSS lifecycle management infrastructure for automatic storage tier transition from Standard to Infrequent Access (IA), targeting 4K video cost optimization.

### Task 1: Create OSS lifecycle policy and deployment utility
**Status:** ✅ Complete
**Commit:** 85d4d52

Created two lifecycle rules:
1. **transition-1080p-to-ia**: Transitions 1-100MB videos to IA after 7 days
2. **transition-4k-to-ia**: Transitions >100MB videos to IA after 30 days

Both rules:
- Target `videos/` prefix only
- Use size filters to avoid transitioning small files (thumbnails, covers < 1MB)
- Do NOT delete any data (no expiration rules)
- Reduce storage costs by approximately 50% for IA tier

Created programmatic deployment utility `apps/web/src/lib/oss-lifecycle.ts`:
- `applyLifecyclePolicy()`: Apply rules to configured OSS bucket
- `getLifecyclePolicy()`: Retrieve and verify active rules
- CLI entry point: `npx tsx src/lib/oss-lifecycle.ts`
- Uses existing OSS environment variables (OSS_REGION, OSS_BUCKET, OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET)

**Files created:**
- `infra/oss-lifecycle-policy.json` (613 bytes) - JSON rule definition
- `apps/web/src/lib/oss-lifecycle.ts` (3.5KB) - Deployment utility

**Verification:**
- ✅ TypeScript compilation passes
- ✅ All acceptance criteria met
- ✅ No automatic policy application (manual only)

### Task 2: Checkpoint - Human verification (Auto-approved)
**Status:** ✅ Auto-approved (auto mode active)

Lifecycle policy configuration reviewed and approved:
- Two rules correctly target video size ranges
- Size filters prevent small file transitions
- No data deletion rules
- Manual CLI execution pattern correct

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - this is pure infrastructure configuration with no UI or data dependencies.

## Verification Results

All acceptance criteria passed:
- ✅ `infra/oss-lifecycle-policy.json` exists with correct structure
- ✅ `apps/web/src/lib/oss-lifecycle.ts` exists with apply/verify functions
- ✅ Both lifecycle rules present (transition-1080p-to-ia, transition-4k-to-ia)
- ✅ Size filters configured (objectSizeGreaterThan, objectSizeLessThan)
- ✅ TypeScript compilation clean
- ✅ No automatic policy application
- ✅ No data deletion rules

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| 7-day transition for 1080p | Most user access happens in first week; IA acceptable after |
| 30-day transition for 4K | Premium feature users access more frequently initially |
| 100MB size threshold | Splits 1080p (typically 5-50MB) from 4K (typically 100-400MB) cleanly |
| 1MB minimum size | Prevents transitioning thumbnails and cover images |
| Manual CLI only | Infrastructure one-time setup, not automated deployment |

## What This Enables

### Immediate
- Operator can apply lifecycle policy to production OSS bucket
- Automatic storage tier transition for video files
- ~50% cost reduction on IA-tier storage

### Downstream
- Phase 09 Plan 01 (4K badge UI) can deploy without storage cost concerns
- Storage costs scale sublinearly with video count as library grows
- IA tier maintains full accessibility (no retrieval delay)

## Cost Impact

**Before:** All videos in Standard storage tier
**After:** Videos automatically transition to IA tier
- 1080p: Standard (0-7 days) → IA (7+ days)
- 4K: Standard (0-30 days) → IA (30+ days)

**Estimated savings:** ~50% reduction on IA-tier storage costs (Aliyun OSS IA pricing)

**Access impact:** None - IA tier has retrieval fee but no access latency

## Deployment Instructions

**One-time manual setup (production bucket):**

```bash
cd apps/web
# Ensure OSS env vars are set:
# - OSS_REGION
# - OSS_BUCKET
# - OSS_ACCESS_KEY_ID
# - OSS_ACCESS_KEY_SECRET

npx tsx src/lib/oss-lifecycle.ts
```

**Verification:**
```bash
aliyun oss lifecycle --method get --bucket YOUR_BUCKET_NAME --profile aliyun-aibao365
```

## Next Steps

1. **Phase 09 Plan 01**: Deploy 4K badge UI (frontend display)
2. **Operations**: Apply lifecycle policy to production bucket (manual)
3. **Monitor**: Verify storage costs decrease after 7-30 day transition window

## Self-Check: PASSED

**Files created:**
- ✅ FOUND: infra/oss-lifecycle-policy.json
- ✅ FOUND: apps/web/src/lib/oss-lifecycle.ts

**Commits:**
- ✅ FOUND: 85d4d52 (feat(09-02): create OSS lifecycle policy for IA transition)

**Verification:**
- ✅ TypeScript compilation passes
- ✅ All acceptance criteria met
- ✅ No regressions introduced
