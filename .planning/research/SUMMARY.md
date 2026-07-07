# Project Research Summary

**Project:** ClipFlow v3.0 4K Video Enhancement
**Domain:** Async video quality enhancement (1080p → 4K)
**Researched:** 2026-04-01
**Confidence:** HIGH

## Executive Summary

ClipFlow's 4K video enhancement feature integrates cleanly as an **async post-processing step** after Shanjian 1080p rendering completes. The enhancement uses Alibaba Cloud's Vision Intelligence API (`videoenhan` 2020-03-20 with `EnhanceVideoQuality` operation), which processes videos asynchronously with webhook callbacks or polling recovery. The architecture leverages proven patterns from the existing Shanjian integration — webhook + polling dual strategy, Redis deduplication, OSS transfer flows, and separate lifecycle tracking.

**CRITICAL CORRECTION:** The API is fully asynchronous (not synchronous as initially suggested in STACK.md). The official Aliyun docs confirm: submit job → receive `RequestId` → poll `GetAsyncJobResult` with `JobId`. Output URLs are **temporary (30-min validity)** and must be downloaded to OSS immediately. Input limits are generous (up to 1GB, 10 minutes, resolutions 360x360 to 1920x1080), and output can reach 8K (7680x4320) with HDR support.

The key architectural principle is **enhancement is additive, not blocking**. Users always have 1080p fallback. If enhancement fails (network issues, API timeout, format incompatibility), the 1080p video remains accessible. The status state machine keeps video rendering and enhancement lifecycles independent (`status` vs `enhancementStatus`), ensuring 1080p delivery never blocks on 4K success.

## Key Findings

### Recommended Stack

**Core API:** Alibaba Cloud Vision Intelligence API (videoenhan 2020-03-20) accessed via `@alicloud/videoenhan20200320@4.0.0` SDK. The `EnhanceVideoQuality` operation provides fine-grained control over output dimensions, bitrate, frame rate, and HDR format. Authentication uses AccessKey credentials (environment variables or RAM role), with endpoint `videoenhan.cn-shanghai.aliyuncs.com`.

**Core technologies:**
- **`@alicloud/videoenhan20200320@4.0.0`**: Official Node.js SDK with TypeScript support, maintained by Alibaba Cloud SDK team, recently updated (Nov 2025)
- **`@alicloud/credentials@^2.4.4`**: Credential management with automatic chain resolution (AccessKey, STS, RAM roles)
- **Async API pattern**: Submit job → receive RequestId → poll `GetAsyncJobResult` until `PROCESS_SUCCESS` → download temporary URL to OSS (30-min expiry)

**API Characteristics (from official docs):**
- Async processing with webhook callbacks or polling
- Input: MP4/AVI/MKV/MOV/FLV/TS/MPG/MXF, max 1GB, max 10 minutes, 360x360 to 1920x1080
- Output: up to 7680x4320 (8K!), FrameRate up to 120fps, HDR PQ/HLG support
- Output URL is **temporary** (30 min validity) — must transfer to OSS immediately
- Requires `AliyunVIAPIFullAccess` permission on RAM user

**Critical gaps:** Pricing model and actual processing times remain unknown (official docs returned 404 errors). Estimated ¥0.5-2.0 per minute of video processed based on typical VIAPI pricing patterns, but this requires validation via billing console after test runs.

### Expected Features

**Must have (table stakes):**
- **Automatic async enhancement** — triggered after Shanjian 1080p completes, no user action required
- **Progress indicator** — status badge shows "AI优化中" during enhancement with pulse animation
- **Graceful fallback to 1080p** — if enhancement fails, user still has working 1080p video
- **Quality badge on 4K videos** — small "4K" badge in top-left corner when enhancement completes
- **Status persistence** — enhancement state visible across page refreshes and sessions

**Should have (competitive):**
- **Transparent upgrade** — videoUrl transitions 1080p → 4K automatically, no manual quality selection
- **Enhancement retry on transient failures** — auto-retry with exponential backoff (max 3 attempts)
- **Dual-version availability** — 1080p accessible immediately while 4K processes
- **"AI优化" branding** — marketing angle for AI-enhanced quality

**Defer (v2+):**
- **Manual opt-in per video** — adds cognitive load, inconsistent quality
- **Separate download buttons** — confusing for 95% of users who want "the video"
- **Enhancement progress percentage** — Aliyun API doesn't expose granular progress
- **Quality selector before generation** — adds friction to content creation flow

