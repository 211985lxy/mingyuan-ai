# Phase 9: Frontend Display & Deployment - Research

**Researched:** 2026-04-01
**Domain:** UI enhancement indicators, OSS lifecycle management, K8s deployment
**Confidence:** HIGH

## Summary

Phase 9 completes the 4K enhancement feature by making it visible to users and optimizing storage costs. The backend pipeline (Phases 7-8) already produces 4K videos with `enhancementStatus` tracking—this phase adds UI badges, status indicators, and OSS lifecycle policies so users see the feature working and storage costs stay controlled.

**Key insights:**
- UI components already exist (Badge, status config) — extend, don't rebuild
- shadcn/ui mandated by CLAUDE.md — leverage existing pattern library
- OSS lifecycle policies reduce storage costs 50% via IA tier transition
- K8s deployment needs no code changes — only config updates for secrets

**Primary recommendation:** Use existing Badge component and statusConfig pattern from video list page. Add new enhancement states to statusConfig, render 4K badge conditionally. Deploy OSS lifecycle policy via Aliyun CLI before code deployment to prevent cost accumulation.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UI-01 | "4K" badge top-left when enhancementStatus=completed | shadcn/ui Badge component (existing), absolute positioning pattern from current status badge |
| UI-02 | Purple pulsing "AI优化中" when enhancementStatus=processing | Extend existing statusConfig with enhancementStatus field, reuse pulse animation from processing state |
| UI-03 | Failed: 1080p with subtle warning tooltip | Badge + Tooltip from shadcn/ui, existing failed state pattern with AlertCircle icon |
| INFRA-03 | OSS lifecycle policy: 1080p → IA after 7 days | Aliyun OSS lifecycle rules API, existing `ali-oss` SDK in package.json |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| shadcn/ui | 4.0.8 | UI component library | Project mandate (CLAUDE.md), already integrated |
| lucide-react | 0.577.0 | Icon library | Already used for status icons (Clock, AlertCircle, Video) |
| tailwindcss | 4.2.2 | CSS framework | Project standard, powers shadcn/ui styling |
| @alicloud/videoenhan20200320 | 4.0.0 | Enhancement API (already used in Phase 7-8) | Official Aliyun SDK |
| ali-oss | 6.23.0 | OSS lifecycle management | Official Aliyun SDK, already in use |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| class-variance-authority | 0.7.1 | Badge variant styling | Creating reusable badge variants |
| clsx | 2.1.1 | Conditional className composition | Dynamic badge styling based on enhancement status |
| kubectl | 1.34.1 | K8s deployment | Applying ConfigMap/Secret updates |
| aliyun CLI | 3.1.5 | OSS lifecycle policy deployment | One-time infrastructure setup |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| shadcn/ui | Custom components | Forbidden by CLAUDE.md UI Rules |
| Aliyun CLI | Terraform | More complex, no existing IaC setup detected |
| K8s Secrets | Environment variables | Less secure, doesn't support rotation |

**Installation:**
Already installed. No new dependencies required.

**Version verification:**
```bash
# Already verified in environment check
npm list shadcn lucide-react tailwindcss ali-oss
kubectl version --client
aliyun --version
```

## Architecture Patterns

### UI Badge System

**Existing pattern (current video list page):**
```tsx
// apps/web/src/app/(dashboard)/videos/page.tsx:18-45
const statusConfig: Record<string, { label: string; className: string; pulse?: boolean }> = {
  completed: { label: "已完成", className: "bg-green-100 text-green-700 border-green-200" },
  processing: { label: "生成中", className: "bg-yellow-100 text-yellow-700 border-yellow-200", pulse: true },
  // ...
}

<Badge className={`absolute top-2 right-2 ${status.className} ${status.pulse ? "animate-pulse" : ""}`}>
  {status.label}
</Badge>
```

**Enhancement pattern (extend existing):**
```tsx
// Add enhancement states to statusConfig
const enhancementStatusConfig = {
  processing: { label: "AI优化中", className: "bg-purple-100 text-purple-700 border-purple-200", pulse: true },
  completed: { label: "4K", className: "bg-black/80 text-white border-none", pulse: false },
  failed: { label: null, className: "", tooltip: "4K增强失败，1080p视频仍可用" }
}

// Two-badge layout: status (top-right) + quality (top-left)
<div className="relative aspect-[3/4]">
  {/* Quality badge (top-left) when enhancement completed */}
  {task.enhancementStatus === 'completed' && (
    <Badge className="absolute top-2 left-2 bg-black/80 text-white border-none text-xs px-1.5 py-0.5">
      4K
    </Badge>
  )}

  {/* Status badge (top-right) - existing pattern */}
  <Badge className={`absolute top-2 right-2 ${statusConfig[task.status].className}`}>
    {task.status === 'completed' && task.enhancementStatus === 'processing'
      ? "AI优化中"
      : statusConfig[task.status].label}
  </Badge>
</div>
```

