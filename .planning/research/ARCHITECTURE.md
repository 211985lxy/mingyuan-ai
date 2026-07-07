# Architecture Research: 4K Video Enhancement Integration

**Domain:** Async video enhancement pipeline integration
**Researched:** 2026-04-01
**Confidence:** HIGH

---

## Context: Existing Video Pipeline Architecture

ClipFlow's video generation flow is well-established:

```
User creates video task
    ↓
POST /api/tasks → VideoTask created (queued)
    ↓
acquireSlot() → VideoTask promoted (pending)
    ↓
submitToShanjian() → VideoTask marked processing
    ↓
Shanjian renders video (async)
    ↓
Webhook callback: POST /api/webhook/shanjian
    ↓
settleVideoTaskSuccess()
    ├── transferFromUrl() → OSS
    ├── persistVideoThumbnail() → OSS cover
    └── VideoTask marked completed
    ↓
Frontend video list shows result
```

**Key architectural facts:**
- **Database:** Prisma ORM + MySQL (schema at `apps/web/prisma/schema.prisma`)
- **External API:** Shanjian video rendering with webhook callbacks
- **Storage:** Alibaba Cloud OSS (ali-oss SDK)
- **Async task management:**
  - `status` field: `queued → pending → processing → completed | failed`
  - `deliveryStatus`: `pending → durable | degraded`
  - Redis-based webhook deduplication (`webhook:${taskId}` key, 24h TTL)
  - Semaphore-based concurrency control (`shanjian:slots` Redis counter)
- **Recovery/polling:** Cron job at `/api/cron/poll-tasks` calls `runTaskRecoveryPass()` every 2 minutes
- **Deployment:** Kubernetes on Alibaba Cloud, ConfigMap + Secrets for env vars

---

## Recommended Integration Architecture

### System Overview: Enhancement Pipeline

```
┌────────────────────────────────────────────────────────────────────────┐
│                    Existing Video Generation                           │
│  VideoTask(queued) → Shanjian API → Webhook → completed(1080p)        │
└────────────────────────┬───────────────────────────────────────────────┘
                         │
                         ↓ (NEW: trigger enhancement)
┌────────────────────────────────────────────────────────────────────────┐
│                    4K Enhancement Pipeline                             │
│                                                                        │
│  VideoTask.enhancementStatus = "pending"                              │
│         ↓                                                              │
│  POST Aliyun Enhancement API                                          │
│  (read 1080p from OSS, write 4K to OSS)                              │
│         ↓                                                              │
│  enhancementJobId stored → status = "processing"                      │
│         ↓                                                              │
│  Poll Aliyun API OR Aliyun webhook callback                          │
│         ↓                                                              │
│  VideoTask.enhanced4kUrl = OSS URL, status = "completed"             │
│         ↓                                                              │
│  Frontend shows 4K badge + enhanced video                             │
└────────────────────────────────────────────────────────────────────────┘
```

**Integration point:** Enhancement is triggered AFTER `settleVideoTaskSuccess()` completes and the 1080p video is durably stored in OSS. If enhancement fails, the 1080p video remains available.

---

## Database Schema Changes

### VideoTask Model Extensions

Add to `VideoTask` table in `apps/web/prisma/schema.prisma`:

```prisma
model VideoTask {
  // ... existing fields ...

  // Enhancement fields
  enhancementStatus      String?   @default("none") // none | pending | processing | completed | failed
  enhancementJobId       String?   @unique          // Aliyun job ID for polling/callback
  enhanced4kUrl          String?                    // OSS URL of 4K video
  enhanced4kCoverUrl     String?                    // OSS URL of 4K cover image
  enhanced4kDuration     Int?                       // Duration in seconds (if different)
  enhancementErrorCode   String?                    // Error code from Aliyun API
  enhancementErrorMessage String?  @db.Text         // Error message from Aliyun API
  enhancementStartedAt   DateTime?                  // When enhancement job was submitted
  enhancementCompletedAt DateTime?                  // When enhancement job finished

  @@index([enhancementStatus, updatedAt])
  @@index([enhancementJobId])
}
```

