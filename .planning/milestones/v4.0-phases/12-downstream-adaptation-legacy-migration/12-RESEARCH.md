# Phase 12: Downstream Adaptation & Legacy Migration - Research

**Researched:** 2026-04-02
**Domain:** TypeScript/Next.js integration layer — LLM consumer adaptation, legacy UX migration, quality regression validation
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
All implementation choices are at Claude's discretion — discuss phase was skipped per user setting.
Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

Key decisions from STATE.md accumulated context:
- profileVersion dual-track — v1 users never blocked, upgrade is opt-in
- buildIpProfilePromptSnapshot already returns correct format per version (transparent for brief/ai-fill and packaging-material-suggestions)
- Upgrade nudge is non-blocking and dismissible (banner, not modal)
- Quality regression test validates v2 generates equal or better script quality

### Claude's Discretion
All implementation choices are at Claude's discretion.

### Deferred Ideas (OUT OF SCOPE)
None — discuss phase skipped.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INTG-01 | script-generator.ts buildContextBlock and scoreWithAI/scoreWithKeywords adapt to v2 promptSnapshot and 3D fields | Codebase analysis — see Architecture Patterns §1 |
| INTG-02 | hot-topic-intelligence.ts FitInput.ipProfile extended for v2 fields | Codebase analysis — see Architecture Patterns §2 |
| INTG-03 | brief/ai-fill and packaging-material-suggestions consume v2 promptSnapshot transparently | Codebase analysis — confirmed transparent via buildIpProfilePromptSnapshot; see Don't Hand-Roll §1 |
| INTG-04 | Legacy user upgrade entry — v1 complete users see "Upgrade IP Profile" prompt, old fields pre-fill 5 questions | Codebase analysis — ip-profile/page.tsx is the correct place; see Architecture Patterns §3 |
| INTG-05 | /create page v1 compatibility — v1 isComplete=true users not blocked by new logic | Codebase analysis — isComplete already version-aware via getIpProfileMissingFields; see Architecture Patterns §4 |
| INTG-06 | Home page banner for v1 users (non-blocking upgrade nudge, not modal) | Codebase analysis — home/page.tsx currently shows modal for incomplete; needs banner for v1-complete; see Architecture Patterns §5 |
| INTG-07 | Quality regression validation — 5 industries A/B test v1 vs v2 promptSnapshot script generation quality | Codebase analysis — pattern mirrors script-quality.test.ts; see Architecture Patterns §6 |
</phase_requirements>

---

## Summary

Phase 12 is an integration and legacy-migration phase. The infrastructure built in Phases 10-11 (dual-version schema, `buildIpProfilePromptSnapshot`, `isIpProfileComplete`, `getIpProfileMissingFields`) is already version-aware. The work here falls into four buckets: (1) update two LLM consumer type definitions to accept v2 fields (`script-generator.ts`, `hot-topic-intelligence.ts`), (2) add non-blocking upgrade UI for v1 complete users, (3) preserve /create backward compatibility (which is already satisfied by the existing logic but must be verified), and (4) write a quality regression test.

The most sensitive area is `script-generator.ts`. The `scoreWithAI` and `scoreWithKeywords` functions currently hard-code v1 flat field reads (`ipProfile.industry`, `ipProfile.ipTraits`, `ipProfile.toneOfVoice`, `ipProfile.callToAction`, `ipProfile.proofPoints`). For v2 profiles these flat fields may be empty/null — the v2 equivalent information lives in `business`, `persona`, and `content` JSON columns. The adaptation must extract persona traits from `persona.traits[]` and content tags from `content.themes[].name` and write them into the scoring context when flat fields are absent.

The home page and ip-profile page UI changes are the only UI work in this phase and require invoking the `ui-ux-pro-max` skill for design system compliance.

**Primary recommendation:** Audit every direct flat-field read in `script-generator.ts`; introduce a thin `resolveScriptContext(ipProfile)` helper that normalises v1/v2 into a unified set of scoring fields, then thread that helper into `scoreWithAI`, `scoreWithKeywords`, and `fallbackResult`. Brief/ai-fill and packaging-material-suggestions require no code changes because they already call `buildIpProfilePromptSnapshot` which is already v2-aware.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.x (project standard) | All source files | Project convention |
| Next.js App Router | 15.x (project standard) | Route handlers + pages | Project convention |
| shadcn/ui | project-installed | UI components only | CLAUDE.md mandate |
| vitest | project-installed | Test runner | Existing test infra (`vitest.config.ts`) |
| Prisma | project-installed | DB access | Project ORM |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | project-installed | Icons in banner UI | Per ui-ux-pro-max rule: no emoji icons |
| sonner | project-installed | Toast notifications | Already used in ip-profile/page.tsx for dismiss feedback |

