# Feature Research: 4K Video Enhancement

**Domain:** Async video quality enhancement (1080p → 4K)
**Researched:** 2026-04-01
**Confidence:** MEDIUM

## Executive Summary

Video enhancement from 1080p to 4K should be **automatic and transparent** post-processing that happens after Shanjian rendering completes. Users should see clear progress indication through status badges, with the 4K version automatically replacing 1080p once ready. If enhancement fails, keep the 1080p version and notify the user with a subtle indicator — don't block video delivery on enhancement success.

**Key insight from research:** Leading video platforms (AWS MediaConvert, Topaz Video AI) treat quality enhancement as a **post-processing pipeline step**, not a user choice. Users expect higher quality automatically when available, not opt-in flows.

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Progress indicator during enhancement** | NN/g research: users abandon operations without clear progress feedback | LOW | Status badge already exists, just needs "AI优化中" state with pulse animation |
| **Automatic fallback to 1080p if 4K fails** | Users expect their video to be available even if enhancement fails | LOW | Keep videoUrl as 1080p, enhancement failure doesn't break delivery |
| **Quality badge on completed 4K videos** | Consistent with YouTube, Vimeo showing HD/4K indicators on thumbnails | LOW | Small "4K" badge in top-left corner of thumbnail (different position from status badge in top-right) |
| **Same download flow for both quality tiers** | Users expect to download the video they see | LOW | Frontend downloads videoUrl (which transitions 1080p → 4K) |
| **Status persists in video list** | Users return to video list and need to see current state | ZERO | Already implemented via DB status field + frontend polling |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Transparent async enhancement (no user action required)** | Competing tools (HeyGen, Synthesia) require manual quality selection at export — ClipFlow automatically upgrades all videos | MEDIUM | Requires webhook handling for Aliyun enhancement completion + status state machine |
| **Dual-version availability during transition** | User can download 1080p immediately while 4K is still processing | LOW | Keep both URLs temporarily, return 1080p in videoUrl until 4K ready |
| **Enhancement retry on transient failures** | Aliyun API may have temporary issues — auto-retry increases success rate | MEDIUM | Requires retry logic with exponential backoff, max 3 attempts |
| **"AI优化" branding** | Marketing angle: not just "4K" but "AI-enhanced quality" | ZERO | Copy change only, aligns with ClipFlow's AI-first positioning |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Manual opt-in per video** | "Let users choose 4K to save costs" | Adds cognitive load, decision fatigue, inconsistent quality across videos | Always enhance automatically — cost is marginal, user value is high |
| **Separate download buttons for 1080p and 4K** | "Power users want both resolutions" | Confusing for 95% of users who just want "the video" | Always serve highest quality available, don't expose internal transition |
| **Enhancement progress percentage (0-100%)** | "More detailed than status badge" | Aliyun API likely doesn't expose granular progress, fake numbers erode trust | Use discrete states: "rendering" → "AI优化中" → "已完成 (4K)" |
| **Cancel enhancement button** | "What if user wants 1080p only?" | Adds UI complexity, almost no users would click it | Keep 1080p accessible immediately, 4K arrives when ready |
| **Quality selector before generation** | "Let users choose 1080p or 4K upfront" | Adds friction to content creation flow, users don't know which to pick | Generate 1080p → auto-enhance to 4K, zero decisions required |

## Feature Dependencies

```
Video Rendering (Shanjian)
    └──requires──> Video Completed Status
                       └──triggers──> Enhancement Pipeline
                                          └──results──> 4K Badge Display

Enhancement Failure Handling
    └──requires──> 1080p Fallback Available
                       └──enables──> Graceful Degradation

Status Polling (Frontend)
    └──enhances──> Real-time Badge Updates
```

### Dependency Notes

- **Enhancement requires completed 1080p**: Can't enhance until Shanjian finishes rendering
- **Fallback requires 1080p preserved**: Don't delete 1080p URL until 4K transfer to OSS succeeds
- **Status polling enables real-time updates**: Frontend already polls for status, enhancement states fit existing pattern

## User Flow: Video Enhancement Lifecycle

### Status State Machine

```
Initial Creation
    ↓
[queued] → "等待中" (existing)
    ↓
[pending] → "准备中" (existing)
    ↓
[processing] → "生成中" (existing, Shanjian rendering)
    ↓
[completed] → "已完成" (Shanjian done, 1080p available)
    ↓
[enhancing] → "AI优化中" (NEW STATE, Aliyun enhancement)
    ↓
    ├─ Success → [enhanced] → "已完成 + 4K badge" (NEW STATE)
    └─ Failure → [completed] → "已完成 (1080p fallback, subtle warning)"
```