**Rationale:**
- **`enhancementStatus` separate from `status`:** Video generation and enhancement are independent lifecycles. A video can be `status=completed` (1080p ready) while `enhancementStatus=processing` (4K in progress).
- **`enhancementJobId` is unique:** Enables webhook/poll handlers to query by job ID.
- **Enhancement fields nullable:** Not all videos require 4K enhancement; this feature can be opt-in or conditional.
- **`enhanced4kUrl` separate from `videoUrl`:** Keeps 1080p and 4K URLs distinct. Frontend can offer quality selector.
- **Error fields isolated:** Enhancement failures don't pollute the primary video task error fields.

### Index Strategy

New indexes:
1. **`(enhancementStatus, updatedAt)`**: Efficient polling of `processing` enhancement jobs (recovery cron).
2. **`(enhancementJobId)`**: Fast lookup for webhook callbacks.

---

## Integration Points: Which Files/Modules Change

### New Components

| File | Purpose |
|------|---------|
| `apps/web/src/lib/aliyun-enhancement.ts` | Aliyun Enhancement API client (submit job, query status) |
| `apps/web/src/lib/video-task-enhancement.ts` | Enhancement lifecycle functions (trigger, settle success/failure) |
| `apps/web/src/app/api/webhook/aliyun-enhancement/route.ts` | Webhook handler for Aliyun callbacks |
| `apps/web/src/app/api/cron/poll-enhancements/route.ts` | Cron job to poll in-flight enhancement jobs |
| `apps/web/prisma/migrations/YYYYMMDDHHMMSS_add_enhancement_fields/migration.sql` | Schema migration |

### Modified Components

| File | Changes |
|------|---------|
| `apps/web/src/lib/video-task-settlement.ts` | After `settleVideoTaskSuccess()` completes and `deliveryStatus=durable`, trigger enhancement (if eligible) |
| `apps/web/src/app/(dashboard)/videos/page.tsx` | Display 4K badge when `enhancementStatus=completed` |
| `apps/web/src/app/(dashboard)/videos/[id]/page.tsx` | Show 4K video URL, allow quality toggle (1080p ↔ 4K) |
| `apps/web/src/types/api.ts` | Add enhancement fields to `ApiVideoTask` type |
| `k8s/clipflow-web.yaml` | Add Aliyun credentials to ConfigMap/Secret |
| `k8s/cronjobs.yaml` | Add cron job for `/api/cron/poll-enhancements` (every 2 minutes) |
| `.env.example` | Document `ALIYUN_ENHANCEMENT_ACCESS_KEY_ID`, `ALIYUN_ENHANCEMENT_ACCESS_KEY_SECRET`, `ALIYUN_ENHANCEMENT_REGION` |

---

## Data Flow: Enhancement Lifecycle

### Trigger Flow (After Shanjian Completion)

```
settleVideoTaskSuccess()
    ↓
[Check eligibility: deliveryStatus=durable, videoUrl is OSS, duration < 10min]
    ↓
triggerVideoEnhancement(taskId)
    ↓
Aliyun API: SubmitEnhancementJob
    ├── InputURL: videoTask.videoUrl (OSS URL, signed if needed)
    ├── OutputBucket: Same OSS bucket
    └── OutputPath: videos/${taskId}/enhanced-4k.mp4
    ↓
Store enhancementJobId, set enhancementStatus="processing"
```

**Implementation pattern:**
```typescript
// In video-task-settlement.ts, after transferFromUrl succeeds

if (videoTransfer.durable && isManagedOssUrl(videoTransfer.url)) {
  // Non-blocking: trigger enhancement in background
  triggerVideoEnhancement({
    taskId: input.taskId,
    sourceVideoUrl: videoTransfer.url,
  }).catch((err) => {
    console.error(`[enhancement] Failed to trigger for task ${input.taskId}:`, err)
    // Do NOT block video completion — enhancement is best-effort
  })
}
```

