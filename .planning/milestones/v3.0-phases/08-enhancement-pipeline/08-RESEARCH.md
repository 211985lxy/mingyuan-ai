# Phase 8: Enhancement Pipeline - Research

**Researched:** 2026-04-01
**Domain:** Async 4K video enhancement pipeline integration
**Confidence:** HIGH

## Summary

Phase 8 wires Phase 7's enhancement modules into ClipFlow's existing video pipeline. The goal is to automatically trigger 4K enhancement after 1080p delivery completes, run enhancement asynchronously with independent lifecycle tracking, detect completion via webhook with polling backup, and preserve 1080p access on any failure.

Phase 7 built the foundation: Aliyun VIAPI SDK integration, database schema with 9 nullable enhancement fields, API client (`aliyun-enhancement.ts`), and lifecycle module (`video-task-enhancement.ts`) with race-condition-safe triggering, OSS transfer with retry, and additive 4K storage. Phase 8 must integrate these modules into the existing Shanjian video pipeline.

**Primary recommendation:** Follow the existing webhook + polling dual strategy pattern from Shanjian integration. Enhancement trigger must be fire-and-forget (non-blocking) after 1080p delivery is durable. Webhook handler and polling cron should reuse existing patterns with enhancement-specific namespacing. Zombie expiry must be added to existing `task-recovery.ts` to expire enhancement jobs stuck in "processing" for >2 hours.

## Project Constraints (from CLAUDE.md)

### Zero Mock Rule
- No mock, fake, stub, fixture fallback, demo data fallback, or simulated provider in production code, preview flows, admin flows, and test acceptance flows
- Must use real APIs (Aliyun VIAPI), real databases (Prisma), real storage (OSS), and real external services
- If real dependency is missing or broken, report blocker and fix environment — do NOT hide with mock behavior

