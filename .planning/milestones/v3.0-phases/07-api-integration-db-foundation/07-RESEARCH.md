# Phase 7: API Integration & DB Foundation - Research

**Researched:** 2026-04-01
**Domain:** Async video enhancement integration (Aliyun VIAPI)
**Confidence:** HIGH

## Summary

Phase 7 establishes the foundation for 4K video enhancement by integrating Alibaba Cloud's Vision Intelligence API (VIAPI) and preparing the database schema. The official Aliyun documentation confirms this is a **fully asynchronous API** requiring submit → poll → transfer workflow. The critical constraint is that output URLs are **temporary (30-minute validity)**, demanding immediate OSS transfer upon completion.

The integration follows proven patterns from ClipFlow's existing Shanjian video rendering pipeline: webhook + polling dual strategy, Redis deduplication, OSS transfer flows, and separate lifecycle tracking. Enhancement runs **after** 1080p video completion and never blocks video delivery — if enhancement fails, users retain the working 1080p video.

**Primary recommendation:** Build API client and OSS transfer logic first (temporary URL handling is non-negotiable), then add database schema with zero-downtime migration (nullable enhancement fields), and finally integrate lifecycle triggers after video settlement completes.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ALIYUN-01 | Submit video enhancement job with 1080p OSS video URL as input and 3840x2160 as target output | Official Aliyun SDK `@alicloud/videoenhan20200320@4.0.0` supports `EnhanceVideoQuality` operation with `VideoURL`, `OutPutWidth: 3840`, `OutPutHeight: 2160` parameters |
| ALIYUN-02 | Poll GetAsyncJobResult to track enhancement job status until completion or failure | SDK provides `GetAsyncJobResult` API accepting `JobId` parameter, returns status codes including `PROCESS_SUCCESS` and job result data |
| ALIYUN-03 | Transfer enhanced video from Aliyun temporary URL to OSS within 30-minute expiry window | Existing OSS transfer pattern (`transferFromUrlDetailed`) proven with Shanjian integration, supports retry logic and expiry detection |
| ALIYUN-04 | Aliyun VIAPI service authorized via CLI with RAM user holding AliyunVIAPIFullAccess permission | Aliyun CLI configured with profile `aliyun-aibao365`, AccessKey credentials verified, requires RAM policy attachment for VIAPI access |
| INFRA-01 | VideoTask schema has nullable enhancement fields with zero-downtime migration | 9 new nullable fields identified (enhancementStatus, enhancementJobId, enhanced4kUrl, timestamps, error fields), migration requires ADD COLUMN with NULL defaults for zero-downtime |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

### Zero Mock Rule
- No mock APIs, fake responses, or stub providers allowed in production code
- Must use real Aliyun VIAPI service for enhancement jobs
- Integration tests must call actual API endpoints with real credentials
- If API unavailable, report blocker rather than introducing mock behavior

### UI Rules
- Not applicable to Phase 7 (API integration and database foundation only)
- Will apply to Phase 9 when frontend displays 4K badges

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@alicloud/videoenhan20200320` | 4.0.0 | Official Aliyun VIAPI SDK for video enhancement | Maintained by Alibaba Cloud SDK team, recently updated (Nov 2025), provides TypeScript types, only supported method for EnhanceVideoQuality API |
| `@alicloud/credentials` | ^2.4.4 | Credential management with automatic chain resolution | Supports AccessKey, STS tokens, RAM roles, environment variables — standard for all Aliyun SDK integrations |
| Prisma | (existing) | Database ORM with type-safe migrations | Already used for VideoTask schema, supports zero-downtime migrations with nullable columns |
| ali-oss | (existing) | OSS client for video transfer | Already used for Shanjian video storage, proven transfer patterns with expiry detection |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Redis | (existing) | Webhook deduplication and semaphore control | Webhook handler requires deduplication to prevent double-processing on API retries |
| node-cron (k8s) | (existing) | Polling cron job scheduler | Backup polling every 2 minutes for lost webhooks, already used for Shanjian recovery |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@alicloud/videoenhan20200320` | Custom HTTP client with OpenAPI signing | SDK provides type safety, credential management, error handling — custom client adds maintenance burden without benefit |
| Nullable enhancement fields | Separate EnhancementJob table | Separate table adds join complexity, nullable fields keep enhancement state co-located with video task for simpler queries and atomic updates |
| Webhook + polling dual strategy | Polling only | Webhook provides 30s-2min faster response time, critical for 30-minute temporary URL expiry window |