**Installation:** No new packages required. All dependencies are already installed.

---

## Architecture Patterns

### Recommended Project Structure

No new directories are needed. All changes are in-place edits to existing files:

```
apps/web/src/
├── lib/
│   ├── script-generator.ts          ← INTG-01: adapt scoring context
│   └── hot-topic-intelligence.ts    ← INTG-02: extend FitInput.ipProfile type
├── app/
│   ├── (dashboard)/
│   │   ├── home/page.tsx            ← INTG-06: add upgrade banner
│   │   ├── ip-profile/page.tsx      ← INTG-04: add upgrade banner for v1 complete
│   │   └── create/page.tsx          ← INTG-05: verify no v1 block (read-only)
│   └── api/
│       ├── brief/ai-fill/route.ts   ← INTG-03: no change needed
│       └── packaging-material-suggestions/route.ts ← INTG-03: no change needed
└── __tests__/e2e/
    └── v2-quality-regression.test.ts ← INTG-07: new test file
```

---

### Pattern 1: INTG-01 — script-generator.ts v2 Adaptation

**Current behaviour:** `buildContextBlock` reads `ipProfile.promptSnapshot` directly (correct — already v2-aware text from `buildIpProfilePromptSnapshot`). The scoring path (`scoreWithAI`, `scoreWithKeywords`, `fallbackResult`) reads flat v1 fields (`industry`, `ipTraits`, `toneOfVoice`, `proofPoints`, `callToAction`, `displayName`) directly from `ipProfile`.

**Problem for v2 users:** These flat fields are null/empty on a v2 profile. The LLM scoring context will read `"IP特征：未指定"` and `"口吻要求：未指定"`, degrading score accuracy.

**What to change:**

1. Extend the `GenerateScriptCandidatesParams.ipProfile` Pick type to include the v2 JSON columns (`business`, `persona`, `content`, `profileVersion`).
2. Add a private helper `resolveScriptScoringFields(ipProfile)` that returns a unified flat representation:
   - `displayName` — unchanged
   - `industry` — from `ipProfile.industry` || `business.core` (first word or whole string)
   - `ipTraits` — from `ipProfile.ipTraits` || `persona.traits.join("、")`
   - `toneOfVoice` — from `ipProfile.toneOfVoice` || `persona.expressionStyle`
   - `callToAction` — from `ipProfile.callToAction` (v1 flat) — v2 profiles may not have this; fall back to empty string
   - `proofPoints` — from `ipProfile.proofPoints` — v2 profiles may not have this; fall back to empty string
3. Replace direct flat-field reads in `scoreWithAI` scoring context block and `scoreWithKeywords` with calls to `resolveScriptScoringFields`.
4. `fallbackResult` → `generateWithFallback` also reads flat fields; apply same helper.

**Key insight:** `buildContextBlock` is already correct — it reads `ipProfile.promptSnapshot` which is already the properly-formatted v2 snapshot. Only the scoring/fallback code needs updating.

```typescript
// Conceptual pattern — in script-generator.ts
interface ResolvedScoringFields {
  displayName: string
  industry: string
  ipTraits: string
  toneOfVoice: string
  callToAction: string
  proofPoints: string
}

function resolveScriptScoringFields(
  ipProfile: GenerateScriptCandidatesParams["ipProfile"]
): ResolvedScoringFields {
  const business = ipProfile.business as BusinessPositioning | null
  const persona = ipProfile.persona as PersonaDesign | null
  return {
    displayName: ipProfile.displayName ?? ipProfile.nickname ?? "",
    industry: ipProfile.industry || business?.core || "",
    ipTraits: ipProfile.ipTraits || persona?.traits?.join("、") || "",
    toneOfVoice: ipProfile.toneOfVoice || persona?.expressionStyle || "",
    callToAction: ipProfile.callToAction || "",
    proofPoints: ipProfile.proofPoints || "",
  }
}
```

**Files to edit:** `apps/web/src/lib/script-generator.ts`

---

### Pattern 2: INTG-02 — hot-topic-intelligence.ts FitInput.ipProfile Extension