### UI Rules
- All UI-related work must invoke `ui-ux-pro-max` skill first
- UI components must use `shadcn/ui` only
- **Note:** Phase 8 has no UI work (deferred to Phase 9)

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ENHANCE-01 | System automatically triggers 4K enhancement after video task reaches completed+durable status | Enhancement trigger wired into `settleVideoTaskSuccess()` after OSS transfer confirms durable delivery |
| ENHANCE-02 | Enhancement lifecycle uses independent enhancementStatus field (none/pending/processing/completed/failed) that never blocks 1080p video delivery | Phase 7 already implemented separate `enhancementStatus` field and additive `enhanced4kUrl` — Phase 8 integration preserves this separation |
| ENHANCE-03 | Enhancement completion is detected via webhook handler with Redis dedup, backed by cron poll every 2 minutes | Webhook pattern reuses existing Shanjian webhook structure; polling pattern reuses existing `task-recovery.ts` with enhancement-specific queries |
| ENHANCE-04 | Enhancement failures preserve original 1080p videoUrl unchanged — user always has working video | Phase 7 lifecycle module already implements this — `settleEnhancementFailure()` never writes to `videoUrl`, only to enhancement fields |
| INFRA-02 | Aliyun credentials stored in K8s Secrets, enhancement poll cron job deployed every 2 minutes | K8s Secret pattern matches existing `clipflow-web-secrets`; cron job pattern matches existing `k8s/cronjobs.yaml` structure |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @alicloud/videoenhan20200320 | 4.0.0 | Aliyun Video Enhancement API client | Official Aliyun SDK for video quality enhancement, already installed in Phase 7 |
| @alicloud/openapi-core | ^2.4.4 | Aliyun OpenAPI configuration | Required dependency for SDK initialization with $OpenApiUtil.Config |
| Prisma | (existing) | Database ORM | Already used throughout ClipFlow for VideoTask schema operations |
| Redis | (existing) | Webhook deduplication and locks | Already used for `webhook:${taskId}` dedup keys, task recovery locks |
| ali-oss | (existing) | OSS storage client | Already used for video/cover transfer to OSS |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Next.js API Routes | (existing) | Webhook and cron endpoints | Used for `/api/webhook/*` and `/api/cron/*` patterns |
| Kubernetes CronJob | (existing) | Scheduled polling | Used for `/api/cron/poll-tasks` every 2 minutes |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Webhook + polling dual strategy | Polling only | Webhook provides immediate feedback (faster UX), polling is backup. Polling-only adds 0-2 min latency. Webhook-only is unreliable (network failures, missed callbacks). Dual strategy is proven pattern in existing codebase. |
| Enhancement cron polling | Aliyun event notifications | Aliyun VIAPI may not support event notifications (unverified). Polling is simpler to implement and debug. |
| Separate webhook endpoint | Reuse existing `/api/webhook/shanjian` | Separate endpoint provides isolation (enhancement failures don't affect Shanjian webhooks), clearer logs, and easier rate limiting. Minimal added complexity. |

**Installation:**
All dependencies already installed in Phase 7. No additional packages needed.

**Version verification:**
```bash
npm view @alicloud/videoenhan20200320 version
# Output: 4.0.0 (verified 2026-04-01)
```

## Architecture Patterns

### Recommended Project Structure
```
apps/web/src/
├── lib/
│   ├── aliyun-enhancement.ts         # [Phase 7] API client
│   ├── video-task-enhancement.ts     # [Phase 7] Lifecycle module
│   ├── video-task-settlement.ts      # [Phase 8] Trigger integration HERE
│   └── task-recovery.ts              # [Phase 8] Zombie expiry + polling HERE
├── app/api/
│   ├── webhook/
│   │   ├── shanjian/route.ts         # [Existing] Pattern to follow
│   │   └── aliyun-enhancement/       # [Phase 8] NEW webhook handler
│   │       └── route.ts
│   └── cron/
│       ├── poll-tasks/route.ts       # [Existing] Calls runTaskRecoveryPass
│       └── poll-enhancements/        # [Phase 8] NEW polling endpoint
│           └── route.ts
k8s/
└── cronjobs.yaml                      # [Phase 8] Add poll-enhancements cron job
```

### Pattern 1: Enhancement Trigger (After 1080p Delivery)
**What:** Automatically trigger enhancement when video task reaches `completed` status and `deliveryStatus: "durable"`

**When to use:** After `settleVideoTaskSuccess()` completes OSS transfer and confirms durable storage

**Example:**
```typescript
// In video-task-settlement.ts, after archiveVideoTaskOutput succeeds

export async function settleVideoTaskSuccess(input: {
  taskId: string;
  result: SuccessfulResult;
  source: Exclude<VideoTaskSettlementSource, "submission_compensation">;
}) {
  const task = await findTask(input.taskId);
  if (!task) return null;
  if (isTerminalVideoTaskStatus(task.status)) return task;
  if (!input.result.videoUrl) return task;

  const archived = await archiveVideoTaskOutput({
    taskId: input.taskId,
    result: input.result,
  });

  const updated = await prisma.videoTask.updateMany({
    where: {
      id: input.taskId,
      status: { in: [...ACTIVE_VIDEO_TASK_STATUSES] },
    },
    data: {
      status: "completed",
      videoUrl: archived.videoUrl,
      coverUrl: archived.coverUrl,
      duration: input.result.duration ?? null,
      completedAt: new Date(),
      errorCode: null,
      errorMessage: null,
      deliveryStatus: archived.deliveryStatus,
      deliveryWarning: archived.deliveryWarning,
      deliveryExpiresAt: archived.deliveryExpiresAt,
    },
  });

  if (updated.count > 0 && (task.status === "pending" || task.status === "processing")) {
    await releaseSlot();
  }

  // NEW: Trigger enhancement if delivery is durable and video is in OSS
  if (archived.deliveryStatus === "durable" && isManagedOssUrl(archived.videoUrl)) {
    triggerVideoEnhancement({
      taskId: input.taskId,
      sourceVideoUrl: archived.videoUrl,
    }).catch((err) => {
      console.error(`[enhancement] Failed to trigger for task ${input.taskId}:`, err);
      // Do NOT block video completion — enhancement is best-effort
    });
  }

  return findTask(input.taskId);
}
```

**Source:** Derived from existing `settleVideoTaskSuccess()` pattern and Phase 7's `triggerVideoEnhancement()` design

### Pattern 2: Webhook Handler with Redis Deduplication
**What:** Webhook endpoint that receives Aliyun enhancement job completion callbacks, deduplicates with Redis, and settles enhancement status

**When to use:** When Aliyun VIAPI sends job completion notification (if webhook support is available)

**Example:**
```typescript
// apps/web/src/app/api/webhook/aliyun-enhancement/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import {
  settleEnhancementSuccess,
  settleEnhancementFailure,
} from "@/lib/video-task-enhancement";
import { getEnhancementJobResult } from "@/lib/aliyun-enhancement";

export const runtime = "nodejs";
export const maxDuration = 60;

type WebhookPayload = {
  jobId: string;
  status: "PROCESS_SUCCESS" | "PROCESS_FAIL" | string;
  result?: {
    videoUrl?: string;
  };
  errorCode?: string;
  errorMessage?: string;
};

export async function POST(request: NextRequest) {
  let payload: WebhookPayload;
  try {
    payload = (await request.json()) as WebhookPayload;
  } catch (error) {
    console.warn("[webhook:aliyun-enhancement] Payload parse failed");
    return NextResponse.json({ ok: true });
  }

  const { jobId, status } = payload;

  if (!jobId) {
    console.warn("[webhook:aliyun-enhancement] Webhook received without jobId");
    return NextResponse.json({ ok: true });
  }

  // Redis dedup: SET NX with 24h expiry (namespaced to avoid collision with Shanjian)
  try {
    const set = await redis.set(`webhook:enhancement:${jobId}`, "1", "EX", 86400, "NX");
    if (!set) {
      console.info(`[webhook:aliyun-enhancement] Duplicate webhook for jobId=${jobId}, skipping`);
      return NextResponse.json({ ok: true });
    }
  } catch (error) {
    console.warn(`[webhook:aliyun-enhancement] Redis dedup failed for jobId=${jobId}, continuing`);
  }

  try {
    // Find video task by enhancement job ID
    const videoTask = await prisma.videoTask.findFirst({
      where: { enhancementJobId: jobId },
    });

    if (!videoTask) {
      console.warn(`[webhook:aliyun-enhancement] No video task found for jobId=${jobId}`);
      return NextResponse.json({ ok: true });
    }

    if (status === "PROCESS_SUCCESS") {
      // Poll Aliyun API to get full result (webhook may not include video URL)
      const result = await getEnhancementJobResult(jobId);
      if (!result.videoUrl) {
        console.warn(`[webhook:aliyun-enhancement] Success webhook for ${videoTask.id} but no videoUrl`);
        await settleEnhancementFailure({
          taskId: videoTask.id,
          errorCode: "MISSING_VIDEO_URL",
          errorMessage: "Enhancement completed but no video URL returned",
        });
        return NextResponse.json({ ok: true });
      }

      await settleEnhancementSuccess({
        taskId: videoTask.id,
        temporaryVideoUrl: result.videoUrl,
      });
    } else if (status === "PROCESS_FAIL") {
      await settleEnhancementFailure({
        taskId: videoTask.id,
        errorCode: payload.errorCode ?? "ENHANCEMENT_FAILED",
        errorMessage: payload.errorMessage ?? "Enhancement processing failed",
      });
    }
  } catch (error) {
    console.error(`[webhook:aliyun-enhancement] Processing failed for jobId=${jobId}:`, error);
  }

  return NextResponse.json({ ok: true });
}
```

**Source:** Adapted from existing `/api/webhook/shanjian/route.ts` pattern with enhancement-specific namespacing

### Pattern 3: Polling Cron with Zombie Expiry
**What:** Backup polling mechanism that queries Aliyun API for enhancement jobs stuck in "processing" status, and expires zombie jobs >2 hours old

**When to use:** Every 2 minutes as backup to webhook, and to catch jobs where webhook was lost/delayed

**Example:**
```typescript
// In task-recovery.ts, add to runTaskRecoveryPass

// Find enhancement jobs stuck in "processing" for >2 minutes
const staleEnhancements = await prisma.videoTask.findMany({
  where: {
    enhancementStatus: "processing",
    enhancementJobId: { not: null },
    updatedAt: { lt: new Date(now.getTime() - 2 * 60 * 1000) },
  },
  take: 50,
});

let enhancementsPolled = 0;

for (const task of staleEnhancements) {
  const locked = await acquireTaskRecoveryLock(`poll:enhancement:${task.enhancementJobId}`);
  if (!locked) continue;

  try {
    const result = await getEnhancementJobResult(task.enhancementJobId!);

    if (result.status === "PROCESS_SUCCESS") {
      if (!result.videoUrl) {
        await settleEnhancementFailure({
          taskId: task.id,
          errorCode: "MISSING_VIDEO_URL",
          errorMessage: "Enhancement completed but no video URL returned",
        });
        continue;
      }

      await settleEnhancementSuccess({
        taskId: task.id,
        temporaryVideoUrl: result.videoUrl,
      });
    } else if (result.status === "PROCESS_FAIL") {
      await settleEnhancementFailure({
        taskId: task.id,
        errorCode: result.errorCode ?? "ENHANCEMENT_FAILED",
        errorMessage: result.errorMessage ?? "Enhancement processing failed",
      });
    }
    // else still PROCESSING, check again next cycle

    enhancementsPolled++;
  } catch (error) {
    console.error(`[task-recovery] Failed to poll enhancement for task ${task.id}:`, error);
  }
}

// Zombie expiry: expire enhancement jobs stuck >2 hours
const zombieEnhancements = await prisma.videoTask.findMany({
  where: {
    enhancementStatus: "processing",
    enhancementStartedAt: { lt: new Date(now.getTime() - 2 * 60 * 60 * 1000) },
  },
  take: 20,
});

for (const task of zombieEnhancements) {
  try {
    await settleEnhancementFailure({
      taskId: task.id,
      errorCode: "ENHANCEMENT_TIMEOUT",
      errorMessage: "4K enhancement processing timeout (>2 hours)",
    });
    console.warn(`${logPrefix} Expired zombie enhancement for task ${task.id}`);
  } catch (error) {
    console.error(`${logPrefix} Failed to expire zombie enhancement for task ${task.id}:`, error);
  }
}

return {
  avatars: avatarsPolled,
  videos: videosPolled,
  voices: voicesPolled,
  voiceRepairs,
  demoRepairs,
  demos: demosPolled,
  orphanedPendingExpired,
  enhancements: enhancementsPolled, // NEW
};
```

**Source:** Adapted from existing `runTaskRecoveryPass()` pattern for video tasks and avatar cloning

### Anti-Patterns to Avoid

**Anti-Pattern 1: Blocking 1080p delivery on enhancement trigger**
```typescript
// WRONG: Await enhancement trigger
await settleVideoTaskSuccess(...)
await triggerVideoEnhancement(...) // BLOCKS if Aliyun API is slow!
```
Why it's bad: Enhancement API call may be slow (1-5 seconds) or fail. User waits unnecessarily for 1080p video.

Do this instead:
```typescript
// CORRECT: Fire-and-forget with catch
await settleVideoTaskSuccess(...)
triggerVideoEnhancement(...).catch(err => {
  console.error('Enhancement trigger failed:', err)
  // Non-blocking — 1080p already delivered
})
```

**Anti-Pattern 2: Webhook key collision with Shanjian**
```typescript
// WRONG: Reuse same Redis key format
await redis.set(`webhook:${jobId}`, "1", "EX", 86400, "NX")
```
Why it's bad: If Aliyun jobId collides with Shanjian taskId (unlikely but possible), webhook dedup fails.

Do this instead:
```typescript
// CORRECT: Namespace enhancement webhooks
await redis.set(`webhook:enhancement:${jobId}`, "1", "EX", 86400, "NX")
```

**Anti-Pattern 3: No zombie expiry for enhancement jobs**
Why it's bad: If Aliyun webhook is lost and polling fails, enhancement stays "processing" forever. User sees "AI优化中..." indefinitely.

Do this instead: Add zombie expiry to `task-recovery.ts` (see Pattern 3 above).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Webhook deduplication | Custom dedup logic with DB | Redis SET NX with TTL | Existing pattern in Shanjian webhook. Atomic operation prevents race conditions. TTL auto-expires keys. |
| Polling job status | Custom scheduler | K8s CronJob + `/api/cron/*` pattern | Existing pattern in `poll-tasks`. K8s handles scheduling, retries, and resource limits. |
| OSS transfer with retry | Custom retry loop | `transferFromUrlDetailed()` from Phase 7 | Already implements 3-retry logic with exponential backoff, durable detection, and expiry inference. |
| Task recovery locks | Custom lock table | Redis SET NX for lock keys | Existing pattern in `task-recovery.ts`. Atomic operation, auto-expiry, no DB schema changes. |
| Enhancement API client | Raw HTTP requests to Aliyun | Phase 7's `aliyun-enhancement.ts` | Already implements SDK initialization, signed URL generation, and defensive result parsing. |

**Key insight:** Phase 8 is an integration phase. Phase 7 already built the enhancement primitives. Phase 8 should NOT reimplement any enhancement logic — only wire existing modules into the video pipeline using existing patterns from Shanjian integration.

## Common Pitfalls

### Pitfall 1: Enhancement Trigger Race Condition
**What goes wrong:** Aliyun webhook arrives before `enhancementJobId` is saved to database. Webhook handler queries by `jobId`, finds nothing, and drops the webhook. Enhancement is never settled.

**Why it happens:** Phase 7's two-phase trigger (mark `pending` in DB, then call API, then save `jobId`) has a race window between API call acceptance and `jobId` save. If webhook is very fast (unlikely but possible), it arrives during this window.

**How to avoid:**
1. Phase 7 already marks `enhancementStatus: "pending"` BEFORE API call
2. Polling cron catches jobs stuck in `pending` with no `jobId` for >5 minutes (similar to orphaned pending video tasks in existing `task-recovery.ts`)
3. Webhook deduplication prevents double-processing if webhook retries

**Warning signs:**
- Webhook logs show "No video task found for jobId=XXX"
- VideoTask records have `enhancementStatus: "pending"` but no `enhancementJobId` for >10 minutes
- Redis shows `webhook:enhancement:*` keys that were deduplicated but never processed

**Phase to address:** Already addressed by Phase 7's two-phase design. Phase 8 polling cron provides additional safety net.

### Pitfall 2: Webhook Handler Blocks on OSS Transfer
**What goes wrong:** `settleEnhancementSuccess()` transfers Aliyun temporary URL to OSS (may take 10-30 seconds for large 4K videos). Webhook handler blocks, times out, or causes Aliyun to retry webhook.

**Why it happens:** Aliyun temporary URLs expire in 30 minutes, so immediate transfer is required. But webhook handler should return quickly to prevent retries.

**How to avoid:**
1. Accept approach: Webhook handler can block for OSS transfer (up to 60s maxDuration) if transfer is critical path
2. Alternative approach: Webhook handler marks `enhancementStatus: "transfer_pending"`, returns immediately, and separate cron transfers from temporary URLs

**Recommendation:** Accept blocking approach. Phase 7's `transferFromUrlDetailed` has 3-retry logic with timeouts. If all retries fail, enhancement is marked `failed` (non-blocking for 1080p). Webhook maxDuration is already 60s in existing `/api/webhook/shanjian/route.ts`.

**Warning signs:**
- Webhook response time p95 > 30s in logs
- Aliyun webhook retry headers (if present) show multiple delivery attempts
- Redis shows duplicate `webhook:enhancement:*` keys for same jobId

### Pitfall 3: Enhancement Zombie Jobs with No Expiry
**What goes wrong:** Enhancement job is submitted to Aliyun, but webhook is never received (network failure, Aliyun outage, webhook misconfiguration). Polling cron polls Aliyun API, but API returns `PROCESSING` indefinitely. Enhancement stays "processing" forever.

**Why it happens:** No timeout logic exists in polling cron. Task is polled every 2 minutes, but if Aliyun API keeps returning `PROCESSING` for hours, no failure is ever triggered.

**How to avoid:** Add zombie expiry to `task-recovery.ts`:
- If `enhancementStatus: "processing"` AND `enhancementStartedAt` < now - 2 hours → mark as `failed` with `errorCode: "ENHANCEMENT_TIMEOUT"`
- Log warning for investigation
- User sees "4K增强失败" but 1080p remains accessible

**Warning signs:**
- VideoTask records with `enhancementStatus: "processing"` and `enhancementStartedAt` >2 hours old
- Aliyun billing shows no enhancement jobs completed in past 2 hours, but DB shows active jobs
- Logs show repeated polling for same jobId with no status change

**Phase to address:** Phase 8, integrated into existing `expireZombieTasks()` function in `task-recovery.ts`

### Pitfall 4: No Webhook Endpoint Discovery Test
**What goes wrong:** K8s cron job is deployed, polling works, but webhook endpoint is never called. Team assumes webhooks are working, but Aliyun never sends them (misconfigured webhook URL, firewall blocking, etc.).

**Why it happens:** Webhook endpoint is public HTTPS, but no validation step confirms Aliyun can reach it. Deployment succeeds, but webhooks silently fail.

**How to avoid:**
1. Add test webhook trigger in Aliyun console (if available) after deployment
2. Monitor webhook endpoint access logs for first 24 hours after deployment
3. Add metrics: `webhook_enhancement_total` counter to track webhook arrivals
4. Alert if polling cron settles >10 enhancements in 1 hour but webhook counter is 0 (indicates webhook failure)

**Warning signs:**
- Polling cron logs show high settlement counts, but webhook endpoint has 0 requests
- Enhancement settlement latency is consistently 2-4 minutes (polling frequency), never < 1 minute (webhook speed)
- Aliyun console shows webhook delivery failures (if available)

### Pitfall 5: Aliyun VIAPI Credentials Missing in K8s
**What goes wrong:** K8s cron job is deployed, but `ALIYUN_VIAPI_ACCESS_KEY_ID` or `ALIYUN_VIAPI_ACCESS_KEY_SECRET` environment variables are not set in `clipflow-web-secrets`. Polling cron crashes on every run with authentication errors.

**Why it happens:** Phase 7 documented env vars in `.env.example`, but K8s Secret was not updated during deployment.

**How to avoid:**
1. Verify K8s Secret has all 3 env vars BEFORE deploying cron job
2. Add readiness check: cron job should fail fast with clear error if credentials are missing
3. Test cron job in staging environment with real credentials

**Warning signs:**
- K8s cron job logs show "ALIYUN_VIAPI_ACCESS_KEY_ID must be set" errors
- Cron job restartPolicy triggers repeatedly (backoff loop)
- No enhancement jobs are ever polled or settled

**Phase to address:** Phase 8 deployment step. Must be explicitly verified in verification criteria.

## Code Examples

Verified patterns from existing codebase:

### Example 1: Webhook Deduplication (from Shanjian webhook)
```typescript
// Source: apps/web/src/app/api/webhook/shanjian/route.ts

// Redis dedup: SET NX with 24h expiry
try {
  const set = await redis.set(`webhook:${taskId}`, "1", "EX", 86400, "NX");
  if (!set) {
    reqLog.info("Duplicate webhook, skipping");
    webhookTotal.inc({ type: "duplicate", status });
    return NextResponse.json({ ok: true });
  }
} catch (error) {
  reqLog.warn({ error: error instanceof Error ? error.message : "unknown" }, "Redis dedup failed, continuing with DB backup");
}
```

### Example 2: Task Recovery Lock (from task-recovery.ts)
```typescript
// Source: apps/web/src/lib/task-recovery.ts

const locked = await acquireTaskRecoveryLock(`poll:${videoTask.externalTaskId}`);
if (!locked) continue;

// ... process task ...

async function acquireTaskRecoveryLock(lockKey: string): Promise<boolean> {
  try {
    const set = await redis.set(
      lockKey,
      "1",
      "EX",
      CRON_LOCK_TTL_SECONDS,
      "NX",
    );
    return !!set;
  } catch {
    return true; // If Redis fails, allow processing (fallback to DB-level concurrency)
  }
}
```

### Example 3: K8s CronJob Pattern (from cronjobs.yaml)
```yaml
# Source: k8s/cronjobs.yaml

apiVersion: batch/v1
kind: CronJob
metadata:
  name: cron-poll-tasks
  labels:
    app.kubernetes.io/part-of: clipflow
spec:
  schedule: "*/2 * * * *"  # Every 2 minutes
  concurrencyPolicy: Forbid  # Prevent overlapping runs
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      backoffLimit: 1
      activeDeadlineSeconds: 90
      template:
        spec:
          restartPolicy: Never
          imagePullSecrets:
            - name: acr-secret
          containers:
            - name: cron
              image: clip-registry-vpc.cn-hangzhou.cr.aliyuncs.com/clipflow/web:latest
              command: ["node", "-e"]
              args:
                - |
                  const http = require('http');
                  const host = process.env.CLIPFLOW_WEB_HOST || '120.26.205.132';
                  const req = http.get(`http://${host}/api/cron/poll-tasks`, {
                    headers: { 'Authorization': 'Bearer ' + process.env.CRON_SECRET },
                    timeout: 60000
                  }, res => {
                    let d = ''; res.on('data', c => d += c);
                    res.on('end', () => { console.log('HTTP', res.statusCode, d); process.exit(res.statusCode === 200 ? 0 : 1); });
                  });
                  req.on('error', e => { console.error(e.message); process.exit(1); });
              env:
                - name: CRON_SECRET
                  valueFrom:
                    secretKeyRef:
                      name: clipflow-web-secrets
                      key: CRON_SECRET
                - name: CLIPFLOW_WEB_HOST
                  valueFrom:
                    configMapKeyRef:
                      name: clipflow-cron-config
                      key: WEB_HOST
                      optional: true
              resources:
                requests:
                  cpu: 250m
                  memory: 256Mi
                limits:
                  cpu: 500m
                  memory: 512Mi