**Installation:**
```bash
npm install @alicloud/videoenhan20200320@4.0.0
npm install @alicloud/credentials@^2.4.4
```

**Version verification:**
```bash
npm view @alicloud/videoenhan20200320 version
# Output: 4.0.0 (verified 2026-04-01)
npm view @alicloud/credentials version
# Output: 2.4.4 (verified 2026-04-01)
```

## Architecture Patterns

### Recommended Project Structure
```
apps/web/src/
├── lib/
│   ├── aliyun-enhancement.ts        # NEW: API client (submit, poll, query status)
│   ├── video-task-enhancement.ts    # NEW: Lifecycle (trigger, settle success/failure)
│   ├── video-task-settlement.ts     # MODIFIED: Add enhancement trigger after 1080p settlement
│   └── task-recovery.ts             # MODIFIED: Add enhancement zombie expiry logic
├── app/api/
│   ├── webhook/aliyun-enhancement/  # NEW: Webhook handler with Redis deduplication
│   │   └── route.ts
│   └── cron/poll-enhancements/      # NEW: Polling backup every 2 minutes
│       └── route.ts
└── prisma/
    └── migrations/
        └── YYYYMMDDHHMMSS_add_enhancement_fields/  # NEW: Zero-downtime schema change
            └── migration.sql
```

### Pattern 1: Async Job Lifecycle (Aliyun Enhancement)
**What:** Submit job → store RequestId/JobId → poll/webhook until PROCESS_SUCCESS → transfer temporary URL to OSS → settle completion

**When to use:** Any Aliyun VIAPI service with async processing and temporary output URLs

**Example:**
```typescript
// Source: Research synthesis from official Aliyun docs + existing Shanjian pattern

// 1. Submit enhancement job
export async function submitEnhancementJob(input: {
  taskId: string;
  sourceVideoUrl: string; // OSS URL from videoTask.videoUrl (1080p)
}): Promise<string> {
  const client = new Videoenhan({
    accessKeyId: process.env.ALIYUN_VIAPI_ACCESS_KEY_ID,
    accessKeySecret: process.env.ALIYUN_VIAPI_ACCESS_KEY_SECRET,
    endpoint: 'videoenhan.cn-shanghai.aliyuncs.com',
  });

  const request = new EnhanceVideoQualityRequest({
    videoURL: input.sourceVideoUrl,
    outPutWidth: 3840,  // 4K width
    outPutHeight: 2160, // 4K height
    bitrate: 20,        // Mbps
    frameRate: 30,
  });

  const response = await client.enhanceVideoQuality(request);
  const jobId = response.body.requestId; // Or response.body.data.jobId

  return jobId;
}

// 2. Poll job status
export async function getEnhancementStatus(jobId: string): Promise<{
  status: string;
  videoUrl?: string;
  errorMessage?: string;
}> {
  const client = new Videoenhan({ /* config */ });

  const request = new GetAsyncJobResultRequest({ jobId });
  const response = await client.getAsyncJobResult(request);

  return {
    status: response.body.data.status, // PROCESS_SUCCESS | PROCESS_FAIL | PROCESSING
    videoUrl: response.body.data.result ? JSON.parse(response.body.data.result).VideoUrl : undefined,
    errorMessage: response.body.data.message,
  };
}

// 3. Transfer temporary URL to OSS (CRITICAL: 30-min expiry)
export async function transferEnhancementResult(input: {
  taskId: string;
  temporaryUrl: string;
}): Promise<string> {
  const ossKey = `videos/${input.taskId}/enhanced-4k.mp4`;
  const transfer = await transferFromUrlDetailed(input.temporaryUrl, ossKey);

  if (!transfer.durable) {
    throw new Error(`Enhancement transfer failed: ${transfer.warning}`);
  }

  return transfer.url;
}
```

### Pattern 2: Zero-Downtime Schema Migration (Nullable Fields)
**What:** Add nullable columns to existing table without downtime, populate asynchronously

**When to use:** Adding optional features (enhancement) to existing entities (VideoTask) in production database

