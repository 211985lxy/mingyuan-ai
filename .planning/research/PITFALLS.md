# Domain Pitfalls: Adding 4K Video Enhancement to Existing Video Pipeline

**Domain:** Async 4K video enhancement added to existing Shanjian 1080p video generation pipeline
**Researched:** 2026-04-01
**Confidence:** HIGH — based on direct codebase inspection, existing webhook patterns, video task lifecycle analysis, and OSS storage architecture

---

## Critical Pitfalls

### Pitfall 1: Enhancement Trigger Race Condition — Webhook Arrives Before Enhancement Job Exists

**What goes wrong:**
The enhancement job is triggered in a fire-and-forget manner after the video task is marked `completed` by the Shanjian webhook. If the Aliyun enhancement API call is slow to accept the job or if the database transaction hasn't committed yet, the system enters an inconsistent state:

1. Shanjian webhook arrives → `settleVideoTaskSuccess()` marks task `completed`, transfers video to OSS
2. Enhancement trigger fires → calls Aliyun API to submit enhancement job
3. If Aliyun webhook arrives before step 2 completes, there's no `enhancementTaskId` in the database to match against
4. Enhancement webhook becomes an orphan (no entity found) and is silently dropped

This is exacerbated by Redis deduplication (24h TTL with `NX` flag). If the enhancement webhook arrives first and gets deduplicated, the real webhook that should have been processed is dropped as a "duplicate."

**Why it happens:**
The existing webhook handler (`apps/web/src/app/api/webhook/shanjian/route.ts`) uses Redis dedup with a 24-hour window keyed only on `taskId`. The taskId is the external Aliyun enhancement task ID. If enhancement is triggered asynchronously (not within the same transaction as video completion), there's a window where the enhancement taskId exists in Aliyun's system but not yet in ClipFlow's database.

**Consequences:**
- Enhancement completes successfully on Aliyun side, webhook arrives, but ClipFlow never knows about it
- User sees "processing" status forever, enhancement never completes
- OSS stores only the 1080p video, 4K badge never appears
- No automatic recovery — task is stuck permanently unless manually intervened

**Prevention:**
Use a two-phase approach:

1. **Create enhancement record in DB first** (status: `pending_enhancement`) within the same transaction that marks the video task `completed`
2. **Submit to Aliyun API second** with the enhancement record ID as a tracking reference
3. Store the Aliyun enhancement `externalTaskId` in the enhancement record immediately after API acceptance

If Aliyun API submission fails after DB record creation, a recovery cron can retry submission for `pending_enhancement` records older than 5 minutes with no `externalTaskId`.

**Detection:**
- Webhook logs show "No entity found for webhook taskId" for Aliyun enhancement task IDs
- Enhancement records exist in DB with status `pending_enhancement` but no `externalTaskId` for >10 minutes
- Redis shows enhancement task IDs that were deduplicated but never processed

**Phase to address:** Phase 1 (Enhancement trigger implementation). The transactional ordering must be correct from day one — race conditions are nearly impossible to debug post-launch.

---

### Pitfall 2: OSS Storage Costs Double Without Lifecycle Policy or Version Cleanup

**What goes wrong:**
Each video now has two versions in OSS:
- `videos/{taskId}/video.mp4` (1080p, ~5-15 MB)
- `videos/{taskId}/video-4k.mp4` (4K, ~40-100 MB)

Without explicit lifecycle rules, both versions are stored indefinitely at full cost. For 1000 videos/month:
- 1080p storage: ~10 GB/month
- 4K storage: ~70 GB/month
- **Total: 80 GB/month** (~$0.024/GB/month in Aliyun OSS Standard = $1.92/month)

This seems cheap, but it compounds over time. After 12 months: 960 GB stored permanently. Users may only download the 4K version once and never need the 1080p again, but both sit in OSS accruing costs.

The more insidious problem: **OSS versioning** if enabled. If the 4K transfer overwrites an existing `video.mp4` instead of creating `video-4k.mp4` as a separate file, OSS versioning keeps both the original 1080p and the 4K as non-current versions, doubling storage without visibility in the main bucket listing.

**Why it happens:**
The existing OSS transfer logic (`apps/web/src/lib/oss.ts`, `transferFromUrl`) simply uploads to the target key without checking for existing objects or considering version control. The current codebase shows no lifecycle policies defined (no `.lifecycle.json` or IaC configuration visible).

Developers implement the feature thinking "storage is cheap" and don't configure lifecycle rules until the first surprise bill arrives.