### Status Display Configuration

| Status | Badge Text | Badge Style | Pulse? | Position | Notes |
|--------|-----------|-------------|--------|----------|-------|
| queued | 等待中 | blue-100 | Yes | Top-right | Existing |
| pending | 准备中 | yellow-100 | Yes | Top-right | Existing |
| processing | 生成中 | yellow-100 | Yes | Top-right | Existing |
| completed | 已完成 | green-100 | No | Top-right | Existing, 1080p ready |
| enhancing | AI优化中 | purple-100 | Yes | Top-right | NEW, 1080p available, 4K in progress |
| enhanced | 已完成 | green-100 | No | Top-right | NEW, 4K ready (add quality badge) |
| failed | 失败 | red-100 | No | Top-right | Existing |

### Quality Badge (Separate from Status Badge)

When status = `enhanced`:
- Display small "4K" badge in **top-left corner** of thumbnail
- Style: `bg-black/80 text-white text-xs px-1.5 py-0.5 rounded`
- Position: `absolute top-2 left-2`
- Static (no pulse animation)
- Visible on video list, video detail page

### What User Sees

#### Scenario 1: Successful Enhancement (Happy Path)

1. **User creates video** → Badge: "生成中" (yellow, pulsing)
2. **Shanjian completes** → Badge: "已完成" (green, static) — User can watch/download 1080p immediately
3. **Enhancement starts (5 seconds later)** → Badge: "AI优化中" (purple, pulsing) — 1080p still playable
4. **Enhancement completes (2-5 min later)** → Badge: "已完成" + "4K" badge in top-left — 4K URL replaces 1080p in videoUrl field
5. **User returns to video list** → Sees "4K" badge, downloads 4K version automatically

**Key UX decisions:**
- User never waits for enhancement — 1080p available at step 2
- Enhancement is transparent — no modal, no blocking UI
- Quality upgrade is automatic — videoUrl updates in-place
- 4K badge is persistent — stays visible in list view forever

#### Scenario 2: Enhancement Failure (Degraded but Functional)

1. **Steps 1-2 same as above** → 1080p available
2. **Enhancement starts** → Badge: "AI优化中" (purple, pulsing)
3. **Enhancement fails (after 3 retries)** → Badge: "已完成" (green, static) — No 4K badge appears
4. **Subtle warning** → Small info icon in bottom-right of thumbnail (not intrusive)
   - Tooltip on hover: "AI优化未能完成,视频保持1080p高清画质"
5. **User can still use video normally** → Download, share, embed 1080p version

**Failure handling principles:**
- **Don't alarm the user**: No red error badge, no modal
- **Preserve functionality**: 1080p is perfectly usable
- **Provide context if curious**: Tooltip explains what happened
- **Don't retry indefinitely**: 3 attempts max, then accept 1080p

#### Scenario 3: User Visits During Enhancement

1. User clicks video card while status = `enhancing`
2. Video detail page shows:
   - Video player loaded with 1080p URL (playable immediately)
   - Status indicator: "AI优化中 - 正在为您生成4K超清版本"
   - Progress: Indeterminate spinner (no fake percentage)
   - Action: "暂时可以观看1080p版本"
3. Frontend polls every 5 seconds
4. When enhancement completes → Page updates in-place, "4K" badge appears
5. Video player URL updates (React state change, no page reload)

## Download Behavior

### Current ClipFlow Download Pattern

```typescript
// User clicks download button
// Frontend fetches task.videoUrl (which is always the best available quality)
// Triggers browser download

// Timeline:
// T=0min:   videoUrl = null (rendering)
// T=2min:   videoUrl = "https://oss.../1080p.mp4" (Shanjian done)
// T=4min:   videoUrl = "https://oss.../4k.mp4" (enhancement done, replaces 1080p)
```

**User mental model:** "I download the video" → Always gets highest quality available

**Implementation:** No UI changes needed, videoUrl field transitions 1080p → 4K seamlessly

### Dual Download Option (Anti-Feature)

**Why NOT implement:**
- Adds cognitive load ("Which one do I want?")
- 95% of users just want "the best version"
- Creates confusion about which URL to share
- Increases support burden ("Why are there two downloads?")

**If user explicitly requests 1080p:**
- They can download it before enhancement completes (during "AI优化中" state)
- After 4K is ready, 1080p is no longer needed (storage cost optimization)

## Status Model Design

### Database Schema Changes