### Success Flow (Webhook or Poll)

```
Aliyun webhook: POST /api/webhook/aliyun-enhancement
    OR
Cron poll: GET /api/cron/poll-enhancements
    ↓
Query VideoTask by enhancementJobId
    ↓
settleEnhancementSuccess({
  taskId,
  enhanced4kUrl: "oss://bucket/videos/${taskId}/enhanced-4k.mp4",
  duration: 120
})
    ↓
Update VideoTask:
    enhancementStatus = "completed"
    enhanced4kUrl = OSS URL (presigned if needed)
    enhanced4kCoverUrl = generate thumbnail from 4K
    enhancementCompletedAt = now()
```

### Failure Flow

```
Aliyun reports job failed (webhook or poll)
    ↓
settleEnhancementFailure({
  taskId,
  errorCode: "ENHANCEMENT_TIMEOUT",
  errorMessage: "4K processing timeout"
})
    ↓
Update VideoTask:
    enhancementStatus = "failed"
    enhancementErrorCode = errorCode
    enhancementErrorMessage = errorMessage
    enhancementCompletedAt = now()
    ↓
Frontend still shows 1080p video (no loss of functionality)
```

**Critical design:** Enhancement failures do NOT affect the primary video. `status=completed` and `videoUrl` remain unchanged. Users always have the 1080p fallback.

---

## Async Job Management: Webhook vs. Polling

### Recommended Approach: Dual Strategy (Webhook Primary, Poll Backup)

**Webhook handler** (`/api/webhook/aliyun-enhancement/route.ts`):
- Fast: Result available immediately when Aliyun notifies
- Requires public endpoint and signature verification (like Shanjian webhook)
- Redis deduplication: `webhook:enhancement:${jobId}` key (24h TTL)

**Poll recovery** (`/api/cron/poll-enhancements/route.ts`):
- Backup: Catches jobs where webhook was lost/delayed
- Runs every 2 minutes (consistent with existing `/api/cron/poll-tasks`)
- Queries VideoTasks where `enhancementStatus=processing` and `enhancementStartedAt < now() - 2min`
- Calls Aliyun API to check job status
- Settles success/failure if status changed

**Zombie job expiry:**
- If `enhancementStatus=processing` for > 2 hours, mark as failed with `errorCode=ENHANCEMENT_TIMEOUT`
- Add to existing `expireZombieTasks()` logic in `task-recovery.ts`

### Comparison with Shanjian Flow

| Aspect | Shanjian Video | Aliyun Enhancement |
|--------|----------------|---------------------|
| **Webhook URL** | `SHANJIAN_WEBHOOK_URL` | `ALIYUN_ENHANCEMENT_WEBHOOK_URL` |
| **Dedup key** | `webhook:${taskId}` | `webhook:enhancement:${jobId}` |
| **Poll frequency** | Every 2 min | Every 2 min |
| **Zombie timeout** | 2 hours (processing) | 2 hours (enhancementStatus=processing) |
| **Failure recovery** | Retry allowed (manual) | No retry — 1080p remains available |

---

## OSS Flow: Read and Write Paths

### Enhancement Input (Read)

**Aliyun Enhancement API reads directly from OSS:**
- ClipFlow passes OSS URL to Aliyun API: `videoTask.videoUrl` (already stored in OSS by `settleVideoTaskSuccess()`)
- **Signed URL required?** Check Aliyun docs:
  - If Aliyun service account has read access to the OSS bucket → unsigned URL works
  - If not → generate presigned read URL with 2-hour expiry