**Current behaviour:** `FitInput.ipProfile` declares only v1 flat fields (see lines 44-59 in `hot-topic-intelligence.ts`). The `evaluateHotTopicFitUncached` function renders `ipSnapshot` from `input.ipProfile.promptSnapshot || buildIpProfilePromptSnapshot(input.ipProfile)` — so the LLM prompt is already v2-safe. However the TypeScript type is incomplete.

**What to change:**

Add v2 optional fields to the `FitInput.ipProfile` inline type:
```typescript
ipProfile: {
  id: string
  displayName: string | null
  nickname: string | null
  industry: string | null
  primaryOffer: string | null
  targetAudience: string | null
  ipTraits: string | null
  toneOfVoice: string | null
  proofPoints: string | null
  callToAction: string | null
  promptSnapshot: string | null
  // v2 additions:
  profileVersion?: number | null
  business?: unknown
  persona?: unknown
  content?: unknown
}
```

The `buildFitCacheKey` function in the same file uses `ipSnapshot` for the hash — since `buildIpProfilePromptSnapshot` already produces the correct v2 snapshot, the cache key will correctly differ between v1 and v2 profiles. No further change needed.

**Files to edit:** `apps/web/src/lib/hot-topic-intelligence.ts`

---

### Pattern 3: INTG-03 — brief/ai-fill and packaging-material-suggestions (Transparent)

**Current behaviour (confirmed):**

- `brief/ai-fill/route.ts` line 48-50: `const ipContext = ipProfile ? buildIpProfilePromptSnapshot(ipProfile) : "..."` — already v2-aware.
- `packaging-material-suggestions/route.ts`: calls `buildIpProfilePromptSnapshot` and reads `industry`, `primaryOffer`, `targetAudience` from the profile for deterministic query fallback. These v1 flat fields may be null on a v2 profile.

**Finding:** `packaging-material-suggestions` has a subtle dependency on `ipProfile.industry` and `ipProfile.primaryOffer` (used in `resolveVisualArchetype` and `getFallbackQuery`). For v2 profiles these are null. The route needs to extract the industry proxy from `business.core` when flat fields are absent.

**What to change in packaging-material-suggestions/route.ts:**

In the POST handler where it reads `ipProfile.industry` / `ipProfile.primaryOffer` to pass to `buildSearchPlan`, add a v2-aware extraction:

```typescript
// Extract industry-like signal for visual archetype resolution
const effectiveIndustry = ipProfile.industry
  || (ipProfile.business as BusinessPositioning | null)?.core
  || null
const effectiveOffer = ipProfile.primaryOffer
  || (ipProfile.business as BusinessPositioning | null)?.differentiator
  || null
```

**Files to edit:** `apps/web/src/app/api/packaging-material-suggestions/route.ts` (minor)

---

### Pattern 4: INTG-04 — IP Profile Page Upgrade Banner for v1 Complete Users

**Current behaviour (ip-profile/page.tsx):** The page already handles v1→v2 upgrade via the `PageView` state machine (`"wizard" | "generating" | "result" | "dashboard"`). For a v1 complete user (`profileVersion=1, isComplete=true`) the page loads to the old IP profile editing form, not the wizard (this is the existing "returning user" experience).

**What to add:** When the user is v1 complete, render a dismissible banner at the top of the ip-profile page with:
- Text: "Upgrade to 3D Positioning"
- A "Upgrade" button that pre-fills the 5 wizard questions from existing flat fields and transitions to `PageView = "wizard"` at step 1

**Pre-fill mapping (from CONTEXT.md specifics):**
| Wizard Question | Source Field |
|----------------|--------------|
| Q1 (surveyIndustry) | `ipProfile.industry` |
| Q2 (surveyTargetCustomer) | `ipProfile.displayName` |
| Q3 (surveyMonetization) | `ipProfile.primaryOffer + targetAudience` → first option or free-text |
| Q4 (surveyPersonalTraits) | `ipProfile.ipTraits` |
| Q5 (surveyContentGoal) | `ipProfile.callToAction` |

**Implementation approach:**
- Add `showUpgradeBanner` boolean state, initialized to `profileVersion === 1 && isComplete === true`
- Banner uses shadcn/ui `Card` or an inline `div` with `Alert`-style styling (shadcn/ui `Alert` component is appropriate)
- "Dismiss" sets `showUpgradeBanner = false` (session-only; no persistence needed)
- "Upgrade" calls a `handleStartUpgrade()` function that pre-fills `surveyAnswers` state from flat fields then sets `pageView = "wizard"`
- Banner must not block access to existing v1 editing UI