### Architecture Approach

The enhancement pipeline plugs in AFTER `settleVideoTaskSuccess()` completes. When a video reaches `status=completed` and `deliveryStatus=durable`, the system triggers `triggerVideoEnhancement()` asynchronously. Enhancement runs in background (estimated 5-15 min for 3-min video) while users access 1080p immediately.

**Major components:**
1. **API Client** (`lib/aliyun-enhancement.ts`) — submit enhancement job, poll status, handle temporary URL expiry
2. **Lifecycle Manager** (`lib/video-task-enhancement.ts`) — trigger enhancement, settle success/failure, OSS transfer from temporary URL
3. **Webhook Handler** (`app/api/webhook/aliyun-enhancement/route.ts`) — fast path for Aliyun callbacks with Redis deduplication
4. **Polling Cron** (`app/api/cron/poll-enhancements/route.ts`) — backup for lost webhooks, runs every 2 minutes
5. **Database Schema** — 9 new nullable fields on `VideoTask` for enhancement tracking (separate from video generation lifecycle)

**Data Flow:**
```
Shanjian completes → 1080p in OSS → status=completed
    ↓
triggerVideoEnhancement() → Aliyun API submit
    ↓
enhancementStatus=processing, store RequestId/JobId
    ↓
Poll or webhook → GetAsyncJobResult → PROCESS_SUCCESS
    ↓
Download temporary URL → transfer to OSS bucket (videos/{taskId}/enhanced-4k.mp4)
    ↓
enhancementStatus=completed, enhanced4kUrl stored
    ↓
Frontend shows "4K" badge
```

### Critical Pitfalls

1. **Enhancement trigger race condition** — Webhook arrives before enhancement job record exists in DB. **Prevention:** Create DB record first (within video completion transaction), then submit to Aliyun API. Store RequestId/JobId immediately after API acceptance. Use Redis deduplication keyed on job ID.

2. **OSS storage costs double without lifecycle policy** — Each video has two versions: 1080p (~5-15MB) and 4K (~40-100MB). Without lifecycle rules, costs grow linearly with video count. **Prevention:** Configure OSS lifecycle to transition 1080p to Infrequent Access after 7 days (50% savings), 4K after 30 days. Use separate keys (`video.mp4` and `video-4k.mp4`), never overwrite. Add per-user enhancement quota.

3. **Enhancement failures drop original 1080p URL** — If enhancement code overwrites `videoUrl` before checking success, user loses access to working 1080p. **Prevention:** Add separate `enhanced4kUrl` field. Never overwrite `videoUrl` (1080p). Enhancement is additive, not replacement.

4. **Temporary URL expiry** — Aliyun returns temporary URLs with 30-minute validity. If OSS transfer is delayed or fails, URL expires and enhancement result is lost. **Prevention:** Transfer to OSS immediately upon `PROCESS_SUCCESS`. Retry transfer (3 attempts) if it fails. Mark enhancement as failed if all retries exhausted.

5. **Long processing time confuses users** — Enhancement takes 5-15 minutes for 3-minute video. Without clear progress indication, users think system is broken. **Prevention:** Show separate status indicators: "已完成" (1080p ready) + "AI优化中" (4K enhancing) with spinner. Display 1080p download button immediately, add 4K button when ready.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: API Integration & Temporary URL Handling (Critical Foundation)
**Rationale:** Must handle async API pattern and 30-minute temporary URL expiry correctly from day one. The temporary URL constraint is non-negotiable — if not handled, enhancement results are lost permanently.

**Delivers:** Working Aliyun API client that submits jobs, polls status, and transfers temporary URLs to OSS before expiry

**Addresses:**
- Install SDK (`@alicloud/videoenhan20200320@4.0.0`)
- Configure credentials via environment variables
- Implement `submitEnhancementJob()` with `EnhanceVideoQuality` operation
- Implement `pollEnhancementStatus()` calling `GetAsyncJobResult`
- Implement `transferTemporaryUrl()` to move result from Aliyun temporary storage to ClipFlow OSS
- Add timeout handling (30-min max, fail gracefully if URL expires)
- Unit tests with API mocks

**Avoids:**
- **Pitfall #4** (temporary URL expiry) — handled by immediate OSS transfer
- Building full lifecycle before understanding actual API behavior

