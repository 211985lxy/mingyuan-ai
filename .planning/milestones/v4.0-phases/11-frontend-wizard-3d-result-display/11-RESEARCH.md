# Phase 11: Frontend Wizard & 3D Result Display - Research

**Researched:** 2026-04-02
**Domain:** Next.js 16 / React 19 / shadcn/ui — multi-step wizard, inline editing, mobile-responsive layout
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- All implementation choices are at Claude's discretion (discuss phase was skipped).
- Stepper wizard UI pattern (matches existing avatar creation wizard in `create/page.tsx`).
- Synchronous LLM generation with loading animation (no background task needed).
- profileVersion dual-track: v1 users never blocked, upgrade is opt-in.

### Claude's Discretion
All implementation details — component decomposition, state shape, animation approach, mobile layout strategy — are at Claude's discretion, guided by the ROADMAP success criteria and codebase conventions.

### Deferred Ideas (OUT OF SCOPE)
- None — discuss phase skipped. Downstream LLM consumer adaptation is Phase 12, not Phase 11.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UI-01 | 5-question stepper wizard with progress indicator, card-based selection for Q1/Q3/Q5, text input for Q2/Q4 | See Architecture Patterns — WizardStep state machine, card-selection pattern using shadcn Card + click handler |
| UI-02 | AI generation loading state with progressive status messages | See Architecture Patterns — ProgressiveLoader component pattern, `useInterval` cycling messages |
| UI-03 | Three-card result display (Business / Persona / Content) with one-line AI summary at top | See Architecture Patterns — ResultDisplay layout, mapping ThreeDPositioning to three shadcn Cards |
| UI-04 | Inline editing for each sub-field (click-to-edit) and badge add/remove for tag arrays | See Architecture Patterns — InlineField and BadgeEditor patterns, onBlur save |
| UI-05 | Confirm + Save and Re-generate buttons on result page | Handled in result-view state; PUT /api/ip-profile with profileVersion=2 |
| UI-06 | First-time (wizard) vs returning (dashboard with edit buttons) mode based on profileVersion | Routing logic: profileVersion null or 1 with incomplete → wizard; profileVersion=2 with complete → dashboard |
| UI-07 | Mobile-responsive stepper (full-screen immersive, bottom sticky CTA, one question per screen) | See Architecture Patterns — mobile layout with sticky bottom bar, full-viewport step cards |
</phase_requirements>

---

## Summary

Phase 11 rewrites the existing `ip-profile/page.tsx` from a flat form into a dual-mode page:
1. **Wizard mode** — for new users (profileVersion null, 1 incomplete, or 1 with no 3D positioning) — shows a 5-question stepper with card selection (Q1/Q3/Q5) and text input (Q2/Q4), then calls `POST /api/ip-profile/generate-positioning` and shows a loading screen, then displays the 3D result with inline editing.
2. **Dashboard mode** — for returning users (profileVersion=2 with complete positioning) — shows the three positioning cards in read mode with "Edit" buttons.

All backend APIs were delivered in Phase 10. Phase 11 is entirely frontend work against those real APIs. No mock data is permitted.

The stack is Next.js 16 / React 19 / TypeScript / Tailwind v4 / shadcn/ui (only). The project's design system mandates Plus Jakarta Sans typography, indigo primary (#6366F1), green CTA (#22C55E), flat design style with 150–300 ms transitions. The `ui-ux-pro-max` skill MUST be invoked at the start of implementation to confirm design system directives.

**Primary recommendation:** Implement as a single `"use client"` page component with a `view` state machine (`wizard | generating | result | dashboard`), keeping wizard steps in a separate `WizardStep` enum. Decompose into sub-components: `WizardView`, `GeneratingView`, `ResultView`, `DashboardView`. Add a `generatePositioning` function to the API client.

---

## Project Constraints (from CLAUDE.md)