**shadcn/ui component:** Use the existing pattern (Card + Button). The `Alert` component from shadcn/ui is ideal for the banner if already installed; otherwise use `Card`.

**Files to edit:** `apps/web/src/app/(dashboard)/ip-profile/page.tsx`

---

### Pattern 5: INTG-05 — /create Page v1 Compatibility Verification

**Current behaviour:** `create/page.tsx` uses `ipProfile?.isComplete` only to gate the hot-topic-fit call (line 794). There is no blocking gate that prevents v1 users from reaching script generation.

**Finding:** `isIpProfileComplete` (in `ip-profile.ts`) already uses `profileVersion` to decide which fields to check. The API returns `isComplete: true` for v1 complete users. The `create/page.tsx` correctly reads `ipProfile.isComplete` from the API response, which is version-aware.

**No code change required.** The create page already works for v1 complete users. This requirement is a verification task.

**Verification task:** Run the existing create flow test (`create-workbench.test.ts`) with a v1 profile seeded in the database to confirm no regression.

---

### Pattern 6: INTG-06 — Home Page Upgrade Banner for v1 Users

**Current behaviour (home/page.tsx):** The home page fetches the IP profile and shows a `Dialog` (modal) when `!profile.isComplete`. This modal behaviour should NOT apply to v1 complete users. The current code only shows the modal for incomplete profiles, so v1 complete users do not currently see any upgrade nudge.

**What to add:**
1. When `profile.isComplete === true` and `profile.profile?.profileVersion === 1` (or `profileVersion` absent, defaulting to 1), show a top-of-page banner (not a modal).
2. Banner text: "Unlock AI-powered 3D positioning — upgrade your IP profile"
3. CTA: "Learn more" button — links to `/ip-profile`
4. Banner is dismissible (session state, no persistence needed)
5. Must NOT show for v2 complete users

**Implementation approach:**
- Add `showUpgradeBanner` state initialized after `getIpProfile()` resolves: `profile.isComplete && (profile.profile?.profileVersion ?? 1) === 1`
- Render banner above the main content using a `Card` or a top-bar `div` with dismiss button
- Must NOT replace the existing incomplete-profile modal (that still shows for users with no complete profile)
- shadcn/ui `Alert` with a "Dismiss" X button; or inline styled `Card` with `Button` variant="link"

**Files to edit:** `apps/web/src/app/(dashboard)/home/page.tsx`

---

### Pattern 7: INTG-07 — Quality Regression Test

**Pattern:** Mirror `__tests__/e2e/script-quality.test.ts`. That file already demonstrates how to create a `describe` block that runs `generateScriptCandidates` with a hardcoded IP profile.

**Structure of the new test (`v2-quality-regression.test.ts`):**

```
For each of 5 industries (空调维修, 餐饮, 电商, 教育, 健身):
  1. Build a v1 IP profile fixture (flat fields only, no business/persona/content)
  2. Build a v2 IP profile fixture (business/persona/content set, flat fields null/empty)
  3. Call generateScriptCandidates with identical brief inputs for both
  4. Assert: v2 best score >= v1 best score (or within -5 points tolerance)
  5. Assert: v2 scores pass minimum threshold (>=60)
  6. Assert: scripts are non-empty and not error strings
```

**Key design decisions:**

- Test uses real LLM calls (Zero Mock Rule) — requires `THEROUTER_API_KEY` in env
- Timeout per test case: 120,000ms (same as existing script-quality.test.ts)
- Use `nyquist_validation: false` is set in config.json, so this test is a developer-run validation, not a CI gate
- The test is placed in `__tests__/e2e/` alongside existing quality tests
- Must call `LLMClient.reset()` after dotenv load (pattern from script-quality.test.ts)
- Use `vitest` `describe` + `it` (no `test.each` to keep error messages clear per industry)

**v2 promptSnapshot generation for test:** Call `buildIpProfilePromptSnapshot` directly with a v2 profile object (no API round-trip needed).

**Score comparison logic:**
```typescript
const v1BestScore = Math.max(...v1Result.scores.map(s => s.overall))
const v2BestScore = Math.max(...v2Result.scores.map(s => s.overall))
expect(v2BestScore).toBeGreaterThanOrEqual(v1BestScore - 5) // 5-point tolerance
```