**Consequences:**
- OSS costs grow linearly with video volume, not user activity
- Debugging and log storage also compete for the same OSS bucket, making it harder to audit video-specific costs
- If versioning is enabled (not visible in codebase but common in production), every video enhancement creates a hidden duplicate

**Prevention:**
1. **Use separate keys** for 1080p and 4K: `video.mp4` (1080p) and `video-4k.mp4` (4K), never overwrite
2. **Add OSS lifecycle rules** at bucket level:
   - Transition 1080p videos to Infrequent Access (IA) tier after 7 days (50% cost reduction)
   - Transition 4K videos to IA after 30 days
   - Delete non-current versions (if versioning enabled) after 7 days
3. **Admin toggle to disable enhancement** at system level (SystemSetting table) to control costs during high-volume periods
4. **Per-user enhancement quota** (e.g., free tier: 10 enhancements/month, pro: unlimited) to prevent abuse

**Warning signs:**
- Aliyun OSS billing shows storage costs growing faster than video task count
- OSS bucket storage metrics show 2x expected storage for video count
- Lifecycle policies tab in OSS console is empty

**Phase to address:** Phase 1 (OSS architecture planning) for the key naming convention and lifecycle policy definition. Phase 3 (Cost control) for quota and toggle implementation.

---

### Pitfall 3: Enhancement Failures Silently Drop Original 1080p URL — User Loses Both Versions

**What goes wrong:**
If the enhancement flow is implemented as:

1. Video task completes (1080p) → OSS URL stored in `videoUrl`
2. Enhancement triggers → replaces `videoUrl` with placeholder/pending state
3. Enhancement fails → error handler doesn't restore original `videoUrl`
4. User sees "processing failed" but no download link, original 1080p is lost

This is worse than not implementing enhancement at all — the user had a working 1080p video, then the system "enhanced" it into nothingness.

**Why it happens:**
State management treats enhancement as a mandatory step instead of an optional upgrade. The database schema has only one `videoUrl` field. Developers assume "if enhancement fails, we'll just keep the old URL," but the code path that triggers enhancement may overwrite `videoUrl` before checking enhancement success.

The existing `VideoTask` schema (line 127 in schema.prisma) has:
```prisma
videoUrl            String?
```

No separate `enhancedVideoUrl` or `originalVideoUrl` — just one URL field. If enhancement status is tracked in the same status field (`status: "completed"` vs `status: "enhancing"`), any failure that doesn't restore state leaves the user with nothing.

**Consequences:**
- User has to re-render the entire video from scratch
- Support tickets spike: "My video disappeared"
- Loss of trust in the enhancement feature
- Potential data loss if the original 1080p was only available temporarily (e.g., Shanjian CDN expiry)

**Prevention:**
**Add new schema fields to `VideoTask`:**

```prisma
model VideoTask {
  // ... existing fields ...
  videoUrl            String?   // original 1080p URL (never overwritten)
  enhancedVideoUrl    String?   // 4K URL after enhancement completes
  enhancementStatus   String    @default("not_started") // not_started | pending | processing | completed | failed
  enhancementTaskId   String?   // Aliyun enhancement task ID
  enhancementError    String?   // Enhancement-specific error message
}
```

**Flow:**
1. Shanjian completes → `videoUrl` = 1080p OSS URL, `status` = "completed", `enhancementStatus` = "pending"
2. Enhancement submits → `enhancementStatus` = "processing", `enhancementTaskId` = external ID
3. Enhancement succeeds → `enhancedVideoUrl` = 4K OSS URL, `enhancementStatus` = "completed"
4. Enhancement fails → `enhancementStatus` = "failed", `enhancementError` = reason, **`videoUrl` is untouched**

This way, the original 1080p is always available via `videoUrl`, and 4K is additive, not replacement.

**Warning signs:**
- User downloads suddenly stop working after enhancement is deployed
- Support tickets: "Video was ready, now it says processing failed"
- OSS logs show 1080p video exists but `videoUrl` in DB points to a non-existent 4K URL

**Phase to address:** Phase 1 (Database schema design). Migration must happen before any enhancement code is written.

---

### Pitfall 4: Long Enhancement Processing Time Confuses Users — No Progress Indication

**What goes wrong:**
Aliyun video enhancement for 1080p→4K upscale is CPU-intensive. Expected processing times:
- 30-second video: ~3-5 minutes enhancement
- 60-second video: ~7-10 minutes enhancement
- 120-second video: ~15-20 minutes enhancement