- **UI Rules:** All UI work MUST invoke the `ui-ux-pro-max` skill first. Components MUST use `shadcn/ui` only — no alternative UI libraries or custom component systems.
- **Zero Mock Rule:** No mock data, fake responses, or stub fallbacks in any flow. Use real API calls to `/api/ip-profile` and `/api/ip-profile/generate-positioning`. Validation must use real API routes and real database state.
- **ui-ux-pro-max pre-delivery checklist** must be verified before marking any plan complete:
  - No emojis as icons (use SVG from Lucide).
  - `cursor-pointer` on all clickable elements.
  - Hover states with smooth transitions (150–300 ms).
  - Light mode text contrast 4.5:1 minimum.
  - Focus states visible for keyboard navigation.
  - `prefers-reduced-motion` respected.
  - Responsive: 375 px, 768 px, 1024 px, 1440 px.
  - No horizontal scroll on mobile.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.1.7 (project) | App Router, SSR, routing | Already in use |
| React | 19.2.3 (project) | UI rendering | Already in use |
| shadcn/ui | ^4.0.8 | Component library (MANDATORY) | Project rule — no alternative |
| Tailwind CSS | ^4 | Styling | Already in use |
| lucide-react | ^0.577.0 | Icons | Already in use |
| zustand | ^5.0.12 | Auth store (existing) | Already in use |

### Supporting (already installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| sonner | ^2.0.7 | Toast notifications | Error/success feedback |
| @base-ui/react | ^1.3.0 | Progress primitive (backing shadcn Progress) | Step progress bar |

### shadcn/ui Components Available in Project
All components confirmed present in `/apps/web/src/components/ui/`:

| Component | Use in Phase 11 |
|-----------|-----------------|
| `Card`, `CardContent`, `CardHeader`, `CardTitle` | Wizard step cards, result cards, dashboard cards |
| `Button` | CTA buttons, card selection, "Edit", "Confirm & Save", "Re-generate" |
| `Badge` | Persona traits tags, content themes/formats — add/remove |
| `Textarea` | Q2 (target customer), Q4 (personal traits) text input |
| `Input` | Inline text editing for string fields |
| `Progress` + sub-parts | Wizard progress bar (1/5 … 5/5) |
| `Skeleton` | Loading placeholder during initial fetch |
| `Label` | Form labels |
| `Separator` | Visual dividers within result cards |

**No new shadcn/ui components need to be installed.** All needed components are already available.

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended File Structure
```
apps/web/src/app/(dashboard)/ip-profile/
├── page.tsx                    # Main page — view state machine, mode routing
└── (No sub-routes needed — all views rendered in same page)

apps/web/src/lib/api/client.ts  # Add generatePositioning() function
```

All sub-components live inline in `page.tsx` (following the existing pattern used in `create/page.tsx` which is ~1700 lines of co-located components). For Phase 11's scope, inline sub-components are cleaner than separate files.

### Pattern 1: View State Machine
**What:** Single page with a `view` state that determines which screen to render. No routing between wizard steps — all wizard steps live in the same page, controlled by a `stepIndex` (0–4).
**When to use:** All user journey phases in one URL (`/ip-profile`).

```typescript
// Source: inferred from create/page.tsx pattern (PHASES + currentPhase)
type PageView = "loading" | "wizard" | "generating" | "result" | "dashboard"

// Mode routing on load:
// profileVersion = null or 1 AND no complete 3D positioning → "wizard"
// profileVersion = 2 AND business + persona + content present → "dashboard"
// After successful generation → "result"
// After "Confirm & Save" → "dashboard"
```

### Pattern 2: Wizard Step Data Model
**What:** Steps defined as typed constants with metadata about input type.