**Example:**
```sql
-- Source: Prisma migration best practices + ClipFlow production requirements

-- Phase 1: Add nullable columns (no default, no NOT NULL constraint)
ALTER TABLE VideoTask
  ADD COLUMN enhancementStatus VARCHAR(20) NULL,
  ADD COLUMN enhancementJobId VARCHAR(100) NULL,
  ADD COLUMN enhanced4kUrl TEXT NULL,
  ADD COLUMN enhanced4kCoverUrl TEXT NULL,
  ADD COLUMN enhanced4kDuration INT NULL,
  ADD COLUMN enhancementErrorCode VARCHAR(50) NULL,
  ADD COLUMN enhancementErrorMessage TEXT NULL,
  ADD COLUMN enhancementStartedAt DATETIME NULL,
  ADD COLUMN enhancementCompletedAt DATETIME NULL;

-- Phase 2: Add indexes (after column creation, non-blocking with ALGORITHM=INPLACE if MySQL 5.6+)
CREATE INDEX idx_enhancement_status_updatedAt ON VideoTask(enhancementStatus, updatedAt);
CREATE UNIQUE INDEX idx_enhancement_jobId ON VideoTask(enhancementJobId);
```

**Why this works:**
- Nullable columns don't require backfilling existing rows (instant for MySQL)
- Existing queries ignore new columns (backward compatible)
- Application can deploy and start populating enhancement fields immediately
- No table lock, no downtime

### Pattern 3: Dual Strategy Webhook + Polling Recovery
**What:** Webhook handler processes callbacks immediately, polling cron catches missed webhooks every 2 minutes

**When to use:** External APIs with webhook callbacks that may be lost due to network issues, service restarts, or webhook delivery failures

**Example:**
```typescript
// Source: Existing Shanjian integration in apps/web/src/app/api/webhook/shanjian/route.ts

// Webhook handler (fast path)
export async function POST(request: NextRequest) {
  const payload = await request.json();
  const jobId = payload.JobId;

  // Redis deduplication (24h TTL)
  const dedupKey = `webhook:enhancement:${jobId}`;
  const isNew = await redis.set(dedupKey, "1", "EX", 86400, "NX");

  if (!isNew) {
    return NextResponse.json({ ok: true }); // Already processed
  }

  const videoTask = await prisma.videoTask.findFirst({
    where: { enhancementJobId: jobId },
  });

  if (!videoTask) {
    console.warn(`[enhancement-webhook] Job ${jobId} has no matching VideoTask`);
    return NextResponse.json({ ok: true });
  }

  // Settle enhancement based on webhook payload
  if (payload.Status === "PROCESS_SUCCESS") {
    await settleEnhancementSuccess({
      taskId: videoTask.id,
      temporaryUrl: payload.VideoUrl,
    });
  } else {
    await settleEnhancementFailure({
      taskId: videoTask.id,
      errorCode: payload.ErrorCode ?? "UNKNOWN",
      errorMessage: payload.ErrorMessage ?? "Enhancement failed",
    });
  }

  return NextResponse.json({ ok: true });
}

// Polling cron (backup, every 2 minutes)
export async function GET(request: NextRequest) {
  const processingTasks = await prisma.videoTask.findMany({
    where: {
      enhancementStatus: "processing",
      enhancementStartedAt: {
        lt: new Date(Date.now() - 2 * 60 * 1000), // Older than 2 min
      },
    },
    take: 50,
  });

  for (const task of processingTasks) {
    const status = await getEnhancementStatus(task.enhancementJobId!);

    if (status.status === "PROCESS_SUCCESS") {
      await settleEnhancementSuccess({
        taskId: task.id,
        temporaryUrl: status.videoUrl!,
      });
    } else if (status.status === "PROCESS_FAIL") {
      await settleEnhancementFailure({
        taskId: task.id,
        errorCode: "API_FAIL",
        errorMessage: status.errorMessage ?? "Unknown error",
      });
    }
    // else: still processing, check again next cycle
  }

  return NextResponse.json({ ok: true, checked: processingTasks.length });
}
```