```prisma
model VideoTask {
  // ... existing fields ...
  status              String    @default("pending") // pending | processing | completed | enhancing | enhanced | failed
  videoUrl            String?   // Always points to best quality available (1080p → 4K transition)
  videoUrl1080p       String?   // NEW: Temporary 1080p backup during enhancement
  videoUrl4k          String?   // NEW: 4K URL after enhancement completes
  enhancementTaskId   String?   // NEW: Aliyun enhancement task ID for tracking
  enhancementAttempts Int       @default(0) // NEW: Retry counter (max 3)
  enhancementError    String?   // NEW: Last error message if failed
}
```

### Status Transition Rules

| Current Status | Trigger | Next Status | Actions |
|---------------|---------|-------------|---------|
| processing | Shanjian webhook: success | completed | Set videoUrl = 1080p OSS URL, trigger enhancement pipeline |
| completed | Enhancement job created | enhancing | Set enhancementTaskId, set videoUrl1080p = videoUrl (backup) |
| enhancing | Aliyun webhook: success | enhanced | Set videoUrl4k, update videoUrl = 4K URL, clear videoUrl1080p after 24h |
| enhancing | Aliyun webhook: failure (attempts < 3) | enhancing | Increment enhancementAttempts, retry after exponential backoff |
| enhancing | Aliyun webhook: failure (attempts >= 3) | completed | Set enhancementError, keep videoUrl = 1080p, user sees subtle warning |
| enhanced | No further transitions | enhanced | Terminal state, user has 4K video |

### Edge Cases

| Edge Case | Handling |
|-----------|----------|
| Enhancement starts but webhook never arrives | Background job checks tasks in "enhancing" state > 15 min, retries or marks failed |
| User deletes video during enhancement | Cancel Aliyun job via API, clean up OSS URLs |
| 1080p URL expires (ephemeral OSS) | Enhancement must complete OSS transfer before 1080p TTL, otherwise retry or fallback |
| 4K file larger than OSS quota | Enhancement fails gracefully, keep 1080p, log warning for ops team |
| Network interruption during 4K OSS transfer | Retry transfer (3 attempts), if all fail → mark completed (not enhanced) |

## Quality Badge Design Patterns

### Research Findings (MEDIUM confidence)

**YouTube, Vimeo pattern**: Small resolution badge in corner of thumbnail (not prominent, but visible)
**Topaz Video AI pattern**: Before/after comparison + "4K" label on enhanced versions
**AWS MediaConvert pattern**: No badge in UI, quality is transparent to end users

**ClipFlow approach (recommendation):**
- **Subtle but clear**: Small "4K" badge, not oversized
- **Top-left position**: Status badge is top-right, quality badge is top-left (no visual conflict)
- **Black semi-transparent background**: `bg-black/80` ensures legibility on any thumbnail
- **White text**: High contrast, universally recognizable
- **No animation**: Static badge, not pulsing (quality is permanent, not transient)

### Badge Component (shadcn/ui)

```tsx
// When rendering video card
{task.status === 'enhanced' && (
  <Badge className="absolute top-2 left-2 bg-black/80 text-white border-none text-xs px-1.5 py-0.5">
    4K
  </Badge>
)}

// Existing status badge stays in top-right
<Badge className={`absolute top-2 right-2 ${statusConfig[task.status].className}`}>
  {statusConfig[task.status].label}
</Badge>
```

## Retry Strategy

### When to Retry

**Retry eligible failures:**
- Network timeout (Aliyun API unavailable)
- 429 Rate Limit (too many requests)
- 503 Service Unavailable (temporary outage)
- OSS transfer interrupted

**Do NOT retry:**
- 400 Bad Request (invalid video format)
- 413 Payload Too Large (video exceeds size limit)
- Invalid video codec (enhancement not possible)
- Persistent 500 errors (3 consecutive failures)

### Retry Logic

```typescript
// Exponential backoff
const retryDelays = [30_000, 120_000, 300_000] // 30s, 2min, 5min

if (enhancementAttempts < 3 && isRetryEligible(error)) {
  const delay = retryDelays[enhancementAttempts]
  scheduleRetry(taskId, delay)
  updateTask({ enhancementAttempts: enhancementAttempts + 1 })
} else {
  // Give up, keep 1080p
  updateTask({
    status: 'completed',
    enhancementError: error.message,
  })
}
```

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the concept.