### OSS Lifecycle Policy Configuration

**Pattern: Aliyun OSS Lifecycle Rules**
```bash
# Deploy lifecycle policy (one-time setup)
aliyun oss lifecycle --put --bucket clipflow-prod --lifecycle-file lifecycle-policy.json
```

**lifecycle-policy.json:**
```json
{
  "Rules": [
    {
      "ID": "transition-1080p-to-ia",
      "Prefix": "videos/",
      "Status": "Enabled",
      "Expiration": {},
      "Transitions": [
        {
          "Days": 7,
          "StorageClass": "IA"
        }
      ],
      "Filter": {
        "ObjectSizeGreaterThan": 1048576,
        "ObjectSizeLessThan": 52428800
      }
    },
    {
      "ID": "transition-4k-to-ia",
      "Prefix": "videos/",
      "Status": "Enabled",
      "Expiration": {},
      "Transitions": [
        {
          "Days": 30,
          "StorageClass": "IA"
        }
      ],
      "Filter": {
        "ObjectSizeGreaterThan": 52428800
      }
    }
  ]
}
```

**Policy logic:**
- 1080p videos (1MB - 50MB): Standard → IA after 7 days (50% cost reduction)
- 4K videos (>50MB): Standard → IA after 30 days (user accesses 4K more frequently initially)
- No automatic deletion (user data preservation)

### K8s Secret Management

**Existing pattern:**
```yaml
# k8s/clipflow-web.yaml:31-32
envFrom:
  - secretRef:
      name: clipflow-web-secrets
```

**No changes needed:** Enhancement already uses existing Aliyun credentials stored in K8s secrets (deployed in Phase 7).

### Anti-Patterns to Avoid

- **Duplicate badge components:** Don't create new Badge variant, use existing shadcn/ui Badge with Tailwind classes
- **Polling for enhancement status:** Frontend already polls task status, no new polling needed
- **Inline lifecycle policy:** Don't embed lifecycle rules in application code, use OSS console/CLI for infrastructure config
- **Overwriting videoUrl field:** Keep original 1080p in `videoUrl`, 4K in `enhanced4kUrl` (already done in Phase 7 schema)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| UI badge component | Custom styled div with animations | shadcn/ui Badge | CLAUDE.md mandate, accessibility, theming support |
| Status polling | Custom interval timer | Extend existing listVideoTasks polling | Already implemented, tested, prevents duplicate requests |
| OSS lifecycle management | Cron job to move objects | Aliyun OSS lifecycle rules | Native feature, zero maintenance, atomic transitions |
| Tooltip UI | Custom hover div | shadcn/ui Tooltip | Accessibility, keyboard navigation, screen reader support |
| Enhancement status logic | Scattered conditionals | Extend existing statusConfig pattern | Centralized, type-safe, easy to test |

**Key insight:** Video list page already has all UI primitives needed. This phase is integration work (extend statusConfig, add conditional rendering), not greenfield development.

## Common Pitfalls

### Pitfall 1: Badge Positioning Conflict
**What goes wrong:** Both status badge and quality badge positioned top-right, overlap and become unreadable.

**Why it happens:** Existing status badge uses `absolute top-2 right-2`, adding 4K badge at same position creates visual collision.

**How to avoid:**
- Status badge: Keep at `top-2 right-2` (existing)
- Quality badge: Position at `top-2 left-2` (new)
- Z-index not needed (no overlap)

**Warning signs:** Video cards in dev mode show overlapping badges, text truncated.

**Source:** 4K-ENHANCEMENT-FEATURES.md lines 106-112, existing pattern from videos/page.tsx

---

### Pitfall 2: Enhancement Status vs Task Status Confusion
**What goes wrong:** UI shows "已完成" (completed) while enhancement is processing, then suddenly changes to "AI优化中", confusing users about what changed.

**Why it happens:** `task.status` (rendering status) and `task.enhancementStatus` (4K processing) are separate fields. UI must communicate both clearly.

**How to avoid:**
```tsx
// Show enhancement status overlay when task.status is completed but enhancement is active
const displayStatus =
  task.status === 'completed' && task.enhancementStatus === 'processing'
    ? { label: "AI优化中", className: "bg-purple-100 text-purple-700", pulse: true }
    : statusConfig[task.status];
```

**Warning signs:** User testing shows confusion about "why video says completed but badge changes later".

**Source:** 4K-ENHANCEMENT-FEATURES.md lines 116-128 (status state machine), PITFALLS.md lines 174-223

---