**Implementation:**
```typescript
// In aliyun-enhancement.ts
async function submitEnhancementJob(input: {
  taskId: string
  sourceVideoUrl: string // OSS URL from videoTask.videoUrl
}): Promise<string> {
  const inputUrl = await prepareInputUrl(input.sourceVideoUrl)
  const outputPath = `videos/${input.taskId}/enhanced-4k.mp4`

  const response = await aliyunClient.submitJob({
    InputURL: inputUrl,
    OutputBucket: OSS_BUCKET,
    OutputPath: outputPath,
    EnhanceType: "4K_UPSCALE",
  })

  return response.JobId
}
```

### Enhancement Output (Write)

**Aliyun writes 4K video back to OSS:**
- **Same bucket:** ClipFlow's existing OSS bucket (reuse `OSS_BUCKET` env var)
- **Path convention:** `videos/${taskId}/enhanced-4k.mp4` (consistent with `videos/${taskId}/video.mp4` for 1080p)
- **Permissions:** Aliyun service account must have write access to the bucket

**On completion:**
```typescript
// In video-task-enhancement.ts
async function settleEnhancementSuccess(input: {
  taskId: string
  enhanced4kUrl: string // Raw OSS path from Aliyun callback
}) {
  // Build public OSS URL (may need presigning for client access)
  const publicUrl = buildOssUrl(input.enhanced4kUrl)

  // Generate 4K thumbnail (optional, or reuse 1080p cover)
  const coverUrl = await persistVideoThumbnail(
    publicUrl,
    `videos/${input.taskId}/enhanced-4k-cover.jpg`
  )

  await prisma.videoTask.update({
    where: { id: input.taskId },
    data: {
      enhancementStatus: "completed",
      enhanced4kUrl: publicUrl,
      enhanced4kCoverUrl: coverUrl ?? null,
      enhancementCompletedAt: new Date(),
    },
  })
}
```

---

## Kubernetes Deployment: Credentials Management

### Environment Variables (New)

Add to `clipflow-web-secrets` Kubernetes Secret:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: clipflow-web-secrets
type: Opaque
stringData:
  # ... existing secrets ...
  ALIYUN_ENHANCEMENT_ACCESS_KEY_ID: "LTAI5t..."
  ALIYUN_ENHANCEMENT_ACCESS_KEY_SECRET: "..."
  ALIYUN_ENHANCEMENT_REGION: "cn-hangzhou"
  ALIYUN_ENHANCEMENT_ENDPOINT: "https://videoenhan.cn-hangzhou.aliyuncs.com"
  ALIYUN_ENHANCEMENT_WEBHOOK_URL: "https://www.aibao365.com.cn/api/webhook/aliyun-enhancement"
```

**Credential isolation:**
- Use separate Aliyun RAM account for enhancement API (not the same as OSS credentials)
- Minimum required permissions:
  - **OSS:** Read from `clipflow-oss-bucket/videos/*`, Write to `clipflow-oss-bucket/videos/*/enhanced-4k.mp4`
  - **Video Enhancement API:** `videoenhan:SubmitJob`, `videoenhan:QueryJob`, `videoenhan:CancelJob`

### ConfigMap vs. Secret

| Variable | Storage | Reason |
|----------|---------|--------|
| `ALIYUN_ENHANCEMENT_ACCESS_KEY_ID` | Secret | Credential |
| `ALIYUN_ENHANCEMENT_ACCESS_KEY_SECRET` | Secret | Credential |
| `ALIYUN_ENHANCEMENT_REGION` | ConfigMap | Non-sensitive |
| `ALIYUN_ENHANCEMENT_ENDPOINT` | ConfigMap | Non-sensitive |
| `ALIYUN_ENHANCEMENT_WEBHOOK_URL` | ConfigMap | Non-sensitive (public URL) |

### Cron Job Deployment

Add to `k8s/cronjobs.yaml`:

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: clipflow-poll-enhancements
spec:
  schedule: "*/2 * * * *"  # Every 2 minutes
  concurrencyPolicy: Forbid  # Prevent overlapping runs
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: poll
              image: clip-registry-vpc.cn-hangzhou.cr.aliyuncs.com/clipflow/web:latest
              command:
                - /bin/sh
                - -c
                - |
                  curl -f -X GET \
                    -H "X-Cron-Secret: $CRON_SECRET" \
                    http://clipflow-web/api/cron/poll-enhancements
              envFrom:
                - secretRef:
                    name: clipflow-web-secrets
          restartPolicy: OnFailure
```