Users see:
1. Video rendering completes in 90 seconds → status changes to "completed"
2. User clicks download, sees 1080p video, closes tab
3. 8 minutes later, 4K enhancement finishes, but user is gone
4. User returns hours later, sees "4K" badge, confused why it wasn't there before

OR worse:

1. Video rendering completes → status shows "AI优化中..." (AI optimizing)
2. User waits 10 minutes, nothing changes, assumes the system is broken
3. User refreshes, still "AI优化中...", closes tab in frustration
4. Enhancement completes successfully but user already submitted a bug report

**Why it happens:**
The existing UI (based on schema inspection) shows video tasks with a single `status` field. The transition from "processing" to "completed" is binary. There's no indication that a second async step is happening, no progress bar, no estimated time remaining.

Chinese users are familiar with "processing" times for video generation (60-120 seconds is acceptable), but 10+ minutes for a post-processing step feels broken without communication.

**Consequences:**
- Users think the feature is broken, even when it's working perfectly
- Support load increases: "Why is my video still processing after 10 minutes?"
- Users download 1080p and leave before 4K is ready, never seeing the feature's value
- Feature adoption is low because users don't trust the "AI optimization" step

**Prevention:**
1. **Split status display** in UI:
   - Video task status: "completed" (green check) — 1080p is ready
   - Enhancement status: "AI优化中..." with spinner + estimated time remaining

2. **Show 1080p immediately** with a "4K增强中" (4K enhancing) badge that updates to "4K已就绪" (4K ready) when done

3. **Add progress estimation** (if Aliyun API provides it):
   - "预计剩余 3 分钟" (Estimated 3 minutes remaining)
   - If no API progress, show message: "1080p视频已就绪，4K增强预计需要 5-10 分钟" (1080p ready, 4K enhancement takes 5-10 minutes)

4. **Browser notification** when enhancement completes (if user has tab open but not focused)

5. **Email notification** (optional, for users who close the tab) — "您的视频4K增强已完成" (Your video 4K enhancement is complete)

**UI Text (Chinese):**
```
状态: 已完成 ✓
1080p视频已就绪，可立即下载
[下载1080p]

4K增强: 处理中... ⏳ (预计 5 分钟)
4K增强完成后将自动显示下载按钮
```

After enhancement completes:
```
状态: 已完成 ✓
4K增强已完成 ⚡

[下载1080p] [下载4K]
```

**Warning signs:**
- User surveys show confusion about "processing" status after video is viewable
- Support tickets: "Stuck at 'AI optimizing' for 15 minutes"
- Analytics show 80%+ of users download 1080p before 4K finishes, then never return

**Phase to address:** Phase 2 (UI status indicators). This is a UX-critical item — without clear status communication, the feature feels broken even when working.

---

### Pitfall 5: Aliyun API Rate Limits Block Batch Enhancement — No Backpressure or Queue

**What goes wrong:**
Aliyun video enhancement APIs typically have rate limits (exact limits unknown without official docs, but common patterns are 10-50 requests/minute per account). If a single user generates 20 videos in rapid succession (common in bulk content creation workflows), the enhancement triggers fire for all 20 simultaneously. Requests 11-20 fail with rate limit errors (HTTP 429 or similar).

The current codebase already implements a Shanjian submission semaphore (`apps/web/src/lib/shanjian-semaphore.ts`) to prevent overwhelming Shanjian's API. However, there's no equivalent for Aliyun enhancement.

If enhancement triggers are fire-and-forget (not queued), rate-limited submissions fail permanently. The video task is marked "completed" (1080p ready), but enhancement never starts. The user never gets a 4K version, and there's no retry mechanism.

**Why it happens:**
Developers implement enhancement triggering as:
```typescript
// In settleVideoTaskSuccess after OSS transfer
await triggerAliyunEnhancement({ videoUrl, taskId })
```

This works fine for single videos but doesn't account for burst traffic or rate limits. Unlike Shanjian (which has a Redis-backed semaphore to serialize submissions), enhancement has no queue.

**Consequences:**
- Bulk video creators hit rate limits, enhancement fails for 50%+ of their videos
- No user-visible indication that enhancement was even attempted
- Support tickets: "Some of my videos have 4K, some don't, no pattern"
- Manual retries require admin intervention

**Prevention:**
1. **Implement enhancement queue** using Redis list or a database table (`VideoEnhancementQueue`):
   ```prisma
   model VideoEnhancementQueue {
     id          String   @id @default(cuid())
     videoTaskId String   @unique
     priority    Int      @default(0)
     retryCount  Int      @default(0)
     status      String   @default("pending") // pending | processing | completed | failed
     createdAt   DateTime @default(now())

     @@index([status, priority, createdAt])
   }
   ```