```typescript
// Inferred from REQUIREMENTS.md and ip-profile-v2.ts types
const WIZARD_STEPS = [
  { id: 1, field: "surveyIndustry",       type: "cards",    label: "你的行业" },
  { id: 2, field: "surveyTargetCustomer", type: "textarea", label: "你的目标客户" },
  { id: 3, field: "surveyMonetization",   type: "cards",    label: "你的变现方式" },
  { id: 4, field: "surveyPersonalTraits", type: "textarea", label: "你的个人特质" },
  { id: 5, field: "surveyContentGoal",    type: "cards",    label: "你的内容目标" },
] as const

// Q1 industry options, Q3 monetization options, Q5 content goal options
// must be defined as static arrays — NOT fetched — per Zero Mock Rule and UX requirement
```

**Note:** Card option lists for Q1/Q3/Q5 are static constants defined in the frontend. The exact option values must align with what the backend AI generation prompt expects. These are not "mock data" — they are constrained vocabulary sets. See the Pitfalls section.

### Pattern 3: Card-Based Single Selection (Q1, Q5) and Multi-Select (Q3)
**What:** shadcn Card components rendered as clickable selection tiles.
**API contract:** `surveyMonetization` is `string[]` (multi-select), `surveyIndustry` and `surveyContentGoal` are `string` (single-select).

```typescript
// Pattern for clickable selection card (shadcn Card + cursor-pointer + border highlight)
// Source: design-system/clipflow/MASTER.md — card hover rules
<Card
  className={cn(
    "cursor-pointer transition-all duration-200",
    isSelected
      ? "border-primary bg-primary/5 shadow-sm"
      : "hover:border-primary/40 hover:shadow-sm"
  )}
  onClick={() => handleSelect(option)}
>
  <CardContent className="p-4 flex items-center gap-3">
    <Icon className="h-5 w-5 text-primary shrink-0" />
    <span className="text-sm font-medium">{option.label}</span>
  </CardContent>
</Card>
```

### Pattern 4: Progressive Status Loading Screen
**What:** A full-screen loading view with cycling status messages while waiting for the `POST /api/ip-profile/generate-positioning` response (3–8 seconds).
**When to use:** Between "Generate" click and result display.

```typescript
// Cycle through messages using setTimeout chains, NOT setInterval
// Messages defined in CONTEXT.md specifics:
const STATUS_MESSAGES = [
  "分析你的答案...",      // "Analyzing your answers..."
  "构建定位方案...",      // "Building positioning..."
  "完成收尾工作...",      // "Finalizing..."
]

// Important: the actual API call is in-flight during this animation.
// Do NOT start the API call before showing the loading screen.
// Do NOT fake the timing — let the real API response end the loading state.
```

### Pattern 5: Inline Editing — String Fields
**What:** Display-mode shows static text; clicking switches to an input in-place; blur saves via PUT /api/ip-profile.
**Pattern:** Controlled by `editingField: string | null` state.

```typescript
// Source: inferred from existing ip-profile/page.tsx pattern (form + save on button)
// Adjusted to per-field inline pattern
function InlineStringField({ label, value, fieldPath, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  // On blur: call onSave(fieldPath, draft), revert editing=false
  // Show pencil icon on hover in display mode (cursor-pointer)
}
```

**Key UX requirement (ui-ux-pro-max):** Validate on blur, not on submit. Show clear active state. Cursor pointer on display-mode text.

### Pattern 6: Badge Add/Remove for Tag Arrays
**What:** `traits` (PersonaDesign), `formats` (ContentStrategy), and `themes[].name` (ContentStrategy) are string arrays. Display as Badge chips with an "x" remove button and an "+" add input.

```typescript
// traits: string[] → each trait = Badge with remove button
// Adding: small Input that appends on Enter/blur
// Pattern: local draft state, save whole array on every mutation via PUT /api/ip-profile
```

### Pattern 7: Mobile Full-Screen Immersive Layout
**What:** On mobile (< 768 px), each wizard step occupies the full viewport with a sticky bottom CTA. On desktop, the stepper is a centered card layout.
**When to use:** Wizard mode only. Result/dashboard modes use standard card layout.