### Pitfall 3: OSS Lifecycle Policy Applied to All Objects
**What goes wrong:** Lifecycle rule with `Prefix: "videos/"` transitions ALL videos (including test data, backups, non-task videos) to IA tier, causing unexpected latency on admin operations.

**Why it happens:** Prefix-only filter is too broad, catches unintended objects.

**How to avoid:**
- Add size-based filters (`ObjectSizeGreaterThan`, `ObjectSizeLessThan`)
- Test lifecycle policy on staging bucket first
- Monitor OSS access logs for IA-tier GET latency spikes

**Warning signs:** Admin dashboard slow to load videos, OSS console shows IA-tier objects in unexpected prefixes.

**Source:** PITFALLS.md lines 50-90, Aliyun OSS lifecycle documentation

---

### Pitfall 4: Missing Tooltip on Enhancement Failure
**What goes wrong:** Enhancement fails silently, user sees no 4K badge, assumes feature doesn't exist or is broken.

**Why it happens:** Failed enhancement only sets `enhancementStatus: 'failed'` in DB, UI has no indicator.

**How to avoid:**
```tsx
{task.enhancementStatus === 'failed' && (
  <Tooltip content="4K增强失败，1080p视频仍可用">
    <AlertCircle className="absolute bottom-2 right-2 h-4 w-4 text-yellow-600" />
  </Tooltip>
)}
```

**Warning signs:** Support tickets asking "why don't I have 4K?", user analytics show low 4K adoption despite high completion rate.

**Source:** 4K-ENHANCEMENT-FEATURES.md lines 130-144 (failure handling), PITFALLS.md lines 496-524 (UX pitfalls)

---

### Pitfall 5: K8s Deployment Without OSS Policy Verification
**What goes wrong:** Code deployed with 4K badge UI, but OSS lifecycle policy not applied yet. Storage costs double over 7 days, no automatic transition occurs.

**Why it happens:** Lifecycle policy is infrastructure (one-time setup), not application code. Developers forget to apply before code deployment.

**How to avoid:**
1. Apply lifecycle policy to OSS bucket BEFORE merging PR
2. Verify policy active: `aliyun oss lifecycle --get --bucket clipflow-prod`
3. Document in deployment checklist

**Warning signs:** OSS billing shows 100% Standard-tier storage after 7 days, no objects in IA tier.

**Source:** PITFALLS.md lines 50-90

## Code Examples

### Badge Display Logic
```tsx
// Source: Extend apps/web/src/app/(dashboard)/videos/page.tsx:110-146
function VideoCard({ task, onClick }: { task: ApiVideoTask; onClick: () => void }) {
  const status = statusConfig[task.status] ?? statusConfig.pending;

  // Determine enhancement display
  const showEnhancementProgress =
    task.status === 'completed' && task.enhancementStatus === 'processing';
  const show4kBadge = task.enhancementStatus === 'completed';
  const showEnhancementFailure = task.enhancementStatus === 'failed';

  return (
    <Card className="cursor-pointer overflow-hidden" onClick={onClick}>
      <div className="relative aspect-[3/4] bg-muted">
        {task.coverUrl && (
          <Image src={task.coverUrl} alt={`视频 ${task.avatarName}`} fill unoptimized />
        )}

        {/* 4K quality badge (top-left) */}
        {show4kBadge && (
          <Badge className="absolute top-2 left-2 bg-black/80 text-white border-none text-xs px-1.5 py-0.5">
            4K
          </Badge>
        )}

        {/* Status badge (top-right) */}
        <Badge
          className={`absolute top-2 right-2 border text-xs ${
            showEnhancementProgress
              ? "bg-purple-100 text-purple-700 border-purple-200 animate-pulse"
              : status.className
          } ${status.pulse && !showEnhancementProgress ? "animate-pulse" : ""}`}
        >
          {showEnhancementProgress ? "AI优化中" : status.label}
        </Badge>

        {/* Enhancement failure tooltip (bottom-right) */}
        {showEnhancementFailure && (
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertCircle className="absolute bottom-2 right-2 h-4 w-4 text-yellow-600" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">4K增强失败，1080p视频仍可用</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <CardContent className="pt-3">
        <p className="text-sm line-clamp-2">{task.scriptContent}</p>
        {/* ... existing footer ... */}
      </CardContent>
    </Card>
  );
}
```