```

### Example 4: Fire-and-Forget Async Trigger (from Shanjian webhook)
```typescript
// Source: apps/web/src/app/api/webhook/shanjian/route.ts

// Trigger demo video generation (non-blocking, best-effort)
if (result?.virtualmanId && result?.speakerId) {
  triggerAvatarDemoVideo({
    avatarId,
    virtualmanId: result.virtualmanId,
    speakerId: result.speakerId,
    logPrefix: "[webhook]",
  }).catch((err) =>
    console.error(
      `[webhook] Demo video trigger failed for avatar ${avatarId}:`,
      err,
    ),
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Synchronous enhancement (wait for 4K before delivery) | Async enhancement after 1080p delivery | Phase 7 design | Users get 1080p immediately, 4K is additive enhancement. Failure doesn't block primary workflow. |
| Single status field for video + enhancement | Separate `enhancementStatus` field | Phase 7 schema | Video can be "completed" (1080p ready) while enhancement is "processing" (4K in progress). Independent lifecycles. |
| Webhook-only detection | Webhook + polling dual strategy | Phase 8 (following Shanjian pattern) | Webhook provides fast feedback, polling provides reliability. Proven pattern in existing codebase. |

**Deprecated/outdated:**
- None identified. Phase 8 follows current best practices from existing codebase.

## Open Questions

**1. Aliyun VIAPI Webhook Support**
- What we know: Aliyun SDKs typically support webhooks for async jobs, but exact webhook payload format and signature verification are unverified
- What's unclear: Does Aliyun VIAPI EnhanceVideoQuality API support webhook callbacks? If yes, what is the webhook URL configuration method and payload schema?
- Recommendation: Implement webhook endpoint optimistically based on Aliyun SDK patterns. If webhook is not supported, polling alone is sufficient backup. Test webhook in staging with Aliyun console (if webhook test trigger is available).

**2. Enhancement Eligibility Rules**
- What we know: Not all videos should trigger enhancement (cost control, user tier limits, video size limits)
- What's unclear: Which videos qualify for automatic enhancement? All videos? Only premium users? Videos < 5 minutes? Configurable per-user?
- Recommendation: Phase 8 implements trigger for ALL videos with `deliveryStatus: "durable"` (simplest path). Phase 9 or later can add eligibility rules (user tier check, duration check, system toggle). Document eligibility as TODO in code.

**3. Aliyun VIAPI Rate Limits**
- What we know: Async APIs typically have rate limits (requests per minute, concurrent jobs)
- What's unclear: What are Aliyun VIAPI enhancement API rate limits? Does it support unlimited concurrent jobs or is there a quota?
- Recommendation: Phase 8 implements fire-and-forget trigger with no queue. If rate limits are hit in production, Phase 9 can add queueing (similar to Shanjian semaphore pattern). Monitor Aliyun API errors for HTTP 429 or quota exceeded responses.

**4. Enhancement Processing Time Estimates**
- What we know: 4K upscaling is CPU-intensive, likely 5-15 minutes for a 2-3 minute video
- What's unclear: Actual Aliyun VIAPI processing times for 1080p→4K enhancement
- Recommendation: Log `enhancementStartedAt` and `enhancementCompletedAt` timestamps. After 10-20 enhancements, analyze duration distribution to set accurate zombie timeout (currently 2 hours, may be too long).

**5. Aliyun Temporary URL Expiry Window**
- What we know: Phase 7 assumes 30-minute expiry for Aliyun temporary URLs
- What's unclear: Actual expiry window may be different (could be 1 hour, could be 10 minutes)
- Recommendation: Monitor OSS transfer failures. If many enhancements fail with `TRANSFER_FAILED` due to expired URLs, expiry window is shorter than expected. Log temporary URL timestamps and transfer timestamps to measure actual window.

## Environment Availability

Phase 8 depends on external tools and services. Availability audit:

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Aliyun VIAPI credentials | Enhancement API calls | ❌ Not verified | — | BLOCK: Cannot call API without credentials |
| Redis | Webhook dedup, task locks | ✓ (existing) | (existing) | — |
| Prisma / MySQL | VideoTask updates | ✓ (existing) | (existing) | — |
| K8s cluster | Cron job deployment | ✓ (existing) | (existing) | — |
| OSS bucket | 4K video storage | ✓ (existing) | (existing) | — |
| Aliyun VIAPI SDK | Enhancement API client | ✓ Installed in Phase 7 | 4.0.0 | — |

**Missing dependencies with no fallback:**
- Aliyun VIAPI credentials (`ALIYUN_VIAPI_ACCESS_KEY_ID`, `ALIYUN_VIAPI_ACCESS_KEY_SECRET`) must be provisioned in K8s Secret before deployment. Without credentials, polling cron will crash on startup. **Verification criteria must include credential test.**

**Missing dependencies with fallback:**
- None identified. All other dependencies are already available from existing infrastructure.

**Verification Steps:**
1. **Before deployment:** Run `kubectl get secret clipflow-web-secrets -o yaml` and verify `ALIYUN_VIAPI_ACCESS_KEY_ID` and `ALIYUN_VIAPI_ACCESS_KEY_SECRET` keys exist
2. **After deployment:** Test cron job manually: `kubectl create job --from=cronjob/cron-poll-enhancements test-poll-enhancements` and check logs for authentication errors

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `apps/web/src/lib/video-task-settlement.ts` — integration point for enhancement trigger
- Direct codebase inspection: `apps/web/src/lib/video-task-enhancement.ts` — Phase 7 lifecycle module to wire into pipeline
- Direct codebase inspection: `apps/web/src/lib/aliyun-enhancement.ts` — Phase 7 API client for polling
- Direct codebase inspection: `apps/web/src/app/api/webhook/shanjian/route.ts` — existing webhook pattern to follow
- Direct codebase inspection: `apps/web/src/lib/task-recovery.ts` — existing polling/recovery pattern to extend
- Direct codebase inspection: `k8s/cronjobs.yaml` — existing cron job pattern to replicate
- Phase 7 SUMMARY.md (07-01, 07-02) — what was built in previous phase
- ARCHITECTURE.md — integration architecture and data flow
- PITFALLS.md — domain-specific pitfalls and prevention strategies
- REQUIREMENTS.md — phase requirements (ENHANCE-01 through ENHANCE-04, INFRA-02)

### Secondary (MEDIUM confidence)
- npm registry: `@alicloud/videoenhan20200320@4.0.0` verified available (2026-04-01)
- Aliyun VIAPI documentation (inferred from SDK types and existing OSS patterns)

### Tertiary (LOW confidence)
- Aliyun webhook support unverified — optimistic implementation based on typical async API patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all dependencies already installed and verified in Phase 7
- Architecture patterns: HIGH — derived from existing codebase patterns (Shanjian webhook, task-recovery polling)
- Pitfalls: HIGH — based on PITFALLS.md and direct codebase inspection of existing edge cases
- Integration points: HIGH — Phase 7 built all primitives, Phase 8 wiring is straightforward
- Environment availability: MEDIUM — Aliyun credentials availability unverified

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (30 days — stable domain, no fast-moving dependencies)