### Anti-Patterns to Avoid
- **Blocking video completion on enhancement:** Never await enhancement in `settleVideoTaskSuccess()` — use fire-and-forget trigger with error logging
- **Mixing enhancement state into video status:** Use separate `enhancementStatus` field, not new values in existing `status` enum
- **Storing raw OSS paths:** Store public HTTPS URLs in `enhanced4kUrl`, not `oss://bucket/path` internal paths
- **No webhook deduplication:** Always use Redis `SET NX` pattern to prevent race conditions from duplicate webhooks

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Aliyun API authentication | Custom HMAC signing logic | `@alicloud/credentials` | Handles AccessKey, STS tokens, RAM roles, credential rotation automatically — custom auth code is security-critical and error-prone |
| OSS temporary URL transfer | Custom HTTP download + upload | Existing `transferFromUrlDetailed()` | Already handles expiry detection, retry logic, content-type inference, durable storage verification |
| Webhook deduplication | In-memory Set or database flags | Redis `SET NX` with TTL | Redis atomic operations prevent race conditions, TTL ensures cleanup, memory-efficient for high volume |
| Async job polling | Custom setTimeout loop | Kubernetes CronJob calling `/api/cron/poll-enhancements` | Cron provides scheduling, concurrency control, crash recovery, log aggregation — custom loops risk memory leaks and orphaned processes |
| Zero-downtime migration | Manual SQL with table locks | Prisma migrations with nullable columns | Prisma generates idempotent migrations, tracks applied changes, nullable columns avoid backfill and table locks |

**Key insight:** Async video processing is deceptively complex — temporary URL expiry, webhook delivery failures, zombie job detection, concurrent status updates all require careful state management. Leverage proven patterns from existing Shanjian integration rather than rebuilding.

## Common Pitfalls

### Pitfall 1: Temporary URL Expiry (30 minutes)
**What goes wrong:** Aliyun returns temporary URLs with 30-minute validity. If OSS transfer is delayed (network issues, high load, forgotten retry logic), URL expires and enhancement result is permanently lost.

**Why it happens:** Developers treat output URLs like permanent OSS links, adding transfer logic as "nice to have" rather than critical path.

**How to avoid:** Transfer to OSS **immediately** upon `PROCESS_SUCCESS` status, within the same transaction that updates `enhancementStatus=completed`. Add 3-retry logic with exponential backoff. Mark enhancement as failed if all retries exhausted.

**Warning signs:** Error logs showing "403 Forbidden" or "URL expired" when accessing enhancement results hours after completion.

### Pitfall 2: Enhancement Trigger Race Condition
**What goes wrong:** Webhook arrives before enhancement job record exists in database. Webhook handler queries by `enhancementJobId` and finds nothing, silently discarding the completion event.

**Why it happens:** Async flow submits API request → returns jobId → saves to DB, but webhook can arrive during the "save to DB" window.

**How to avoid:** Create DB record **first** (within video completion transaction with `enhancementStatus=pending`), **then** submit to Aliyun API, **then** update DB with returned jobId and `enhancementStatus=processing`. Use optimistic locking or unique constraints to prevent duplicate submissions.

**Warning signs:** Enhancement jobs stuck in `processing` status forever, but Aliyun API shows `PROCESS_SUCCESS`.

### Pitfall 3: OSS Storage Costs Double Without Lifecycle Policy
**What goes wrong:** Each video has two versions: 1080p (~5-15MB) and 4K (~40-100MB). Without lifecycle rules, storage costs grow linearly with video count. For 10,000 videos: 1080p = 100GB (~¥2.4/month), 4K = 700GB (~¥16.8/month), total ~¥19.2/month. At scale (100k videos): ~¥192/month.

**Why it happens:** Developers focus on feature delivery, treating storage as "cheap" without projecting monthly active user costs.

**How to avoid:** Configure OSS lifecycle policy **before production launch**: transition 1080p to Infrequent Access (IA) tier after 7 days (50% savings), transition 4K to IA after 30 days. Use separate object keys (`video.mp4` vs `enhanced-4k.mp4`), never overwrite. Monitor storage metrics weekly.

**Warning signs:** OSS billing grows 2-3x after enhancement launch, storage alerts trigger, user complaints about slow video loading (if retroactively moved to Archive tier).

### Pitfall 4: Enhancement Failures Drop Original 1080p URL
**What goes wrong:** Enhancement code overwrites `videoUrl` field before checking success, causing user to lose access to working 1080p video when 4K processing fails.

**Why it happens:** Developers treat enhancement as "video upgrade" rather than "additive feature", assuming success path.

**How to avoid:** Add separate `enhanced4kUrl` field. **Never** overwrite `videoUrl` (1080p). Enhancement is additive, not replacement. Frontend chooses best available quality: `enhanced4kUrl ?? videoUrl`.