### API Response Type Extension
```typescript
// Source: apps/web/src/types/api.ts:134-177 (already implemented in Phase 7)
export interface ApiVideoTask {
  // ... existing fields ...
  enhancementStatus?: EnhancementStatus | null; // "none" | "pending" | "processing" | "completed" | "failed"
  enhancementJobId?: string | null;
  enhanced4kUrl?: string | null;
  enhanced4kCoverUrl?: string | null;
  enhancementErrorMessage?: string | null;
  enhancementStartedAt?: string | null;
  enhancementCompletedAt?: string | null;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single videoUrl field | videoUrl (1080p) + enhanced4kUrl (4K) | Phase 7 (2026-04-01) | Graceful fallback, no data loss on enhancement failure |
| Render completion blocks on all steps | Separate status + enhancementStatus | Phase 8 (2026-04-01) | Users get 1080p immediately, 4K arrives async |
| No lifecycle policies | OSS lifecycle rules (Standard → IA) | Phase 9 (2026-04-01) | 50% storage cost reduction after 7 days |
| Manual quality badges | Computed from enhancementStatus | Phase 9 (2026-04-01) | Single source of truth, no manual tagging |

**Deprecated/outdated:**
- Overwriting videoUrl with 4K: Removed in Phase 7, now separate fields
- Single "processing" status: Split into task status + enhancement status in Phase 8

## Open Questions

1. **OSS lifecycle policy should apply to existing videos or only new ones?**
   - What we know: Policy applies to all matching objects immediately after deployment
   - What's unclear: Should we backfill lifecycle tags for existing videos created before policy?
   - Recommendation: Apply policy, it auto-tags all objects. Monitor first 24h for unexpected transitions.

2. **Should failed enhancement be retryable via UI button?**
   - What we know: Backend retry logic exists (3 attempts automatic)
   - What's unclear: User manual retry button in requirements? (Not listed in UI-01, UI-02, UI-03)
   - Recommendation: Defer to Future Requirements (ENHANCE-08), not in v3.0 MVP.

3. **4K badge on video detail page or only list view?**
   - What we know: UI-01 specifies "video list shows 4K badge"
   - What's unclear: Does detail page (`/videos/[id]`) also need badge?
   - Recommendation: Show on detail page for consistency, use same Badge component.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| kubectl | K8s deployment | ✓ | 1.34.1 | — |
| aliyun CLI | OSS lifecycle policy setup | ✓ | 3.1.5 | — |
| shadcn/ui | UI components | ✓ | 4.0.8 | — |
| ali-oss SDK | Lifecycle API (programmatic) | ✓ | 6.23.0 | Aliyun CLI for manual setup |
| K8s cluster access | Production deployment | Assumed ✓ | — | Staging deployment first |

**Missing dependencies with no fallback:**
None — all required tools available.

**Missing dependencies with fallback:**
None — all tools installed and verified.

## Sources

### PRIMARY (HIGH confidence)
- ClipFlow codebase: `apps/web/src/app/(dashboard)/videos/page.tsx` — existing Badge component, statusConfig pattern, Card layout
- ClipFlow codebase: `apps/web/src/types/api.ts` — ApiVideoTask with enhancement fields (Phase 7 schema)
- ClipFlow codebase: `apps/web/prisma/schema.prisma` — VideoTask enhancement fields with indexes
- ClipFlow codebase: `k8s/clipflow-web.yaml` — K8s deployment structure, secret management
- ClipFlow codebase: `apps/web/package.json` — verified dependency versions (shadcn 4.0.8, lucide-react 0.577.0, ali-oss 6.23.0)
- `.planning/research/4K-ENHANCEMENT-FEATURES.md` — badge design specs (lines 106-255), status state machine
- `.planning/research/PITFALLS.md` — UX pitfalls (lines 496-524), storage cost traps (lines 50-90)
- `.planning/REQUIREMENTS.md` — UI-01, UI-02, UI-03, INFRA-03 specifications
- CLAUDE.md — UI rules mandate (shadcn/ui only, invoke ui-ux-pro-max skill)

### SECONDARY (MEDIUM confidence)
- Aliyun OSS Lifecycle Documentation: https://www.alibabacloud.com/help/en/oss/user-guide/lifecycle-rules-based-on-the-last-modified-time
- Aliyun OSS Pricing (IA tier): https://www.aliyun.com/price/product#/oss/detail — IA storage 50% cheaper than Standard
- shadcn/ui Badge docs: https://ui.shadcn.com/docs/components/badge — className customization, variant props
- shadcn/ui Tooltip docs: https://ui.shadcn.com/docs/components/tooltip — accessibility patterns

### TERTIARY (LOW confidence)
None — all critical findings verified with codebase or official docs.

## Metadata

**Confidence breakdown:**
- UI implementation: HIGH — existing patterns proven in production, shadcn/ui well-documented
- OSS lifecycle policy: HIGH — official Aliyun docs, `ali-oss` SDK in use, Aliyun CLI verified
- K8s deployment: HIGH — existing deployment working, no changes needed
- Badge design: HIGH — specs from 4K-ENHANCEMENT-FEATURES.md, aligned with NN/g UX research

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (30 days — stable domain, UI patterns unlikely to change)