### Phase 2: Lifecycle Integration & State Machine (Core Logic)
**Rationale:** Integrate enhancement trigger after video completion, keep lifecycles independent, ensure 1080p is never blocked by 4K.

**Delivers:** Enhancement triggered after Shanjian completes, status persisted, 1080p always accessible

**Addresses:**
- Database schema migration (9 enhancement fields on `VideoTask`)
- Type definitions (`types/api.ts` with enhancement fields)
- Enhancement lifecycle (`lib/video-task-enhancement.ts`)
- Trigger integration in `video-task-settlement.ts` (fire-and-forget after 1080p success)
- Webhook handler (`app/api/webhook/aliyun-enhancement/route.ts`) with Redis deduplication
- Polling cron (`app/api/cron/poll-enhancements/route.ts`) every 2 minutes
- Zombie expiry in recovery (mark as failed if processing > 2 hours)

**Uses:**
- Existing webhook + polling pattern from Shanjian integration
- Redis deduplication (`webhook:enhancement:{jobId}`, 24h TTL)
- OSS transfer patterns (`transferFromUrl`, `persistVideoThumbnail`)

**Implements:**
- Async job management with dual strategy (webhook primary, poll backup)
- State machine: `enhancementStatus` (none/pending/processing/completed/failed)

**Avoids:**
- **Pitfall #1** (race condition) — DB record created before API call
- **Pitfall #3** (dropping 1080p) — separate `enhanced4kUrl` field, never overwrite `videoUrl`

### Phase 3: Frontend Display & UX (User-Facing)
**Rationale:** Users see 4K badge and understand enhancement progress. 1080p accessible immediately, 4K arrives when ready.

**Delivers:** 4K badge, status indicators, quality toggle

**Addresses:**
- "4K" badge on video list when `enhancementStatus=completed` (`app/(dashboard)/videos/page.tsx`)
- "AI优化中" indicator during processing with pulse animation
- Quality toggle on detail page (`app/(dashboard)/videos/[id]/page.tsx`)
- Graceful degradation messaging (1080p available, 4K coming soon)
- Failure handling UI (subtle warning if enhancement fails, 1080p still works)

**Avoids:**
- **Pitfall #5** (user confusion) — clear status separation: video ready vs enhancement in progress

### Phase 4: Deployment & Infrastructure (Production Ready)
**Rationale:** K8s configuration, credentials, cron job, monitoring

**Delivers:** Enhancement running in production on Alibaba Cloud Kubernetes

**Addresses:**
- K8s secrets for Aliyun credentials (`clipflow-web-secrets`)
- ConfigMap for non-sensitive settings (endpoint, region, webhook URL)
- Cron job for polling (`k8s/cronjobs.yaml`, every 2 minutes)
- Environment variable documentation (`.env.example`)
- OSS lifecycle policy configuration (transition to IA tier)
- Cost monitoring alerts (budget threshold)

**Avoids:**
- **Pitfall #2** (storage costs) — lifecycle policy configured before production load

### Phase Ordering Rationale

**API first because:**
- Temporary URL handling is non-negotiable — if missed, enhancement results are lost
- Cannot design lifecycle before understanding async polling pattern
- Fastest validation that credentials work and API is accessible

**Lifecycle before frontend because:**
- Frontend displays DB state (`enhancementStatus`, `enhanced4kUrl`) — backend must be correct first
- Testing with manual API calls is faster than debugging through UI
- Webhook/poll handlers must work before users see badges

**Deployment last because:**
- Local testing with `.env` validates logic before K8s changes
- Cron job requires webhook endpoint to be deployed first
- Lifecycle policy can be applied retroactively if needed during Phase 1-3

### Research Flags

**Phases needing deeper research during planning:**
- **Phase 1:** Aliyun API rate limits, webhook signature verification, actual pricing model — all unverified from official docs
- **Phase 2:** Enhancement eligibility rules (all videos? < 5min only? premium users?) — business decision needed
- **Phase 4:** Cost controls and per-user quotas — depends on actual pricing from Phase 1 testing