**Files to create:** `apps/web/__tests__/e2e/v2-quality-regression.test.ts`

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| v1/v2 prompt generation | Custom string builder | `buildIpProfilePromptSnapshot` from `ip-profile.ts` | Already dual-version aware, tested |
| v1/v2 completion check | Custom field presence logic | `isIpProfileComplete` / `getIpProfileMissingFields` from `ip-profile.ts` | Already version-aware |
| Dismissible banner state | localStorage persistence | React `useState` (session only) | Upgrade nudge is intentionally lightweight; no need to remember dismiss |
| Score comparison | Complex statistical model | Simple max-score comparison with 5-point tolerance | Requirements say "equal or better" — exact threshold, no need for statistics |
| Upgrade pre-fill | API call | Local mapping from existing `ipProfile` state | Profile already loaded in page state at the time of upgrade click |

**Key insight:** The entire "transparent" category (INTG-03) is largely pre-solved by `buildIpProfilePromptSnapshot`. The brief/ai-fill route is fully transparent — no code change needed there. Only the packaging-material-suggestions route needs a minor fix for the visual archetype resolution fallback.

---

## Common Pitfalls

### Pitfall 1: v2 Scoring Context Uses Null Flat Fields
**What goes wrong:** `scoreWithAI` renders `"IP特征：未指定"` because `ipProfile.ipTraits` is null on a v2 profile. The LLM then gives low `voiceFit` scores even when the v2 persona is rich.
**Why it happens:** The scoring context block reads raw flat fields, not the resolved v2 equivalents.
**How to avoid:** Always pass resolved fields (from `resolveScriptScoringFields`) to the scoring context, not raw `ipProfile` props.
**Warning signs:** `voiceFit` score is consistently low for v2 test profiles.

### Pitfall 2: Upgrade Banner Shows for v2 Complete Users
**What goes wrong:** Banner logic reads `isComplete === true` without checking `profileVersion`, accidentally showing the upgrade nudge to users who already upgraded.
**Why it happens:** `isComplete` is true for both v1 and v2 complete profiles.
**How to avoid:** Always gate on `(profile?.profileVersion ?? 1) === 1` in addition to `isComplete === true`.
**Warning signs:** Banner shows on ip-profile dashboard for users who have all three 3D sections filled.

### Pitfall 3: /create Page Breaks for v1 Users After profileVersion Field Added to API Response
**What goes wrong:** If `create/page.tsx` reads `ipProfile.profile?.profileVersion` anywhere and it is undefined (old cached response), it may hit an unexpected undefined.
**Why it happens:** The `ApiIpProfile` type declares `profileVersion` as optional (`profileVersion?: number`). Existing code that uses strict equality without a null check will fail.
**How to avoid:** Always use `(profile?.profileVersion ?? 1)` for version checks. Never `profile.profileVersion === 1` without nullish coalescing.
**Warning signs:** TypeScript compiler warns or runtime produces NaN comparisons.

### Pitfall 4: FitCacheKey Collision Between v1 and v2 Profiles
**What goes wrong:** If two users — one v1, one v2 — produce the same `buildFitCacheKey` hash, they share a hot-topic-fit cache entry designed for the wrong profile.
**Why it happens:** `buildFitCacheKey` hashes `ipSnapshot` content. If v1 and v2 produce different `promptSnapshot` text (they do), the hashes differ automatically.
**How to avoid:** No action needed — `buildIpProfilePromptSnapshot` produces structurally different text for v1 vs v2 (v2 has `【商业定位】`, `【人设设计】`, `【内容策略】` sections). This is already correct.
**Warning signs:** Would only appear if `promptSnapshot` column stores identical text for v1 and v2 profiles — check that `buildIpProfilePromptSnapshot` is called correctly on save.

### Pitfall 5: Quality Regression Test Fails Due to LLM Non-Determinism
**What goes wrong:** `v2BestScore >= v1BestScore - 5` fails because a single LLM call produces an unusually poor v2 result.
**Why it happens:** LLM output variance is high for creative tasks.
**How to avoid:** Use a tolerance of 5 points (not strict equality). Alternatively, run 2 trials and take the best. Document the known variance in the test.
**Warning signs:** Flaky test failures with scores fluctuating ±10 points.