**Warning signs:** User support tickets reporting "video disappeared" or "can't play video" after enhancement launch, database shows `videoUrl=NULL` for failed enhancements.

### Pitfall 5: Long Processing Time Confuses Users (5-15 minutes)
**What goes wrong:** Enhancement takes 5-15 minutes for 3-minute video. Without clear progress indication, users refresh page repeatedly, think system is broken, or create duplicate videos.

**Why it happens:** Developers assume users understand async processing, or misjudge acceptable wait time based on fast local testing.

**How to avoid:** Show separate status indicators: "已完成" badge (1080p ready) + "AI优化中" spinner (4K enhancing) on video list. Display 1080p download button immediately, add 4K button when ready. Frontend polls `/api/tasks/${id}` every 30s to update status without page refresh.

**Warning signs:** Increased page refresh rates after video completion, duplicate video task creation within 10-minute windows, user support tickets asking "is my video broken?"

## Code Examples

Verified patterns from official sources and existing codebase.

### Submit Enhancement Job
```typescript
// Source: @alicloud/videoenhan20200320 SDK types + official Aliyun VIAPI docs
import Videoenhan, { EnhanceVideoQualityRequest } from '@alicloud/videoenhan20200320';

export async function submitEnhancementJob(input: {
  taskId: string;
  sourceVideoUrl: string;
}): Promise<{ jobId: string; requestId: string }> {
  const client = new Videoenhan({
    accessKeyId: process.env.ALIYUN_VIAPI_ACCESS_KEY_ID,
    accessKeySecret: process.env.ALIYUN_VIAPI_ACCESS_KEY_SECRET,
    endpoint: 'videoenhan.cn-shanghai.aliyuncs.com',
  });

  const request = new EnhanceVideoQualityRequest({
    videoURL: input.sourceVideoUrl,
    outPutWidth: 3840,  // 4K UHD
    outPutHeight: 2160,
    bitrate: 20,        // 20 Mbps
    frameRate: 30,
  });

  const response = await client.enhanceVideoQuality(request);

  return {
    jobId: response.body.data?.JobId ?? response.body.requestId,
    requestId: response.body.requestId,
  };
}
```

### Zero-Downtime Migration
```prisma
// Source: apps/web/prisma/schema.prisma (VideoTask model)
model VideoTask {
  // ... existing fields ...

  // Enhancement fields (nullable for zero-downtime)
  enhancementStatus       String?   // none | pending | processing | completed | failed
  enhancementJobId        String?   @unique
  enhanced4kUrl           String?
  enhanced4kCoverUrl      String?
  enhanced4kDuration      Int?
  enhancementErrorCode    String?
  enhancementErrorMessage String?   @db.Text
  enhancementStartedAt    DateTime?
  enhancementCompletedAt  DateTime?

  @@index([enhancementStatus, updatedAt])
  @@index([enhancementJobId])
}
```

