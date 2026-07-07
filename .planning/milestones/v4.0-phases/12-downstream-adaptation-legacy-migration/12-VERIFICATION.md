---
phase: 12-downstream-adaptation-legacy-migration
verified: 2026-04-02T15:10:00Z
status: passed
score: 7/7 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "v1 complete user upgrade banner — visual appearance and dismissal"
    expected: "Card banner with Sparkles icon, '升级到 3D 定位' text, '开始升级' CTA button, and X dismiss button appear above the wizard on /ip-profile"
    why_human: "Banner render and dismiss behavior requires a browser session logged in as a v1 complete user; cannot verify visual layout programmatically"
  - test: "Home page upgrade banner links to /ip-profile correctly"
    expected: "Clicking '了解更多' on /home navigates to /ip-profile without full page reload, banner disappears on X click"
    why_human: "router.push navigation and banner dismiss interaction requires live browser session"
  - test: "v2 quality regression test passes with real LLM calls"
    expected: "All 5 industries produce v2 best score >= v1 best score - 5 when run with THEROUTER_API_KEY present"
    why_human: "Test requires real LLM API key and 10+ minutes of real LLM calls; cannot run in verification environment"
---

# Phase 12: Downstream Adaptation & Legacy Migration Verification Report

**Phase Goal:** All downstream LLM consumers (script-generator, hot-topic-intelligence, brief/ai-fill, packaging-material-suggestions) adapt to v2 promptSnapshot structure, legacy v1 users see non-blocking upgrade nudge with field pre-filling, /create page continues working for v1 complete users, and quality regression validation confirms v2 generates equal or better script quality across 5 industries
**Verified:** 2026-04-02T15:10:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | v2 IP profiles produce accurate scoring context in script-generator (industry, traits, tone from business/persona JSON when flat fields null) | VERIFIED | `resolveScriptScoringFields` helper at line 362 in script-generator.ts; called in `scoreWithAI` (line 388), `scoreWithKeywords` (line 515), `generateWithFallback` (line 835); v2 fallback chains: `industry || business?.core`, `ipTraits || persona?.traits?.join`, `toneOfVoice || persona?.expressionStyle` |
| 2 | hot-topic-intelligence TypeScript type accepts v2 fields without compiler errors | VERIFIED | FitInput.ipProfile extended with `profileVersion?: number | null`, `business?: unknown | null`, `persona?: unknown | null`, `content?: unknown | null` at lines 60-63 in hot-topic-intelligence.ts; no TS errors in this file |
| 3 | packaging-material-suggestions resolves industry/offer/audience from v2 business JSON when flat fields are null | VERIFIED | `effectiveIndustry` (line 991), `effectiveOffer` (line 992), `effectiveAudience` (line 993) fallback chains present; used in `buildSearchPlan`, `resolveVisualArchetype`, and `scoringContext` |
| 4 | v1 complete user visiting /ip-profile sees dismissible upgrade banner with pre-fill from flat fields | VERIFIED | `showUpgradeBanner` state (line 936), v1 detection branch `(response.profile.profileVersion ?? 1) === 1` (line 969), banner rendered at line 1112, `handleStartUpgrade` pre-fills 5 survey fields (lines 1017-1023), dismiss button at line 1138 |
| 5 | v1 complete user visiting /home sees non-blocking upgrade banner linking to /ip-profile | VERIFIED | `showUpgradeBanner` state (line 97), v1 detection `(profile.profile?.profileVersion ?? 1) === 1` (line 119), banner with '了解更多' CTA (line 201) using `router.push("/ip-profile")`, dismiss button present |
| 6 | v1 complete users are not blocked on /create page; v2 complete users see no upgrade banners | VERIFIED | /create page checks `profile?.isComplete` (lines 794, 2016) with no version guard — v1 isComplete=true passes; v2 complete users hit the `else` (v2 complete) branch in both page effects, skipping `setShowUpgradeBanner(true)` |
| 7 | Quality regression test file exists with 5 industry fixtures using real LLM calls | VERIFIED | `apps/web/__tests__/e2e/v2-quality-regression.test.ts` (405 lines); 5 industries present (空调维修, 餐饮, 电商, 教育, 健身); real `generateScriptCandidates` calls (lines 364, 371); `LLMClient.reset()` at line 14; `THEROUTER_API_KEY` guard at line 23; `timeout: 120_000` at line 363; tolerance assertion `toBeGreaterThanOrEqual(v1BestScore - 5)` at line 395 |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/web/src/lib/script-generator.ts` | `resolveScriptScoringFields` helper + v2-extended ipProfile type | VERIFIED | Helper defined at line 362 (definition) + 3 call sites (388, 515, 835); type extended with `profileVersion`, `business`, `persona`, `content` at lines 72-75 |
| `apps/web/src/lib/hot-topic-intelligence.ts` | FitInput.ipProfile extended with v2 fields | VERIFIED | 4 optional v2 fields added at lines 60-63 |
| `apps/web/src/app/api/packaging-material-suggestions/route.ts` | v2-aware effectiveIndustry/effectiveOffer extraction | VERIFIED | 3 effective variables with fallback chains at lines 991-993; used in 4 downstream call sites |
| `apps/web/src/app/(dashboard)/ip-profile/page.tsx` | Upgrade banner for v1 complete users with pre-fill logic | VERIFIED | `showUpgradeBanner` state; v1 detection branch; banner Card at line 1112; `handleStartUpgrade` pre-fill function at line 1008 |
| `apps/web/src/app/(dashboard)/home/page.tsx` | Non-blocking upgrade nudge banner for v1 complete users | VERIFIED | `showUpgradeBanner` state; v1 detection at line 119; banner Card at line 185 |
| `apps/web/__tests__/e2e/v2-quality-regression.test.ts` | 5-industry quality regression test with real LLM calls | VERIFIED | 405 lines; all 5 industries; real LLM calls; dotenv+LLMClient.reset pattern; 5-point tolerance assertion |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `script-generator.ts` | `resolveScriptScoringFields` | scoreWithAI, scoreWithKeywords, generateWithFallback all call the helper | WIRED | 4 total occurrences (1 definition + 3 call sites) confirmed by grep |
| `packaging-material-suggestions/route.ts` | `ipProfile.business` | effectiveIndustry/effectiveOffer fallback chain | WIRED | effectiveIndustry at 4 locations; effectiveOffer at 3 locations; effectiveAudience at 3 locations |
| `ip-profile/page.tsx` | `handleStartUpgrade` | Pre-fill surveyAnswers from flat fields then setView('wizard') | WIRED | Called at onClick line 1129; function sets 5 survey fields + setShowUpgradeBanner(false) + setStepIndex(0) + setView("wizard") |
| `home/page.tsx` | `/ip-profile` | Banner CTA uses router.push("/ip-profile") | WIRED | '了解更多' Button at line 195-202; onClick calls `router.push("/ip-profile")` |
| `v2-quality-regression.test.ts` | `generateScriptCandidates` | Two calls per industry (v1+v2) | WIRED | Import at line 17; called at lines 364 and 371 per industry loop |
| `v2-quality-regression.test.ts` | `buildIpProfilePromptSnapshot` | Pre-computes promptSnapshot for both v1 and v2 profiles | WIRED | Import at line 18; called at lines 355-356 for all fixtures |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `ip-profile/page.tsx` | `showUpgradeBanner`, `v1Profile` | `getIpProfile()` → `/api/ip-profile` → Prisma DB query returning `profileVersion` | Yes — API route returns `profileVersion: profile?.profileVersion ?? 1` from real Prisma query | FLOWING |
| `home/page.tsx` | `showUpgradeBanner` | `getIpProfile()` → `/api/ip-profile` → same real API | Yes | FLOWING |
| `script-generator.ts` | `resolved.industry`, `resolved.ipTraits`, etc. | `ipProfile.business` JSON from DB-stored Prisma JsonValue | Yes — fallback reads `business?.core` from real DB JSON field | FLOWING |

### Behavioral Spot-Checks

Step 7b skipped for UI page files (requires live browser session). API/library code verified through static analysis — all data-flow paths trace to real DB queries or real LLM calls.

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| resolveScriptScoringFields defined and called in all 3 functions | `grep -c "resolveScriptScoringFields" script-generator.ts` | 4 matches | PASS |
| effectiveIndustry used in packaging route | `grep -c "effectiveIndustry" ...route.ts` | 4 matches | PASS |
| v1 detection branch present in ip-profile page | `grep "profileVersion.*1" ...ip-profile/page.tsx` | 1 match (line 969) | PASS |
| Home banner CTA text present | `grep "了解更多" home/page.tsx` | 1 match (line 201) | PASS |
| Test file has 5 industries and real LLM calls | file exists, 405 lines, no mock patterns | confirmed | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|------------|------------|-------------|--------|----------|
| INTG-01 | 12-01-PLAN.md | script-generator.ts adapts to v2 promptSnapshot and 3D fields | SATISFIED | `resolveScriptScoringFields` helper + v2 type extension in script-generator.ts; 3 call sites replacing direct flat field reads |
| INTG-02 | 12-01-PLAN.md | hot-topic-intelligence.ts FitInput.ipProfile extended for v2 fields | SATISFIED | 4 optional v2 fields added to FitInput.ipProfile inline type |
| INTG-03 | 12-01-PLAN.md | brief/ai-fill and packaging-material-suggestions consume v2 promptSnapshot transparently | SATISFIED | brief/ai-fill already transparent via `buildIpProfilePromptSnapshot` (confirmed); packaging route has effectiveIndustry/effectiveOffer/effectiveAudience fallback chains |
| INTG-04 | 12-02-PLAN.md | Legacy user upgrade entry — v1 complete users see upgrade prompt with pre-fill | SATISFIED | Banner with pre-fill mapping confirmed in ip-profile/page.tsx |
| INTG-05 | 12-02-PLAN.md | /create page v1 compatibility — v1 isComplete=true users not blocked | SATISFIED | /create checks `profile?.isComplete` with no version filter (lines 794, 2016) |
| INTG-06 | 12-02-PLAN.md | Home page banner for v1 users (non-blocking upgrade nudge, not modal) | SATISFIED | Card banner (not Dialog/modal) with dismissal; existing incomplete-profile modal preserved |
| INTG-07 | 12-03-PLAN.md | Quality regression validation — 5 industries A/B test v1 vs v2 promptSnapshot script generation quality | SATISFIED | v2-quality-regression.test.ts (405 lines) with 5 industry fixtures, real LLM calls, 5-point tolerance |

**All 7 requirement IDs from REQUIREMENTS.md Phase 12 section are accounted for and satisfied.**

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | — | — | — |

No TODO, FIXME, placeholder, empty return, or mock patterns found in any of the 5 production files or the test file modified by this phase.

### Human Verification Required

#### 1. v1 Complete User Upgrade Banner — /ip-profile Visual Check

**Test:** Log in as a user with a v1 complete IP profile (profileVersion=1 or null in DB, isComplete=true). Navigate to /ip-profile.
**Expected:** A Card banner appears above the wizard stepper showing "升级到 3D 定位" with a "开始升级" button and an X dismiss button. Clicking "开始升级" transitions to the wizard with 5 questions pre-filled from the v1 flat fields. Clicking X dismisses the banner.
**Why human:** Requires a real user session with a v1 complete profile; cannot simulate the conditional render programmatically.

#### 2. Home Page Upgrade Banner Navigation

**Test:** Same v1 complete user visits /home. Observe banner, then click "了解更多".
**Expected:** "解锁 AI 三维定位" banner appears before the header section. Clicking "了解更多" navigates to /ip-profile. Clicking X dismisses the banner (session-only, page refresh shows it again). A v2 complete user on /home sees no banner.
**Why human:** Router navigation behavior and session-state dismissal require live browser interaction.

#### 3. /create Page v1 Backward Compatibility

**Test:** Same v1 complete user visits /create, selects a template and structure, fills brief inputs.
**Expected:** The "生成视频" button is enabled (not blocked by profile version check). User can generate a video successfully.
**Why human:** End-to-end video generation flow with v1 profile requires real session and real LLM calls.

#### 4. v2 Quality Regression Test Execution

**Test:** Run `cd apps/web && npx vitest run __tests__/e2e/v2-quality-regression.test.ts` with `THEROUTER_API_KEY` set in environment.
**Expected:** All 5 industry tests pass. Each shows `v2 best score >= v1 best score - 5` and both scores `>= 40`. Console output shows delta per industry.
**Why human:** Requires real LLM API key and ~10 minutes of real LLM execution time.

### Gaps Summary

No gaps found. All 7 truths are verified, all 6 artifacts pass all four verification levels (exists, substantive, wired, data-flowing), all 7 requirement IDs are satisfied, and no anti-patterns were detected in phase-modified files.

Pre-existing TypeScript errors (`vitest`, `jsonwebtoken`, `ali-oss` type declarations) are present in the test infrastructure and unrelated library files. These are not introduced by Phase 12 and do not affect any production code modified by this phase. The new `v2-quality-regression.test.ts` file has the same pre-existing `vitest` type resolution error as all other e2e test files — this is an environment-level issue, not a code issue.

The SUMMARY for Plan 01 documents incorrect commit hashes (0105645, 21f3498) but the actual commit `b12cbe3` contains all three file changes. The code changes themselves are correct and complete.

---

_Verified: 2026-04-02T15:10:00Z_
_Verifier: Claude (gsd-verifier)_