---

## State Machine Transitions

### VideoTask Status (Existing)

```
queued → pending → processing → completed | failed
                                      ↓
                                (enhancement eligible?)
```

### Enhancement Status (New)

```
none (default)
  ↓ (after video completed + durable)
pending (enhancement job queued)
  ↓ (API call submitted)
processing (Aliyun job running)
  ↓
completed | failed
```

### Combined State Matrix

| Video Status | Enhancement Status | Meaning | Frontend Display |
|--------------|-------------------|---------|------------------|
| `processing` | `none` | Video generating | 1080p: pending |
| `completed` | `none` | Video ready, no enhancement | 1080p: ready |
| `completed` | `pending` | Video ready, enhancement queued | 1080p: ready |
| `completed` | `processing` | Video ready, 4K processing | 1080p: ready, "AI优化中" |
| `completed` | `completed` | Video ready, 4K ready | 1080p + 4K: ready, "4K" badge |
| `completed` | `failed` | Video ready, 4K failed | 1080p: ready, no badge |
| `failed` | `none` | Video failed | Error state |

**Key insight:** `enhancementStatus` is ONLY relevant when `status=completed`. If video generation fails, enhancement never starts.

---

## Error Handling: Ensuring 1080p Fallback

### Principle: Enhancement is Best-Effort

**1. Enhancement trigger failure (immediate):**
```typescript
// In video-task-settlement.ts
try {
  await triggerVideoEnhancement({ taskId, sourceVideoUrl })
} catch (err) {
  // Log error but DO NOT block video completion
  console.error(`[enhancement] Trigger failed for task ${taskId}:`, err)
  // VideoTask remains status=completed, enhancementStatus=none
  // User sees 1080p video immediately
}
```

**2. Enhancement job failure (async):**
```typescript
// In video-task-enhancement.ts
async function settleEnhancementFailure(input: {
  taskId: string
  errorCode: string
  errorMessage: string
}) {
  await prisma.videoTask.update({
    where: { id: input.taskId },
    data: {
      enhancementStatus: "failed",
      enhancementErrorCode: input.errorCode,
      enhancementErrorMessage: input.errorMessage,
      enhancementCompletedAt: new Date(),
    },
  })
  // VideoTask.videoUrl (1080p) remains unchanged
  // Frontend hides 4K badge, shows 1080p video
}
```

### Retry Strategy

**No automatic retry:** Unlike Shanjian video generation (where users can manually retry a failed task), enhancement failures are silent:
- `enhancementStatus=failed` is logged in DB
- Admin dashboard can show enhancement failure rate
- Manual retry button can be added later if needed

**Rationale:** Enhancement is an optimization, not core functionality. If 4K fails, 1080p is sufficient. Automatic retries would waste compute quota.

---

## Suggested Build Order

### Phase 1: API Integration (Foundation)
**Goal:** Aliyun API client working, can submit/query jobs

| Task | Files | Dependency |
|------|-------|------------|
| 1. Aliyun API client | `lib/aliyun-enhancement.ts` | None |
| 2. Schema migration | `prisma/migrations/add_enhancement_fields/` | None |
| 3. Type definitions | `types/api.ts` | (1), (2) |
| 4. Unit tests (API mock) | `__tests__/unit/aliyun-enhancement.test.ts` | (1) |

**Validation:** Can call `submitEnhancementJob()` with hardcoded video URL, receive `jobId`, query status.

---

### Phase 2: Lifecycle Integration (Core Logic)
**Goal:** Enhancement triggered after video completion, state persisted