2. **Cron worker** (`apps/worker/src/cron/process-enhancement-queue.ts`) that:
   - Fetches pending enhancement jobs (rate: 10/minute to stay under Aliyun limit)
   - Submits to Aliyun API with exponential backoff on 429 errors
   - Updates `VideoTask.enhancementStatus` to "processing" on success
   - Re-queues failed jobs with incremented `retryCount` (max 3 retries)

3. **Graceful degradation**: If rate limit is sustained for >30 minutes, log alert and temporarily disable auto-enhancement for new videos (show admin toggle to re-enable)

**Warning signs:**
- Aliyun API logs show HTTP 429 errors
- VideoTask records have `enhancementStatus: "pending"` for hours/days with no progression
- Logs show "Aliyun enhancement API call failed" without retry attempts

**Phase to address:** Phase 1 (Enhancement trigger architecture). Queueing must be designed upfront — adding it later requires reworking all enhancement trigger call sites.

---

### Pitfall 6: Webhook Handler Becomes Bottleneck — Blocking Enhancement Settlement Behind Video Settlement

**What goes wrong:**
The existing webhook handler processes one webhook at a time (Next.js API route is single-threaded per request). Current flow:

1. Webhook arrives → Redis dedup check
2. Query DB to find entity (`avatar`, `videoTask`, `asset`, `demoAvatar`)
3. If `videoTask` → `handleVideoCallback()` which calls `settleVideoTaskSuccess()`
4. `settleVideoTaskSuccess()` does OSS transfer (network I/O, can take 5-30 seconds for video)
5. Only then does the webhook handler return

If enhancement webhooks use the same handler, and they're queued behind Shanjian webhooks:

- Shanjian webhook arrives at 10:00:00, starts processing, OSS transfer takes 20 seconds
- Aliyun enhancement webhook for a different video arrives at 10:00:05
- Aliyun webhook is blocked waiting for Shanjian webhook to finish (20 seconds)
- Aliyun enhancement appears to be "slow" but is actually just queued

With high video volume (e.g., 10 videos completing per minute), webhook processing latency can exceed webhook arrival rate, causing a backlog. This is especially bad if OSS transfer is slow or retries.

**Why it happens:**
The current webhook handler does synchronous I/O (OSS transfers, database writes) within the HTTP request handler. Next.js API routes have a 60-second `maxDuration` (line 20 in webhook route), but blocking one webhook behind another is still suboptimal.

**Consequences:**
- Webhook processing latency increases over time as queue grows
- Users see delayed status updates (video completed 2 minutes ago, still shows "processing")
- Aliyun or Shanjian may retry webhooks if response is too slow, causing duplicates
- Redis dedup may fail if the same webhook is sent twice due to slow response

**Prevention:**
1. **Async settlement**: Webhook handler immediately returns 200 OK after basic validation, then processes settlement in a background job:
   ```typescript
   // In webhook handler
   const webhookJob = { taskId, status, result, errorCode, errorMessage };
   await redis.lpush('webhook:jobs', JSON.stringify(webhookJob));
   return NextResponse.json({ ok: true }); // immediate return
   ```

2. **Webhook worker** processes jobs from Redis queue (cron or long-running process):
   - Pop job from `webhook:jobs`
   - Process settlement (OSS transfer, DB updates)
   - Acknowledge job completion
   - If processing fails, retry with exponential backoff

3. **Separate webhook endpoints** for different providers (if webhook volumes grow):
   - `/api/webhook/shanjian` → handles only Shanjian callbacks
   - `/api/webhook/aliyun-enhancement` → handles only enhancement callbacks
   - Both push to the same Redis queue but with different priorities

**Alternative (simpler for this milestone):**
Keep synchronous processing but optimize OSS transfer to use streaming and set a strict timeout (e.g., 10 seconds). If OSS transfer times out, mark delivery as "degraded" (existing pattern in `video-task-settlement.ts`) and return immediately. A background recovery job can retry the OSS transfer later.

**Warning signs:**
- Webhook processing time p95 > 30 seconds in logs
- Redis dedup shows multiple entries for the same taskId (evidence of retry due to slow response)
- Monitoring shows webhook endpoint response time increasing over time

**Phase to address:** Phase 2 (Webhook integration). Initial implementation can be synchronous if tested under load, but architecture should support async migration.

---