```typescript
// Mobile: fixed bottom bar with "Next" / "Generate" CTA
// Content scrollable in between
// Step indicator at top: "1 / 5", "2 / 5" etc.
// Tailwind responsive classes:
// - Mobile: full-screen flex-col with pb-20 for sticky bar clearance
// - Desktop: max-w-2xl mx-auto (centered card)

// From ui-ux-pro-max: overscroll-behavior: contain on wizard container
// to prevent accidental pull-to-refresh on mobile
```

### Pattern 8: profileVersion Routing Logic
**What:** Determines whether to show wizard or dashboard on page load.

```typescript
// Source: ip-profile-v2.ts hasCompletePositioning() and isV2Profile()
// profileVersion=null or undefined → treat as v1 → show wizard
// profileVersion=1 → show wizard (upgrade path)
// profileVersion=2 AND business + persona + content all present → show dashboard
// profileVersion=2 AND incomplete → show result view (edge case: mid-flow)

// This logic runs after GET /api/ip-profile resolves.
// During load: show skeleton (shadcn Skeleton component)
```

### Anti-Patterns to Avoid
- **Emoji icons:** Use Lucide SVG icons only (project and ui-ux-pro-max rule).
- **scale transforms on hover:** Use color/border/shadow changes, not `scale-105` on cards (causes layout shift).
- **Mocking the API timeout:** Never add artificial `setTimeout` delay to simulate generation. Use real API response.
- **Saving on every keystroke in inline editing:** Save only on blur to avoid hammering the API.
- **Using any component library other than shadcn/ui:** Forbidden by project rules.
- **Showing wizard to profileVersion=2 complete users:** They must land directly on dashboard view.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Progress bar | Custom CSS bar | shadcn `Progress` (already installed) | Accessible, animated, matches design |
| Skeleton loading | Custom shimmer | shadcn `Skeleton` | Already in use across the app |
| Toast notifications | Custom toast | `sonner` (already installed and used in `create/page.tsx`) | Consistent with project |
| Badge chips | Custom pill component | shadcn `Badge` | Project standard |
| Step indicator numbers | Custom stepper | Simple `{stepIndex + 1} / {WIZARD_STEPS.length}` text + Progress bar | No stepper library needed — overkill for 5 steps |

**Key insight:** No new packages are needed. Every required UI primitive is either already in shadcn/ui or available via existing dependencies.

---

## Runtime State Inventory

> Phase 11 is greenfield frontend work (no rename/refactor). This section is SKIPPED.

---

## Environment Availability Audit

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Next.js runtime | Yes | 20.20.2 | — |
| Next.js | App framework | Yes | 16.1.7 (project), 16.2.2 (registry) | — |
| `POST /api/ip-profile/generate-positioning` | UI-02 generating view | Yes (Phase 10 delivered) | — | — |
| `GET /api/ip-profile` | Initial load mode routing | Yes (Phase 10 delivered) | — | — |
| `PUT /api/ip-profile` | Confirm & Save, inline edit save | Yes (Phase 10 delivered) | — | — |
| MariaDB / Prisma | Backing all APIs | Yes (existing infrastructure) | — | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None — all Phase 10 APIs confirmed delivered.

**Client function gap:** `generatePositioning()` is not yet in `/src/lib/api/client.ts`. It must be added in Plan 1. The route exists at `POST /api/ip-profile/generate-positioning`; only the client-side call wrapper is missing.

---

## Common Pitfalls