**Phases with standard patterns (skip research-phase):**
- **Phase 2 (Lifecycle):** Webhook + polling pattern already proven with Shanjian integration
- **Phase 3 (Frontend):** Standard shadcn/ui badge components, existing status indicator patterns
- **Phase 4 (Deployment):** K8s secrets/ConfigMap patterns already established in existing deployment

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | SDK verified, official docs confirm async pattern and temporary URL handling |
| Features | HIGH | Clear table stakes identified from UX research and competitor analysis |
| Architecture | HIGH | Follows proven Shanjian webhook/poll pattern, clean separation of concerns |
| Pitfalls | HIGH | Based on direct codebase inspection, existing video pipeline issues, OSS patterns |
| API Behavior | HIGH | Official docs now confirm async pattern with temporary URLs (30-min expiry) |
| Processing Times | LOW | Estimated 5-15 min for 3-min video, requires real-world testing |
| Pricing | LOW | Estimated ¥0.5-2.0/min, requires validation via billing console |
| OSS Transfer Speed | MEDIUM | Depends on network and file size, retry logic essential |

**Overall confidence:** HIGH — architecture validated against production codebase, API pattern confirmed from official docs, pitfalls identified from existing Shanjian integration experience.

### Gaps to Address

**Critical gaps (block production deployment):**
- **Actual pricing model:** Estimate of ¥0.5-2.0 per minute is unverified. Check Alibaba Cloud console during Phase 1 testing, calculate monthly cost for expected volume.
- **Processing times:** Estimate of 5-15 minutes for 3-minute video requires real-world measurement. Use this to set timeout values and user expectations.
- **API rate limits:** Unknown concurrency caps or requests/minute limits. Test with burst traffic during Phase 1, implement queueing if needed.

**Non-critical gaps (address during implementation):**
- **Enhancement eligibility rules:** Decide which videos trigger enhancement (all? < 5min only? premium users?). Can start with "all videos < 10min" and refine based on cost.
- **Webhook signature verification:** Check if Aliyun requires cryptographic verification. Implement if required, otherwise rely on Redis deduplication.
- **Optimal bitrate parameters:** `EnhanceVideoQuality` accepts `bitrate` (8-200 MB). Test with various values, compare output quality vs file size.
- **OSS lifecycle policy details:** Transition timing (7 days for 1080p, 30 days for 4K) is a starting point. Monitor storage costs and adjust.

**Resolution plan:**
- Phase 1 testing with real video will resolve pricing, processing times, and rate limits
- Business decision on eligibility rules can be made after Phase 1 cost validation
- Webhook signature and bitrate optimization are refinements, not blockers

## Sources

### Primary (HIGH confidence)
- **Aliyun official docs:** `https://help.aliyun.com/zh/viapi/developer-reference/api-comprehensive-video-enhancement` — API structure, async pattern, temporary URL handling, input/output limits, HDR support
- **ClipFlow codebase:** Direct inspection of `video-task-settlement.ts`, `shanjian.ts`, `webhook/shanjian/route.ts`, `task-recovery.ts`, `oss.ts`, `prisma/schema.prisma` — existing patterns for webhook handling, OSS transfer, status state machine
- **SDK inspection:** `@alicloud/videoenhan20200320@4.0.0` npm package — API types, request/response structures, authentication methods
- **GitHub:** `https://github.com/aliyun/alibabacloud-typescript-sdk` — SDK usage patterns, credential configuration

### Secondary (MEDIUM confidence)
- **NN/g research:** Progress indicators, microinteractions — user expectations for async processing
- **AWS MediaConvert, Topaz Video AI:** Quality enhancement workflow patterns — post-processing vs pre-selection approaches
- **Aliyun OSS pricing:** `https://www.aliyun.com/price/product#/oss/detail` — storage costs (Standard: ¥0.024/GB/month, IA: ¥0.012/GB/month)
- **Aliyun OSS lifecycle:** `https://www.alibabacloud.com/help/en/oss/user-guide/lifecycle-rules-based-on-the-last-modified-time` — automatic tier transitions

### Tertiary (LOW confidence)
- **VIAPI pricing estimates:** Based on typical patterns (¥0.5-2.0/min), not official pricing — requires validation
- **Processing time estimates:** Based on industry-standard AI video upscaling benchmarks (2-3x video duration) — requires real-world testing
- **Competitor features:** HeyGen, Synthesia, Runway — homepage claims only, technical specs not accessible

---
*Research completed: 2026-04-01*
*Ready for roadmap: yes*
*Critical finding: Temporary URL expiry (30 min) must be handled in Phase 1 — architecture-critical*