### Pitfall 6: Home Page Banner API Call is Synchronous with Profile Fetch
**What goes wrong:** Banner state is set before `getIpProfile` resolves, causing a flash of the banner on initial render even for v2 users.
**Why it happens:** State initialized to `false` then set in a `useEffect` — this is correct and avoids the problem.
**How to avoid:** Initialize `showUpgradeBanner = false`, then set it inside the `.then()` callback of `getIpProfile`.
**Warning signs:** Banner briefly flashes on page load for v2 users.

---

## Code Examples

### Existing `buildIpProfilePromptSnapshot` v2 Output Format
Source: `apps/web/src/lib/ip-profile.ts` lines 98-130

For a v2 complete profile, the snapshot contains:
```
你正在为个人 IP「{displayName}」创作文案。

【商业定位】
核心定位：{business.core}
目标人群：{business.audience}
核心价值：{business.value}
差异化：{business.differentiator}

【人设设计】
专业度：{persona.expertiseLevel}
表达风格：{persona.expressionStyle}
人设标签：{persona.traits.join("、")}

【内容策略】
内容主题：{content.themes.map(t => `${t.name}(${t.ratio}%)`).join("、")}
内容形式：{content.formats.join("、")}
更新节奏：{content.rhythm}
```

This is what `buildContextBlock` already receives via `ipProfile.promptSnapshot`. No change needed there.

### Existing Hot Topic Fit — ipSnapshot Usage
Source: `apps/web/src/lib/hot-topic-intelligence.ts` line 262

```typescript
const ipSnapshot =
  input.ipProfile.promptSnapshot || buildIpProfilePromptSnapshot(input.ipProfile)
```

This pattern correctly falls back to calling `buildIpProfilePromptSnapshot` if `promptSnapshot` is null. Type extension is still needed to allow passing v2 fields.

### Quality Test Pattern (from script-quality.test.ts)
```typescript
import { config } from "dotenv"
config({ path: resolve(__dirname, "../../.env") })
import { LLMClient } from "@/lib/llm/client"
LLMClient.reset()
import { generateScriptCandidates } from "@/lib/script-generator"

it("test", { timeout: 120_000 }, async () => {
  const result = await generateScriptCandidates({ ... })
  expect(result.candidates.length).toBe(3)
})
```

### shadcn/ui Alert Component for Upgrade Banner
```tsx
// Banner pattern — non-blocking, dismissible
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

{showUpgradeBanner && (
  <Alert className="flex items-center justify-between">
    <AlertDescription>
      Unlock AI-powered 3D positioning — upgrade your IP profile
    </AlertDescription>
    <div className="flex items-center gap-2 shrink-0">
      <Button variant="link" size="sm" onClick={() => router.push("/ip-profile")}>
        Learn more
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setShowUpgradeBanner(false)}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  </Alert>
)}
```

Note: Check if `Alert` is installed in `apps/web/src/components/ui/alert.tsx` before using. If not present, use a styled `div` with Card styling instead.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single-version flat field profile | Dual-track v1/v2 with `buildIpProfilePromptSnapshot` dispatch | Phase 10 | All LLM consumers reading `promptSnapshot` are already v2-safe |
| `isComplete` checks single field set | `getIpProfileMissingFields` version-dispatches | Phase 10 | Create page and API are already backward compatible |

**Already correct (no change):**
- `brief/ai-fill/route.ts`: Uses `buildIpProfilePromptSnapshot` — fully transparent
- `packaging-material-suggestions` LLM prompt path: Uses `buildIpProfilePromptSnapshot` — transparent; only fallback visual archetype resolution needs a fix
- `buildContextBlock` in `script-generator.ts`: Uses `ipProfile.promptSnapshot` — already v2-aware
- `/api/ip-profile` GET+PUT: Already version-aware since Phase 10

**Needs update (actual work):**
- `scoreWithAI` and `scoreWithKeywords` in `script-generator.ts`: Direct flat field reads
- `FitInput.ipProfile` type in `hot-topic-intelligence.ts`: Missing v2 optional fields
- Home page: No upgrade banner for v1 complete users
- IP profile page: No "Upgrade to 3D Positioning" banner for v1 complete users
- Quality regression test: Does not exist yet

---

## Open Questions