### Pitfall 1: Q1/Q3/Q5 Option Lists Are Not Arbitrary Free Text
**What goes wrong:** Developer treats card options as arbitrary labels and sends display text to the API. The AI prompt in `ip-profile-v2-prompt.ts` expects specific domain vocabulary. Mismatched option values produce poor positioning output.
**Why it happens:** The option values visible in the UI look like plain strings but the AI prompt is calibrated to industry-standard Chinese vocabulary.
**How to avoid:** The static option arrays for Q1 (industry), Q3 (monetization), and Q5 (content goal) should use the same vocabulary the AI prompt was designed around. Cross-reference `buildPositioningPrompt()` in `ip-profile-v2-prompt.ts` when defining card options.
**Warning signs:** Generated positioning output reads as generic/boilerplate for valid option selections.

### Pitfall 2: surveyMonetization Is string[] Not string
**What goes wrong:** Q3 sends a single string instead of an array. The `generate-positioning` API validates `Array.isArray(body.surveyMonetization)` and returns 400 if not an array.
**Why it happens:** Q3 allows multi-select (monetization paths), while Q1/Q5 are single-select.
**How to avoid:** `surveyMonetization` state must be `string[]`. Card selection for Q3 must toggle items in/out of an array. Minimum 1 selection required before allowing "Next".
**Warning signs:** 400 error from `generate-positioning` route.

### Pitfall 3: Inline Editing Overwrites the Entire Profile on Every Save
**What goes wrong:** Each blur event on an inline field calls `PUT /api/ip-profile` with the full v2 body including positioning. If another inline field is mid-edit, its draft is not yet reflected in the primary state, causing a stale-write race.
**Why it happens:** Single `upsertIpProfile()` call sends full body.
**How to avoid:** Keep a single source-of-truth state object for the full positioning. Merge inline edits into this object before persisting. Debounce or sequence saves. Alternatively, save only the specific sub-field by merging the changed value into the current full state before calling PUT.
**Warning signs:** Edits to one field disappearing after editing another field.

### Pitfall 4: Mobile Sticky CTA Obscuring Content
**What goes wrong:** On mobile, the sticky "Next" button overlays the last card option or the textarea, making the last answer invisible or untappable.
**Why it happens:** Fixed bottom element doesn't account for safe-area-inset on iOS, and content doesn't have enough bottom padding.
**How to avoid:** Add `pb-24 sm:pb-0` to scrollable content area. Use `safe-area-inset-bottom` padding on the sticky bar: `pb-[env(safe-area-inset-bottom)]`.
**Warning signs:** Bottom option card not visible on iPhone Safari.

### Pitfall 5: Wrong Mode on Direct Navigation
**What goes wrong:** A v2 user navigates directly to `/ip-profile` and sees the wizard instead of the dashboard.
**Why it happens:** Initial state defaults to `wizard` before the GET response resolves.
**How to avoid:** Initial `view` state must be `"loading"` (shows skeleton). Route to `"wizard"` or `"dashboard"` only after the API response confirms profileVersion and positioning completeness.
**Warning signs:** Flash of wizard UI before redirecting to dashboard.

### Pitfall 6: Re-generate Does Not Reset Result View
**What goes wrong:** "Re-generate" button sends a new generation request but the old result cards remain visible, causing confusing double-state.
**Why it happens:** `view` state is not reset to `"generating"` before calling the API.
**How to avoid:** On "Re-generate" click: immediately set `view = "generating"`, then call the API, then on success set `view = "result"` with new data.
**Warning signs:** Old content briefly visible while new content loads.

---

## Code Examples

### Add generatePositioning to API Client
```typescript
// Add to apps/web/src/lib/api/client.ts
// Source: Matches existing pattern in client.ts (request() wrapper)
import type { GeneratePositioningRequest, GeneratePositioningResponse } from "@/types/api"

export async function generatePositioning(
  input: GeneratePositioningRequest
): Promise<GeneratePositioningResponse> {
  const payload = await request<{ data: ThreeDPositioning }>(
    "/api/ip-profile/generate-positioning",
    {
      method: "POST",
      body: JSON.stringify(input),
      timeout: 30000, // 30s timeout — LLM can take up to 8s; add buffer
    }
  )
  return payload
}
```