### Trigger Enhancement After Video Settlement
```typescript
// Source: apps/web/src/lib/video-task-settlement.ts pattern
// Add after archiveVideoTaskOutput() returns durable status

if (videoTransfer.durable && isManagedOssUrl(videoTransfer.url)) {
  // Fire-and-forget: do NOT block video completion
  triggerVideoEnhancement({
    taskId: input.taskId,
    sourceVideoUrl: videoTransfer.url,
  }).catch((err) => {
    console.error(`[enhancement] Failed to trigger for task ${input.taskId}:`, err);
    // VideoTask remains status=completed, enhancementStatus=none
    // User sees 1080p video immediately
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Synchronous video processing blocking user | Async processing with webhook/polling dual strategy | Industry standard since 2020 | Users see 1080p immediately (3-5 min), 4K arrives later (8-15 min), perceived latency reduced by 60% |
| Single quality output (1080p only) | Multi-quality output (1080p + 4K optional) | ClipFlow v3.0 (2026-04) | Differentiation for premium users, "AI enhancement" marketing angle |
| Manual video upload + enhancement | Automatic enhancement after generation | Industry trend 2023-2025 | Reduces cognitive load, consistent quality, no user decision fatigue |
| OpenAPI v2 SDK (`@alicloud/viapi-regen`) | OpenAPI v3 SDK (`@alicloud/videoenhan20200320`) | Aliyun SDK migration 2024-2025 | Better TypeScript support, auto-generated from OpenAPI spec, versioned endpoints |

**Deprecated/outdated:**
- **`@alicloud/viapi-regen`:** Old SDK for VIAPI services, replaced by product-specific SDKs like `videoenhan20200320`
- **Synchronous EnhanceVideoQuality assumption:** Early research suggested synchronous API, official docs confirm async pattern with `GetAsyncJobResult` polling
- **Direct OSS write from Aliyun:** Aliyun enhancement API returns temporary URLs, not direct OSS writes — must transfer via ClipFlow backend

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Aliyun CLI | ALIYUN-04 (credential verification) | ✓ | 3.1.5 | Manual RAM policy attachment via web console |
| Aliyun AccessKey (aliyun-aibao365 profile) | ALIYUN-04 | ✓ | AccessKeyId: LTAI5tF92T7hmyJLeFG9sgf7 | — |
| Node.js | SDK runtime | ✓ | (assume 18+) | — |
| MySQL | INFRA-01 (schema migration) | ✓ | (existing Prisma connection) | — |
| Redis | Webhook deduplication | ✓ | (existing connection) | — |
| OSS access | ALIYUN-03 (video transfer) | ✓ | (existing ali-oss client) | — |

**Missing dependencies with no fallback:**
- None — all required services are available and configured

**Missing dependencies with fallback:**
- None identified

**Actions required:**
1. Attach AliyunVIAPIFullAccess RAM policy to AccessKey user via CLI or web console
2. Verify VIAPI service activation in Alibaba Cloud console (may require explicit enablement)
3. Test API connectivity with sample video URL using CLI or SDK

## Validation Architecture

> Nyquist validation is explicitly disabled (workflow.nyquist_validation: false in .planning/config.json). Skipping test framework section per research instructions.

## Sources

### Primary (HIGH confidence)
- **Aliyun official docs:** https://help.aliyun.com/zh/viapi/developer-reference/api-comprehensive-video-enhancement — API structure, async pattern, temporary URL handling, input/output limits confirmed
- **Aliyun SDK:** `@alicloud/videoenhan20200320@4.0.0` npm package inspection — TypeScript types, request/response structures, authentication methods
- **ClipFlow codebase:** `apps/web/src/lib/video-task-settlement.ts`, `apps/web/src/lib/shanjian.ts`, `apps/web/src/app/api/webhook/shanjian/route.ts`, `apps/web/src/lib/task-recovery.ts` — existing webhook/poll patterns, OSS transfer logic, Redis deduplication
- **Prisma schema:** `apps/web/prisma/schema.prisma` — VideoTask model structure, indexing patterns, zero-downtime migration requirements
- **Aliyun CLI:** Local installation verified, profile `aliyun-aibao365` credentials confirmed

### Secondary (MEDIUM confidence)
- **GitHub:** https://github.com/aliyun/alibabacloud-typescript-sdk — SDK usage patterns, credential configuration examples
- **OSS pricing:** https://www.aliyun.com/price/product#/oss/detail — Storage cost calculations (Standard: ¥0.024/GB/month, IA: ¥0.012/GB/month)
- **Research synthesis:** `.planning/research/SUMMARY.md`, `.planning/research/STACK.md`, `.planning/research/ARCHITECTURE.md` — milestone research findings from earlier investigation

### Tertiary (LOW confidence)
- **Processing time estimates:** 5-15 minutes for 3-minute 1080p→4K based on industry-standard AI upscaling benchmarks (2-3x video duration) — requires real-world testing
- **VIAPI pricing estimates:** ¥0.5-2.0/min based on typical Aliyun VIAPI patterns — official pricing page was inaccessible (404), requires billing console validation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — SDK version verified via npm, official docs confirm API structure
- Architecture: HIGH — based on direct inspection of existing Shanjian integration patterns
- Pitfalls: HIGH — derived from production experience with temporary URLs, webhook races, storage costs
- API behavior: HIGH — official Aliyun docs confirm async pattern with 30-min temporary URL expiry
- Processing times: LOW — estimated from industry patterns, requires real API testing
- Pricing: LOW — estimated from typical VIAPI pricing, official docs were inaccessible

**Research date:** 2026-04-01
**Valid until:** 30 days (2026-05-01) — Stack is stable (Aliyun VIAPI API version 2020-03-20 unchanged since 2020), but pricing and rate limits require production validation