### Pitfall 7: Database Migration Adds Non-Nullable Columns — Breaks Existing Queries and Requires Downtime

**What goes wrong:**
Adding new columns to the `VideoTask` table for enhancement tracking requires a schema migration. If columns are added as **non-nullable** without default values, the migration fails on production (existing rows have `NULL` for new columns).

Even if defaults are provided, Prisma migrations can lock the table for several seconds on large tables (>10K rows). For MySQL (the schema uses MySQL based on line 7 in schema.prisma), `ALTER TABLE` operations are blocking unless using `ALGORITHM=INPLACE` (which has restrictions).

If the migration adds indexes on new columns (e.g., `@@index([enhancementStatus])`), the index creation can take 10-60 seconds on a large table, during which all queries that scan the table are blocked.

**Why it happens:**
Developers add the new schema fields, run `npx prisma migrate dev`, then deploy to production without testing migration speed. Prisma generates:

```sql
ALTER TABLE `VideoTask` ADD COLUMN `enhancementStatus` VARCHAR(191) NOT NULL DEFAULT 'not_started';
ALTER TABLE `VideoTask` ADD COLUMN `enhancedVideoUrl` VARCHAR(191);
CREATE INDEX `VideoTask_enhancementStatus_idx` ON `VideoTask`(`enhancementStatus`);
```

On a table with 100K rows, this can take 30+ seconds, during which:
- Video list queries fail with lock timeout errors
- Webhook handler can't update video tasks
- Users see 500 errors when loading the video library page

**Consequences:**
- Deployment requires downtime
- If migration fails mid-way, database is left in inconsistent state
- Rollback is complicated (need to drop columns, which can also lock the table)
- Users experience service interruption

**Prevention:**
1. **Add nullable columns first** with defaults, deploy, backfill, then make non-nullable in a second migration (if needed):
   ```prisma
   enhancementStatus   String?   @default("not_started")
   enhancedVideoUrl    String?
   enhancementTaskId   String?
   ```

2. **Test migration on a production-sized dataset** in staging before deploying to production

3. **Use Prisma's shadow database** for migration testing (ensure `shadowDatabaseUrl` is configured in `prisma/schema.prisma`)

4. **Add indexes asynchronously** (MySQL 5.7+):
   ```sql
   ALTER TABLE `VideoTask` ADD INDEX `idx_enhancement_status` (`enhancementStatus`) ALGORITHM=INPLACE, LOCK=NONE;
   ```
   This allows the index to be built without blocking reads/writes (though it still impacts performance).

5. **Run migration during low-traffic window** (e.g., 2-4am Beijing time for a Chinese user base)

6. **Monitor lock wait timeouts** during migration:
   ```sql
   SHOW ENGINE INNODB STATUS;
   SELECT * FROM information_schema.PROCESSLIST WHERE Command = 'Query';
   ```

**Warning signs:**
- Staging deployment takes >10 seconds on migration step
- MySQL slow query log shows `ALTER TABLE` taking >5 seconds
- Prisma migration output shows "Migration is not safe to apply" warning

**Phase to address:** Phase 1 (Schema design). Migration strategy must be planned before writing schema changes.

---

## Moderate Pitfalls

### Pitfall 8: 4K Badge Display Logic Races with OSS Transfer Completion