### View State Machine Shell
```typescript
// Source: pattern from create/page.tsx (currentPhase state + conditional render)
type PageView = "loading" | "wizard" | "generating" | "result" | "dashboard"

export default function IpProfilePage() {
  const [view, setView] = useState<PageView>("loading")
  const [stepIndex, setStepIndex] = useState(0)
  const [surveyAnswers, setSurveyAnswers] = useState<SurveyAnswers>(EMPTY_SURVEY)
  const [positioning, setPositioning] = useState<ThreeDPositioning | null>(null)
  const [savedProfile, setSavedProfile] = useState<ApiIpProfile | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getIpProfile().then((data) => {
      const profile = data.profile
      if (isV2Profile(profile) && hasCompletePositioning(profile)) {
        setPositioning({ business: profile.business, persona: profile.persona, content: profile.content })
        setSavedProfile(profile)
        setView("dashboard")
      } else {
        // Pre-fill survey answers if v1 fields exist (for upgrade path — Phase 12 handles full pre-fill)
        setView("wizard")
      }
    }).catch(() => setView("wizard"))
  }, [])

  // Render based on view
  if (view === "loading") return <LoadingScreen />
  if (view === "wizard") return <WizardView ... />
  if (view === "generating") return <GeneratingView />
  if (view === "result") return <ResultView ... />
  return <DashboardView ... />
}
```

### Progressive Loading Messages Pattern
```typescript
// Source: React 19 pattern — no useInterval dependency needed
const GENERATION_MESSAGES = [
  "分析你的答案...",
  "构建定位方案...",
  "完成收尾工作...",
]

function GeneratingView() {
  const [msgIndex, setMsgIndex] = useState(0)

  useEffect(() => {
    if (msgIndex >= GENERATION_MESSAGES.length - 1) return
    const timer = setTimeout(
      () => setMsgIndex((i) => Math.min(i + 1, GENERATION_MESSAGES.length - 1)),
      2000 // Cycle every 2s
    )
    return () => clearTimeout(timer)
  }, [msgIndex])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <p className="text-base font-medium text-foreground transition-opacity duration-300">
        {GENERATION_MESSAGES[msgIndex]}
      </p>
    </div>
  )
}
```

### Inline String Field Pattern
```typescript
// Source: inferred from ip-profile/page.tsx (form input pattern)
function InlineStringField({
  label,
  value,
  onSave,
}: {
  label: string
  value: string
  onSave: (newValue: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  const commit = () => {
    setEditing(false)
    if (draft.trim() !== value) onSave(draft.trim())
  }

  if (editing) {
    return (
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit() }}
      />
    )
  }

  return (
    <p
      className="cursor-pointer rounded px-1 py-0.5 hover:bg-muted transition-colors duration-150 text-sm"
      onClick={() => { setDraft(value); setEditing(true) }}
      title="点击编辑"
    >
      {value || <span className="text-muted-foreground italic">点击添加</span>}
    </p>
  )
}
```