1. **Does `Alert` component exist in the project's shadcn/ui installation?**
   - What we know: `apps/web/src/components/ui/` has `card.tsx`, `badge.tsx`, `button.tsx`, `input.tsx` but Alert was not confirmed in the directory listing.
   - What's unclear: Whether `alert.tsx` was added in Phases 10-11.
   - Recommendation: The planner should check `ls apps/web/src/components/ui/alert.tsx` in Wave 0. If absent, use a `Card`-based pattern instead.

2. **Does `packaging-material-suggestions` route read `ipProfile.targetAudience` as well?**
   - What we know: The `buildSearchPlan` function signature includes `targetAudience?: string | null` (line 168). The route likely passes `ipProfile.targetAudience` there.
   - What's unclear: Whether a v2 profile stores the target audience equivalent in `business.audience`.
   - Recommendation: Use `ipProfile.targetAudience || (ipProfile.business as BusinessPositioning)?.audience || null` in the same v2-aware extraction block.

3. **Do the 5 industries for the quality regression test need any specific brief templates?**
   - What we know: The test can use the same generic template + brief patterns as `script-quality.test.ts`. The industries (空调维修, 餐饮, 电商, 教育, 健身) each need a minimal brief.
   - What's unclear: Whether the test should use a real ContentTemplate from the database or a fixture.
   - Recommendation: Use hardcoded fixture templates (same pattern as script-quality.test.ts) to avoid database dependency. This keeps the test self-contained.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| THEROUTER_API_KEY | INTG-07 quality regression | Unknown — env var | — | Test will skip with `process.env.THEROUTER_API_KEY` guard |
| vitest | INTG-07 test runner | Yes (vitest.config.ts exists) | project-installed | — |
| LLMClient | INTG-07 | Yes | project code | — |

**Missing dependencies with fallback:**
- THEROUTER_API_KEY: If absent, quality regression test should guard with `if (!process.env.THEROUTER_API_KEY) { return }` and log a clear warning rather than fail.

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on Phase 12 |
|-----------|-------------------|
| `shadcn/ui` only for UI components | Upgrade banners must use `Alert`, `Card`, `Button` from shadcn/ui — no custom banner components |
| Zero Mock Rule | Quality regression test (INTG-07) MUST use real LLM API. No hardcoded response payloads or mock scoring. |
| `ui-ux-pro-max` skill for all UI work | Must invoke skill before implementing home page banner and ip-profile upgrade banner |
| Three-layer product architecture | Changes to script-generator.ts affect the Scriptwriter layer — must preserve downstream lineage |
| No custom UI component systems | Dismissible banner = shadcn/ui component, not a custom Banner component |

---

## Sources

### Primary (HIGH confidence)
- Direct codebase read of `apps/web/src/lib/script-generator.ts` (full file, 837 lines)
- Direct codebase read of `apps/web/src/lib/ip-profile.ts` (full file, 161 lines)
- Direct codebase read of `apps/web/src/lib/hot-topic-intelligence.ts` (partial, lines 1-100, 200-400)
- Direct codebase read of `apps/web/src/app/api/brief/ai-fill/route.ts` (full file, 139 lines)
- Direct codebase read of `apps/web/src/app/api/packaging-material-suggestions/route.ts` (partial, lines 1-382)
- Direct codebase read of `apps/web/src/app/(dashboard)/home/page.tsx` (full file)
- Direct codebase read of `apps/web/src/app/(dashboard)/create/page.tsx` (partial)
- Direct codebase read of `apps/web/src/app/(dashboard)/ip-profile/page.tsx` (partial, lines 1-80)
- Direct codebase read of `apps/web/src/types/ip-profile-v2.ts` (full file)
- Direct codebase read of `apps/web/src/types/api.ts` (full file, relevant section)
- Direct codebase read of `apps/web/__tests__/e2e/script-quality.test.ts` (full file)
- Direct codebase read of `apps/web/vitest.config.ts` (full file)
- Direct codebase read of `.planning/config.json` (nyquist_validation: false confirmed)

### Secondary (MEDIUM confidence)
- STATE.md accumulated decisions section (cross-verified with codebase)
- CONTEXT.md specifics (pre-fill mapping, banner text) — taken as authoritative spec

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all dependencies confirmed in codebase
- Architecture (INTG-01, 02, 04, 05, 06, 07): HIGH — direct codebase reads, no speculation
- Architecture (INTG-03 transparent claim): HIGH — confirmed `buildIpProfilePromptSnapshot` call paths; packaging minor fix identified
- Pitfalls: HIGH — derived from direct code reading, not speculation

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable codebase, all dependencies locked)