**What goes wrong:**
Enhancement completes → webhook arrives → DB updated to `enhancementStatus: "completed"`, `enhancedVideoUrl: "https://oss.../video-4k.mp4"`. But the OSS transfer may still be in progress (it's async or queued). User sees "4K" badge, clicks download, gets 404 from OSS because the file isn't there yet.

This is similar to the existing `deliveryStatus` pattern in `VideoTask` (line 123 in schema.prisma shows `deliveryStatus` and `deliveryWarning`), but if not applied to enhancement, the same issue repeats.

**Prevention:**
Reuse the existing `deliveryStatus` pattern for enhancement:
- `enhancementDeliveryStatus: "pending" | "durable" | "degraded"`
- Only show "4K" badge when `enhancementStatus: "completed"` AND `enhancementDeliveryStatus: "durable"`
- If OSS transfer fails, show `enhancementDeliveryStatus: "degraded"` with a warning message

**Phase to address:** Phase 2 (OSS settlement). Covered by existing `video-task-settlement.ts` patterns if reused correctly.

---

### Pitfall 9: Enhancement Jobs Stuck in "Processing" Forever — No Timeout or Recovery

**What goes wrong:**
Aliyun enhancement API accepts the job, returns a task ID, but never sends a webhook (network failure, Aliyun outage, or webhook configuration error). The video task sits in `enhancementStatus: "processing"` forever. No recovery mechanism exists to detect and retry.

**Prevention:**
Add a recovery cron (similar to existing `task-recovery.ts` for video tasks):
```typescript
// Find enhancement tasks stuck in "processing" for >30 minutes
const stuckEnhancements = await prisma.videoTask.findMany({
  where: {
    enhancementStatus: "processing",
    updatedAt: { lt: new Date(Date.now() - 30 * 60 * 1000) },
  },
});

for (const task of stuckEnhancements) {
  // Poll Aliyun API to check task status
  const status = await aliyunClient.getEnhancementStatus(task.enhancementTaskId);
  if (status === "completed") {
    await settleEnhancementSuccess(task.id, status.result);
  } else if (status === "failed") {
    await settleEnhancementFailure(task.id, status.error);
  }
  // else still processing, check again next cycle
}
```

**Phase to address:** Phase 3 (Recovery mechanisms). Not blocking for MVP but essential for production resilience.

---

### Pitfall 10: Enhancement Cost Per Video Unknown — No Budget Alerting or Per-User Quota

**What goes wrong:**
Aliyun enhancement pricing is typically usage-based (e.g., ¥0.1-0.5 per minute of video processed). For 1000 videos/month averaging 60 seconds each:
- 1000 minutes processed
- At ¥0.3/minute = ¥300/month ($45 USD)

This seems reasonable, but if a single user generates 500 videos in a day (possible in bulk content workflows), that's ¥150 ($22 USD) in a single day. Without quota controls, a free-tier user or a bad actor can rack up significant costs.

**Prevention:**
1. **Track enhancement cost per video** (store in `VideoTask.enhancementCost` field if Aliyun API provides it, or estimate based on duration)
2. **System setting** for max enhancement budget per month (alert when 80% consumed)
3. **Per-user quota** in `User` model:
   ```prisma
   model User {
     enhancementQuota Int @default(10) // free tier: 10 enhancements/month
   }
   ```
4. **Admin dashboard** showing enhancement usage and costs per user

**Phase to address:** Phase 3 (Cost control). Can be deferred for MVP if initial user base is small and trusted, but essential before public launch.

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Aliyun SDK | Using synchronous API calls in Next.js API routes (blocks event loop) | Wrap Aliyun SDK calls in async functions; use SDK's promise-based APIs if available |
| Webhook deduplication | Reusing Redis key format `webhook:{taskId}` for both Shanjian and Aliyun (collision risk) | Use prefixed keys: `webhook:shanjian:{taskId}` and `webhook:aliyun:{taskId}` |
| OSS key naming | Overwriting `video.mp4` with 4K version (loses original) | Use separate keys: `video.mp4` (1080p), `video-4k.mp4` (4K) |
| Enhancement status tracking | Using same `status` field for both video rendering and enhancement | Add separate `enhancementStatus` field; keep `status: "completed"` when 1080p is ready |
| Database indexes | Adding index on `enhancementStatus` without testing migration performance | Test index creation on staging DB with production-scale data; use `ALGORITHM=INPLACE` if supported |
| Error handling | Swallowing Aliyun API errors without logging task ID or video reference | Log all enhancement failures with `taskId`, `videoTaskId`, `userId`, and error details for debugging |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Single "processing" status | User doesn't know if rendering or enhancement is happening | Split status: "视频生成中" (rendering), "1080p已就绪，4K增强中" (1080p ready, 4K enhancing) |
| No download button until 4K completes | User waits 10 minutes when 1080p is already ready at 2 minutes | Show [下载1080p] immediately when rendering completes, add [下载4K] when enhancement finishes |
| "4K" badge without explanation | Users don't know what 4K means or why it's better | Use "4K超清" (4K ultra-clear) with tooltip: "更高清晰度，适合大屏播放" (higher clarity, suitable for large screens) |
| No indication of file size difference | Users download 4K on mobile data, unexpected 100MB download | Show file size next to download button: "1080p (8MB)" vs "4K (60MB)" |
| Enhancement failure shows generic error | User sees "处理失败" (processing failed) with no action | Show specific message: "4K增强失败，1080p视频仍可下载" (4K enhancement failed, 1080p still available) + [重试增强] button |
| No progress indicator | User thinks system is frozen during 10-minute enhancement | Show spinner + "4K增强中... 预计剩余 6 分钟" (enhancing... ~6 min remaining) |

**Chinese UI Text Recommendations:**

Status indicators:
- `enhancementStatus: "pending"` → "等待4K增强" (waiting for 4K enhancement)
- `enhancementStatus: "processing"` → "4K增强中..." (4K enhancing...)
- `enhancementStatus: "completed"` → "4K已就绪" (4K ready)
- `enhancementStatus: "failed"` → "4K增强失败" (4K enhancement failed)

Download buttons:
- 1080p button: "下载视频 (1080p)" or "标清下载"
- 4K button: "下载4K视频" or "超清下载"
- If enhancement is processing: "4K增强中，请稍后" (4K enhancing, please wait)

Badge display:
- Show "4K" badge only when `enhancementStatus: "completed"` AND `enhancementDeliveryStatus: "durable"`
- Badge color: Gold/yellow to indicate premium quality
- Tooltip on hover: "视频已增强至4K超清" (video enhanced to 4K ultra-clear)

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Fire-and-forget enhancement trigger without queue | Fast to implement, no queue infrastructure | Rate limit failures, no retry, difficult to debug | Never — queue is essential for reliability |
| Single `status` field for both rendering and enhancement | No schema migration needed | Confusing UX, users don't know which step is happening | Never — separate fields are clearer for users and developers |
| Synchronous webhook processing with OSS transfer | Simple code path, easier to reason about | Webhook handler becomes bottleneck, slow response times | Acceptable for MVP (<100 videos/day), must refactor for production |
| No enhancement cost tracking | Faster implementation, less DB writes | No visibility into costs, budget overruns, no user quota enforcement | Acceptable for closed beta with trusted users, not for public launch |
| Overwriting `video.mp4` with 4K version | Only one OSS key per video, simpler | Loses original 1080p, no fallback if 4K has issues | Never — always keep both versions |
| No recovery cron for stuck enhancements | Fewer moving parts, less infrastructure | Stuck videos never recover, manual intervention required | Never — recovery is essential for production |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| DB migration locks `VideoTask` table | Webhook handler times out, users see 500 errors on video list page | Test migration on staging with production-scale data; run during low-traffic window; add indexes asynchronously | First deployment with schema migration under production load |
| Enhancement webhook OSS transfer is synchronous | Webhook response time p95 > 30s, Aliyun retries webhook causing duplicates | Make OSS transfer async or set strict timeout; return 200 OK immediately after DB update | When enhancement completes for videos >50MB |
| No index on `enhancementStatus` | Video list page slow when filtering by enhancement status | Add index during schema migration: `@@index([enhancementStatus])` | When video count exceeds 10K rows |
| Polling Aliyun API status too frequently in recovery cron | Aliyun rate limits, recovery stops working | Poll at most once every 5 minutes per video; batch status checks if API supports it | When >100 videos are stuck in "processing" |
| Video list query doesn't use covering index | DB queries require table scan for each video task | Add composite index: `@@index([userId, status, enhancementStatus])` | When users have >100 videos each |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Aliyun API credentials in plaintext environment variables | Credentials leak in logs, error messages, or container introspection | Use Kubernetes secrets, mount as volumes, never log credential values |
| Enhancement webhook endpoint has no signature verification | Malicious actors can forge webhooks, mark enhancements as completed without actual processing | Verify webhook signature using Aliyun SDK's signature validation (if provided) or shared secret |
| OSS URLs generated without expiry | Enhanced video URLs are accessible forever, no access control | Use signed URLs with 7-day expiry for enhanced videos (same pattern as existing OSS transfers) |
| No rate limiting on enhancement trigger endpoint (if exposed) | User can trigger unlimited enhancements, racking up costs | Enforce per-user quota at API level; reject enhancement requests if user exceeds monthly quota |
| Enhancement task ID is guessable (sequential) | Attacker can poll webhook endpoint to find other users' enhancement results | Ensure Aliyun task IDs are non-guessable (UUID format); never expose task ID in client-side API responses |

---

## "Looks Done But Isn't" Checklist

- [ ] **Enhancement trigger is transactional**: DB record created before Aliyun API call, not after
- [ ] **Original 1080p preserved**: `videoUrl` field never overwritten, `enhancedVideoUrl` is separate
- [ ] **Recovery cron implemented**: Stuck enhancements are detected and retried after 30 minutes
- [ ] **Status indicators clear**: UI shows "1080p ready" and "4K enhancing" separately, not a single "processing" state
- [ ] **Rate limit handling**: Enhancement queue implemented with backpressure, not fire-and-forget
- [ ] **Webhook deduplication keys unique**: `webhook:aliyun:{taskId}` doesn't collide with `webhook:shanjian:{taskId}`
- [ ] **OSS lifecycle policy configured**: 4K videos transition to IA tier after 30 days, 1080p after 7 days
- [ ] **Database migration tested**: Run on staging DB with 10K+ rows, ensure migration completes in <10 seconds
- [ ] **Download buttons show file size**: Users see "(8MB)" vs "(60MB)" before clicking
- [ ] **Error messages actionable**: "4K增强失败，1080p视频仍可下载" with [重试] button, not generic "处理失败"

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Race condition: webhook arrives before DB record exists | HIGH | Implement at-least-once delivery: webhook retries if no entity found; add idempotency keys; rebuild deduplication logic |
| OSS storage costs doubled (no lifecycle policy) | MEDIUM | Add lifecycle policy retroactively; analyze existing videos to transition to IA tier; one-time cost optimization script |
| Enhancement failures drop original 1080p URL | HIGH | Requires schema migration to add `enhancedVideoUrl` field, backfill existing data; audit all videos to ensure 1080p URL is restored |
| No progress indication (UX) | LOW | Update UI components to show separate status indicators; no backend changes needed |
| Rate limit blocking batch enhancement | MEDIUM | Implement enhancement queue; migrate existing fire-and-forget calls to queue; deploy recovery cron |
| Webhook handler bottleneck | MEDIUM | Refactor to async processing (Redis queue + worker); requires new infrastructure component |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Enhancement trigger race condition | Phase 1 — Enhancement trigger | Load test: submit 20 videos simultaneously, verify all enhancements complete without orphaned webhooks |
| OSS storage costs double | Phase 1 — OSS architecture | Verify lifecycle policy exists in Aliyun OSS console; check 30-day storage cost projection |
| Enhancement failures drop original 1080p | Phase 1 — Schema design | Verify `videoUrl` is never overwritten after enhancement starts; test failure recovery |
| Long processing time confuses users | Phase 2 — UI status indicators | User testing: show video list during enhancement, verify users understand status |
| Aliyun API rate limits | Phase 1 — Enhancement trigger | Load test: submit 50 videos, verify queue handles backpressure without failures |
| Webhook handler bottleneck | Phase 2 — Webhook integration | Measure webhook response time p95 under load; ensure <5 seconds |
| Database migration locks table | Phase 1 — Schema design | Test migration on staging with 10K rows; measure lock duration |
| 4K badge races with OSS transfer | Phase 2 — OSS settlement | Verify badge only shows when `enhancementDeliveryStatus: "durable"` |
| Enhancement jobs stuck forever | Phase 3 — Recovery mechanisms | Deploy recovery cron; artificially create stuck job, verify recovery within 30 minutes |
| Enhancement cost unknown | Phase 3 — Cost control | Implement cost tracking; set budget alert at ¥500/month; verify alert fires |

---

## Sources

- Direct codebase inspection: `apps/web/prisma/schema.prisma` — VideoTask schema, status fields, OSS URL storage pattern
- Direct codebase inspection: `apps/web/src/lib/video-task-domain.ts` — status constants, terminal vs active states
- Direct codebase inspection: `apps/web/src/lib/video-task-settlement.ts` — OSS transfer logic, delivery status pattern, settlement transaction
- Direct codebase inspection: `apps/web/src/app/api/webhook/shanjian/route.ts` — webhook deduplication, entity dispatch, Redis patterns
- Direct codebase inspection: `apps/web/src/lib/oss.ts` — OSS transfer implementation, expiry inference, URL encoding
- Direct codebase inspection: `.planning/debug/digital-human-generation-failures.md` — real production issues with Shanjian integration
- Aliyun OSS pricing: https://www.aliyun.com/price/product#/oss/detail (Standard: ¥0.024/GB/month, IA: ¥0.012/GB/month)
- Aliyun OSS lifecycle management: https://www.alibabacloud.com/help/en/oss/user-guide/lifecycle-rules-based-on-the-last-modified-time
- MySQL ALTER TABLE performance: https://dev.mysql.com/doc/refman/8.0/en/innodb-online-ddl-operations.html
- Prisma migrations best practices: https://www.prisma.io/docs/guides/migrate/production-troubleshooting
- Video enhancement processing time estimates: Based on industry-standard H.264→H.265 4K upscaling benchmarks (2-3x video duration for AI-based upscaling)

---

*Pitfalls research for: 4K Video Enhancement milestone (v3.0) — async Aliyun enhancement integration*
*Researched: 2026-04-01*