| Task | Files | Dependency |
|------|-------|------------|
| 5. Enhancement lifecycle | `lib/video-task-enhancement.ts` | Phase 1 |
| 6. Integrate trigger | `lib/video-task-settlement.ts` (modify) | (5) |
| 7. Webhook handler | `app/api/webhook/aliyun-enhancement/route.ts` | (5) |
| 8. Poll cron | `app/api/cron/poll-enhancements/route.ts` | (5) |
| 9. Zombie expiry | `lib/task-recovery.ts` (modify) | (5) |

**Validation:** Create a video task, verify `enhancementStatus=processing` after completion, manually trigger webhook/poll to settle.

---

### Phase 3: Frontend Display (UX)
**Goal:** Users see 4K badge and can toggle quality

| Task | Files | Dependency |
|------|-------|------------|
| 10. 4K badge on list | `app/(dashboard)/videos/page.tsx` | Phase 2 |
| 11. Quality toggle on detail | `app/(dashboard)/videos/[id]/page.tsx` | Phase 2 |
| 12. "AI优化中" indicator | `app/(dashboard)/videos/page.tsx` | Phase 2 |

**Validation:** Frontend shows "4K" badge when `enhancementStatus=completed`, video player switches between 1080p and 4K URLs.

---

### Phase 4: Deployment (Infrastructure)
**Goal:** Running in production on Kubernetes

| Task | Files | Dependency |
|------|-------|------------|
| 13. K8s secrets | `k8s/clipflow-web.yaml` | None |
| 14. Cron job | `k8s/cronjobs.yaml` | Phase 2 |
| 15. Env docs | `.env.example` | None |

**Validation:** Cron job runs every 2 minutes, webhook endpoint accessible at public URL, credentials work in production.

---

## Dependency Rationale

**Why API integration first?**
- Fastest path to validate Aliyun API is actually accessible and credentials work
- Avoids building lifecycle logic on top of broken API assumptions

**Why lifecycle before frontend?**
- Frontend depends on correct DB state (`enhancementStatus`, `enhanced4kUrl`)
- Testing lifecycle with manual API calls/DB queries is faster than debugging through UI

**Why deployment last?**
- Can test locally with `.env` before committing to K8s infrastructure changes
- Cron job depends on webhook/poll endpoints being deployed and working

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Blocking Video Completion on Enhancement

**What people do:**
```typescript
// WRONG: Wait for enhancement before marking video completed
await settleVideoTaskSuccess(...)
await triggerVideoEnhancement(...)
await waitForEnhancementCompletion() // BLOCKS!
```

**Why it's wrong:**
- Enhancement can take 5-15 minutes for a 2-minute video
- If enhancement fails, user never sees their video (even though 1080p is ready)
- Creates tight coupling between Shanjian and Aliyun APIs

**Do this instead:**
```typescript
// CORRECT: Trigger enhancement asynchronously after video is settled
await settleVideoTaskSuccess(...)
// Video is now completed (1080p ready)

triggerVideoEnhancement(...).catch(err => {
  // Log but don't block
  console.error('Enhancement trigger failed:', err)
})
// Function returns immediately, enhancement runs in background
```

---

### Anti-Pattern 2: Mixing Enhancement State into Video Status

**What people do:**
```typescript
// WRONG: Reuse videoTask.status for enhancement
videoTask.status = "enhancing" // New status
```

**Why it's wrong:**
- Video generation and enhancement are independent lifecycles
- A video can be "completed" (1080p ready) while enhancement is still running
- Frontend logic becomes complex: "Is status=completed safe to show video?"
- Recovery logic must handle a new status that doesn't map to Shanjian states

**Do this instead:**
```typescript
// CORRECT: Separate enhancementStatus field
videoTask.status = "completed" // Video is ready (1080p)
videoTask.enhancementStatus = "processing" // 4K is still running
```

---

### Anti-Pattern 3: Storing Raw Aliyun Paths in Database

**What people do:**
```typescript
// WRONG: Store internal OSS path from Aliyun response
enhanced4kUrl: "oss://bucket/videos/123/enhanced-4k.mp4"
```