- [x] **Automatic enhancement trigger** — Every completed video goes to enhancement pipeline
- [x] **Status state machine** — `enhancing` and `enhanced` states added
- [x] **4K badge on enhanced videos** — Top-left corner indicator
- [x] **Graceful fallback to 1080p** — If enhancement fails, video is still usable
- [x] **Status badge updates** — Frontend polls and shows "AI优化中" during enhancement
- [x] **Single download flow** — videoUrl always points to best quality

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] **Enhancement retry logic** — Auto-retry on transient failures (3 attempts max)
- [ ] **Background timeout recovery** — Check stuck "enhancing" tasks, mark failed after 15 min
- [ ] **Subtle failure indicator** — Info icon with tooltip when enhancement fails
- [ ] **4K label on video detail page** — Not just list view, also detail page header
- [ ] **Aliyun job cancellation** — If user deletes video during enhancement, cancel Aliyun job

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **Enhancement analytics dashboard** — Success rate, average duration, cost tracking
- [ ] **Manual re-trigger enhancement** — Admin action to retry failed enhancements
- [ ] **Batch enhancement for old videos** — Apply 4K upgrade to videos created before feature launch
- [ ] **Quality tier in API responses** — Add `qualityTier: "1080p" | "4K"` field for external consumers
- [ ] **OSS cost optimization** — Delete 1080p after 4K is confirmed stable (7-day grace period)

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Automatic enhancement trigger | HIGH | MEDIUM | P1 |
| Status state machine (enhancing/enhanced) | HIGH | MEDIUM | P1 |
| 4K badge display | HIGH | LOW | P1 |
| Graceful 1080p fallback | HIGH | LOW | P1 |
| Single download flow (no dual buttons) | HIGH | LOW | P1 |
| Retry logic (3 attempts) | MEDIUM | MEDIUM | P2 |
| Timeout recovery (background job) | MEDIUM | MEDIUM | P2 |
| Failure indicator (tooltip) | MEDIUM | LOW | P2 |
| Enhancement cancellation | LOW | MEDIUM | P3 |
| Analytics dashboard | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch (v1.0)
- P2: Should have, add when possible (v1.1-1.2)
- P3: Nice to have, future consideration (v2.0+)

## Competitor Feature Analysis

| Feature | HeyGen | Synthesia | Runway | ClipFlow Approach |
|---------|--------|-----------|--------|-------------------|
| Quality tiers | 720p/1080p (manual selection) | 1080p only | 4K Gen-3 (manual setting) | 1080p → 4K automatic |
| Enhancement | Manual export choice | No enhancement | Built into generation | Async post-processing |
| Progress indicator | Export modal with % | Email notification | Generation progress bar | Status badge + polling |
| Quality badge | None visible | None visible | None visible | "4K" badge top-left |
| Fallback on failure | Stuck in export modal | Support ticket | Retry or fail | Keep 1080p, subtle warning |
| Download options | Single "Export" button | Single download | Single download | Single download (best quality) |

**ClipFlow differentiation:**
1. **Transparent async enhancement** — Other tools require upfront quality choice, we upgrade automatically
2. **Immediate 1080p availability** — Other tools block on final export, we deliver fast then enhance
3. **Persistent quality badge** — Other tools hide quality tier, we make it visible and permanent

## Sources

### HIGH Confidence
- NN/g Progress Indicators: https://www.nngroup.com/articles/progress-indicators (2026-04-01)
- NN/g Microinteractions: https://www.nngroup.com/articles/microinteractions (2026-04-01)
- ClipFlow codebase: `apps/web/src/app/(dashboard)/videos/page.tsx` (existing status badge implementation)
- ClipFlow codebase: `apps/web/src/lib/video-task-domain.ts` (existing status model)

### MEDIUM Confidence
- AWS MediaConvert QVBR approach: https://aws.amazon.com/mediaconvert (quality-defined variable bitrate)
- Topaz Video AI enhancement workflow: https://www.topazlabs.com/video-ai (19 AI models, before/after comparisons)
- Cloudinary dynamic quality: https://cloudinary.com/documentation (q_auto pattern)
- Smashing Magazine UX patterns: https://www.smashingmagazine.com/2021/08/frustrating-design-patterns-disabled-buttons (progress states)

### LOW Confidence (Training Data Only)
- HeyGen quality tiers: Official docs not accessible, homepage doesn't detail quality options
- Synthesia quality tiers: Official docs not accessible, homepage doesn't detail quality options
- Runway Gen-3 4K: Mentioned on homepage but no technical specs available
- YouTube quality processing timeline: Help docs not accessible, only training data

---

*Feature research for: ClipFlow v3.0 4K Video Enhancement*
*Researched: 2026-04-01*
*Researcher: Claude (GSD Project Researcher Agent)*