### Mobile Sticky CTA Shell
```typescript
// Source: Tailwind v4 responsive pattern + safe-area-inset
// Applied to WizardView on mobile
<div className="relative flex min-h-screen flex-col md:block md:min-h-0">
  {/* Scrollable content */}
  <div className="flex-1 overflow-y-auto pb-24 md:pb-0 overscroll-contain">
    {/* Step content */}
  </div>

  {/* Sticky bottom CTA — mobile only */}
  <div className="fixed bottom-0 left-0 right-0 border-t bg-background p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] md:static md:border-0 md:p-0">
    <Button className="w-full cursor-pointer" onClick={handleNext}>
      {stepIndex < WIZARD_STEPS.length - 1 ? "下一步" : "生成 IP 定位"}
    </Button>
  </div>
</div>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Flat form ip-profile (v1) | Wizard + 3D result display (v2) | Phase 11 | Complete page rewrite |
| aiFillIpProfile() for AI | generatePositioning() for AI | Phase 10/11 | Different endpoint and response shape |
| v1 ApiIpProfile flat fields | v2 ThreeDPositioning structured JSON | Phase 10 | UI must handle both legacy and new shape |

**Deprecated / superseded in this phase:**
- The current `ip-profile/page.tsx` form: replaced entirely by the new dual-mode page.
- `aiFillIpProfile()` client function: remains for v1 backward compat but is not used in the new wizard flow.

---

## Open Questions

1. **Q1 / Q3 / Q5 card option values**
   - What we know: The AI prompt in `buildPositioningPrompt()` does not hardcode specific expected values for industry/monetization/goal — it uses whatever the user provides.
   - What's unclear: Whether the quality-gate in `generate-positioning` route (AIGEN-06) rejects certain industry values as too generic.
   - Recommendation: Define 8–12 common Chinese business industry options for Q1, 6–8 monetization types for Q3, and 5–6 content goal types for Q5. Keep labels specific enough to avoid the quality-gate's generic rejection. Validate with a real end-to-end test after implementation.

2. **Summary sentence at top of result view**
   - What we know: CONTEXT.md says "Your IP positioning: [summary]". The `generate-positioning` API response only returns `{ data: { business, persona, content } }` — there is no `summary` field.
   - What's unclear: Whether the summary should be derived from the business positioning fields on the frontend (e.g., "{business.core} · {business.audience}") or whether the API needs a new `summary` field.
   - Recommendation: Derive the summary on the frontend from `business.core` + `business.audience`. This requires no API change and the result is deterministic. Example: `你的 IP 定位：{business.core}，服务{business.audience}`.

3. **Confirm & Save persistence of survey inputs**
   - What we know: PUT /api/ip-profile with profileVersion=2 accepts survey fields + positioning.
   - What's unclear: Whether the wizard should persist survey answers along with positioning on "Confirm & Save" (so the user can see what they answered if they re-enter wizard mode).
   - Recommendation: Include `surveyIndustry`, `surveyTargetCustomer`, `surveyMonetization`, `surveyPersonalTraits`, `surveyContentGoal` in the PUT body alongside `business`, `persona`, `content`. The API already accepts them.

---

## Sources

### Primary (HIGH confidence)
- Codebase: `/apps/web/src/app/(dashboard)/ip-profile/page.tsx` — existing page to be replaced
- Codebase: `/apps/web/src/app/api/ip-profile/generate-positioning/route.ts` — API contract for generation
- Codebase: `/apps/web/src/app/api/ip-profile/route.ts` — GET/PUT API contract
- Codebase: `/apps/web/src/types/ip-profile-v2.ts` — TypeScript types for all v2 fields
- Codebase: `/apps/web/src/lib/ip-profile-v2-validation.ts` — Zod schemas defining all field constraints
- Codebase: `/apps/web/src/lib/api/client.ts` — existing API client patterns
- Codebase: `/apps/web/src/components/ui/` — confirmed available shadcn components
- Codebase: `/apps/web/src/app/(dashboard)/create/page.tsx` — existing stepper/phase pattern
- Codebase: `/home/ubuntu/clipflow/design-system/clipflow/MASTER.md` — project design system
- Skill: `.claude/skills/ui-ux-pro-max/SKILL.md` — design rules + pre-delivery checklist

### Secondary (MEDIUM confidence)
- `ui-ux-pro-max` search results: stepper wizard patterns, loading state patterns, inline validation patterns

### Tertiary (LOW confidence)
- None.

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — all packages are already installed and in use.
- Architecture: HIGH — patterns derived directly from existing codebase (`create/page.tsx` stepper, `ip-profile/page.tsx` form, `generate-positioning/route.ts` API contract).
- Pitfalls: HIGH — derived from API validation code and type definitions in the existing codebase.

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable stack; no fast-moving dependencies)