**Why it's wrong:**
- Frontend cannot directly access `oss://` URLs
- Requires additional transformation logic in every query
- Presigned URLs must be generated on-the-fly, creating inconsistency

**Do this instead:**
```typescript
// CORRECT: Store public HTTPS URL (presigned if needed)
const publicUrl = buildOssUrl("videos/123/enhanced-4k.mp4")
// https://clipflow-oss.oss-cn-hangzhou.aliyuncs.com/videos/123/enhanced-4k.mp4
enhanced4kUrl: publicUrl
```

---

### Anti-Pattern 4: No Webhook Deduplication

**What people do:**
```typescript
// WRONG: Process every webhook immediately
export async function POST(request: NextRequest) {
  const payload = await request.json()
  await settleEnhancement(payload.jobId) // Duplicate!
}
```

**Why it's wrong:**
- Aliyun may send the same webhook multiple times (retries, network issues)
- Without deduplication, `settleEnhancement()` runs twice, causing race conditions
- Database constraints may fail on second update

**Do this instead:**
```typescript
// CORRECT: Redis-based deduplication (like Shanjian webhook)
export async function POST(request: NextRequest) {
  const payload = await request.json()
  const dedup = await redis.set(
    `webhook:enhancement:${payload.jobId}`,
    "1",
    "EX",
    86400,
    "NX"
  )
  if (!dedup) {
    return NextResponse.json({ ok: true }) // Already processed
  }
  await settleEnhancement(payload.jobId)
  return NextResponse.json({ ok: true })
}
```

---

## Open Questions for Implementation

### 1. Enhancement Eligibility Rules

**Question:** Which videos should trigger enhancement?
- All videos automatically?
- Only for premium users?
- Only for videos < 5 minutes (to control Aliyun costs)?
- Explicit opt-in checkbox at video creation?

**Recommendation:** Start with **automatic for all videos < 5 minutes** during beta. Add user-level toggle later.

---

### 2. Aliyun API Rate Limits

**Question:** Does Aliyun Enhancement API have concurrency/rate limits like Shanjian?
- If yes, need another semaphore (`aliyun-enhancement:slots`)
- If no, enhancement can run unrestricted

**Action:** Check Aliyun docs/trial account during Phase 1.

---

### 3. Webhook Signature Verification

**Question:** Does Aliyun send HMAC/signature with webhook payload?
- Shanjian does not verify signatures (relies on Redis dedup)
- Aliyun might require cryptographic verification

**Action:** Review Aliyun webhook docs, implement signature check if required.

---

### 4. Cost Estimation

**Question:** What is Aliyun Enhancement API pricing?
- Per-minute pricing? Per-job?
- Need to estimate monthly cost for 1000 videos/month

**Action:** Calculate cost during Phase 1 testing, add to project budget planning.

---

### 5. Frontend Quality Toggle UX

**Question:** Should quality toggle be:
- Dropdown (1080p / 4K)?
- Automatic based on network speed?
- Radio buttons?

**Recommendation:** Simple button toggle (1080p ↔ 4K) like YouTube quality selector. Auto-selection based on network is premature optimization.

---

## Sources

- **Existing codebase:** `apps/web/src/lib/video-task-settlement.ts`, `apps/web/src/lib/shanjian.ts`, `apps/web/src/app/api/webhook/shanjian/route.ts`
- **Prisma schema:** `apps/web/prisma/schema.prisma` (VideoTask model)
- **K8s deployment:** `k8s/clipflow-web.yaml`, `k8s/cronjobs.yaml`
- **OSS integration:** `apps/web/src/lib/oss.ts` (`transferFromUrl`, `persistVideoThumbnail`)
- **Recovery/polling:** `apps/web/src/lib/task-recovery.ts` (`runTaskRecoveryPass`)

---

*Architecture research for: 4K Video Enhancement Integration*
*Researched: 2026-04-01*
*Confidence: HIGH — based on direct codebase inspection*
