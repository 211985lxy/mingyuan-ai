---
phase: 01-query-generation
verified: 2026-03-25T12:30:00Z
status: gaps_found
score: 3/4 success criteria verified
re_verification: false
gaps:
  - truth: "Testing against 5 industry archetypes confirms primary queries return totalResults >= 10 from Pexels for at least 4 out of 5 industries"
    status: failed
    reason: "Integration tests (QGEN-01/02/03) cannot execute: PEXELS_API_KEY_* is absent from the test environment (.env.test and global-setup.ts). All 6 integration test cases fail with PexelsError: No PEXELS_API_KEY_* environment variables configured."
    artifacts:
      - path: "apps/web/__tests__/e2e/packaging-material-query.test.ts"
        issue: "Test file is correctly written and structurally complete (376 lines, zero mocks), but cannot run its integration section because the test environment does not load Pexels API keys."
      - path: "apps/web/__tests__/e2e/global-setup.ts"
        issue: "global-setup.ts only sets DATABASE_URL, REDIS_URL, and JWT secrets. It does not forward PEXELS_API_KEY_* from .env or any other source."
      - path: "apps/web/.env.test"
        issue: ".env.test does not contain PEXELS_API_KEY_* entries. The key exists in .env but vitest does not load .env by default — only .env.test via global-setup."
    missing:
      - "Add PEXELS_API_KEY_1 (and any other PEXELS_API_KEY_* vars) to apps/web/.env.test, OR add dotenv loading of .env in global-setup.ts, OR forward the keys programmatically in global-setup.ts"
      - "After env fix, run: cd apps/web && npx vitest run --reporter=verbose __tests__/e2e/packaging-material-query.test.ts and confirm 6 integration tests pass (21/21 total)"
human_verification:
  - test: "Visual review of generated queries for all 5 industry archetypes"
    expected: "Each industry archetype produces queries with domain-specific English visual terms. HVAC gets 'HVAC technician outdoor unit', not 'repair work'. Bakery gets 'baker kneading bread dough', not 'food process'."
    why_human: "LLM output quality and semantic relevance cannot be fully verified programmatically — human judgment required to confirm queries are meaningfully industry-specific rather than just containing a single matching keyword."
---

# Phase 01: Query Generation Verification Report

**Phase Goal:** Stock media queries accurately reflect the user's specific business and industry instead of producing vague generic keywords
**Verified:** 2026-03-25T12:30:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | HVAC business receives queries with HVAC-specific visual terms instead of vague terms like "small business process" | VERIFIED | `resolveVisualArchetype` returns "HVAC technician air conditioning" for HVAC input; 15/15 QGEN-04 unit tests pass; prompt contains explicit vocabulary table and few-shot examples |
| 2 | Each material role (product_detail, store_environment, process) produces visually distinct query types | VERIFIED | `getFallbackQuery` appends role-specific suffixes ("detail close-up", "workplace interior", "professional work"); system prompt contains `角色语义规范（必须遵守）` with per-role examples |
| 3 | Deterministic fallback (`getFallbackQuery`) produces business-specific keywords from IP profile, not "small business" | VERIFIED | Old `const subject = offer || industry || "small business"` pattern removed; replaced with `resolveVisualArchetype()` mapping 20 Chinese industries to English archetypes; generic fallback is "professional service business" |
| 4 | Testing against 5 industry archetypes confirms totalResults >= 10 from Pexels for at least 4 out of 5 | FAILED | Integration tests fail: `PexelsError: No PEXELS_API_KEY_* environment variables configured`. 6 integration tests produce 0 results. Test code is correctly written — the environment is misconfigured. |

**Score:** 3/4 success criteria verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/web/src/app/api/packaging-material-suggestions/route.ts` | Rewritten `getFallbackQuery` with `resolveVisualArchetype` + rewritten `buildSearchPlan` system prompt | VERIFIED | File exists (1042 lines). `resolveVisualArchetype` defined at line 98, maps 20 Chinese industries. `getFallbackQuery` calls it at line 133. System prompt at line 195 contains all required sections. |
| `apps/web/__tests__/e2e/packaging-material-query.test.ts` | Integration and unit tests for QGEN-01 through QGEN-04, min 80 lines | VERIFIED (structure) / PARTIAL (execution) | File exists, 376 lines. Both `describe("QGEN-04")` and `describe("QGEN-01/02/03")` blocks present. Zero mocks. 15/21 tests pass; 6 integration tests blocked by missing env vars. |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `getFallbackQuery` | `resolveVisualArchetype` | function call mapping Chinese industry to English archetype | WIRED | `const englishArchetype = resolveVisualArchetype(input.industry, input.primaryOffer)` at line 133 — confirmed present |
| `buildSearchPlan` systemPrompt | `LLMClient.shared().complete()` | system message content | WIRED | `角色語義規範` present in systemPrompt at line 231; passed to `llm.complete()` at line 282 |
| `packaging-material-query.test.ts` | `resolveVisualArchetype` / `getFallbackQuery` | test-local function copy | WIRED | Test-local implementations at lines 18–65 match route.ts exactly; 15 unit tests exercise both functions |
| `packaging-material-query.test.ts` | `POST /api/packaging-material-suggestions` | direct import of POST handler | WIRED | `import { POST } from "@/app/api/packaging-material-suggestions/route"` at line 12; `await POST(request)` at line 287 |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `route.ts buildSearchPlan` | `queries` (LLM path) | `LLMClient.shared().complete()` with real model `PACKAGING_MATERIAL_PLAN_MODEL` | Yes — real LLM call; no static return | FLOWING |
| `route.ts buildSearchPlan` | `fallback.queries` (deterministic path) | `resolveVisualArchetype` regex mapping → `getFallbackQuery` | Yes — real mapping, 20 categories, no hardcoded empty | FLOWING |
| `route.ts getFallbackQuery` | return value (English archetype string) | `resolveVisualArchetype` producing vocabulary per industry | Yes — 20 specific archetypes + generic fallback, no empty return | FLOWING |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `resolveVisualArchetype("空调维修", "上门维修空调")` contains "HVAC" | Unit test (vitest) | PASS — test confirms match `/HVAC/i` | PASS |
| `getFallbackQuery("product_detail", {industry: "空调维修"})` ends with "detail close-up" | Unit test (vitest) | PASS — 15/15 QGEN-04 unit tests pass | PASS |
| No Chinese characters leak into fallback queries | Unit test (vitest) | PASS — `/[\u4e00-\u9fff]/` assertion passes for all 3 roles | PASS |
| `maxTokens: 1200` set in buildSearchPlan | Grep check | PASS — confirmed at line 286 | PASS |
| System prompt contains `【行业视觉词汇表】` | Grep check | PASS — confirmed present | PASS |
| Integration: HVAC archetype produces Pexels totalResults >= 10 | vitest integration test | FAIL — `PexelsError: No PEXELS_API_KEY_*` | FAIL |
| QGEN-03: 4/5 archetypes pass totalResults >= 10 | vitest integration test | FAIL — 0/5 archetypes reached Pexels | FAIL |
| TypeScript compilation | `npx tsc --noEmit` | PASS — zero errors | PASS |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| QGEN-01 | 01-01-PLAN.md, 01-02-PLAN.md | LLM prompt forces extraction of specific visual subjects from IP profile | SATISFIED (implementation); BLOCKED (live validation) | System prompt contains vocabulary table + role semantics + few-shot examples. Integration test written correctly but blocked by missing Pexels API key in test env. |
| QGEN-02 | 01-01-PLAN.md, 01-02-PLAN.md | Each material role has role-specific visual semantics guidance in the prompt | SATISFIED | `角色語義規範（必須遵守）` section verified at line 231 in route.ts. Unit tests confirm role-specific suffixes on fallback queries. |
| QGEN-03 | 01-01-PLAN.md, 01-02-PLAN.md | LLM prompt includes few-shot examples demonstrating good vs bad query generation | SATISFIED | `【正確示例 vs 錯誤示例】` block confirmed at line 239 in route.ts with three diverse industry examples (HVAC, bakery, postpartum care). |
| QGEN-04 | 01-01-PLAN.md, 01-02-PLAN.md | Deterministic fallback generates business-specific keywords, not "small business" | SATISFIED | `resolveVisualArchetype()` present with 20 mapped industries. Old `const subject = offer || industry || "small business"` pattern confirmed removed. 15/15 unit tests pass. |

All four requirements are satisfied at the implementation level. QGEN-01 requires live Pexels validation (Success Criterion 4) which is blocked by missing test environment configuration.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/web/.env.test` | — | Missing `PEXELS_API_KEY_*` entries | Blocker | Integration tests cannot run; Success Criterion 4 cannot be verified without fixing test environment |
| `apps/web/__tests__/e2e/global-setup.ts` | — | Does not forward PEXELS keys from `.env` | Blocker | Same as above — tests that need real Pexels API will always fail in CI/test environment |

No stub patterns, placeholder content, empty implementations, or mock code found in either `route.ts` or `packaging-material-query.test.ts`. The Zero Mock Rule is observed: no `vi.mock`, `vi.spyOn`, or `jest.mock` calls exist in the test file.

---

## Human Verification Required

### 1. LLM Query Quality Review

**Test:** With Pexels keys configured, run `cd apps/web && npx vitest run --reporter=verbose __tests__/e2e/packaging-material-query.test.ts` and review the console output showing generated queries per archetype.

**Expected:** Console logs show `[HVAC] queries: ["hvac technician outdoor unit ...", ...]` — queries contain domain vocabulary from the vocabulary table, not generic terms like "repair work", "food process", or "small business".

**Why human:** LLM output contains probabilistic variation. Automated tests check for presence of at least one expected term, but semantic quality of the full query set requires human judgment to confirm the prompt is actually working as intended.

---

## Gaps Summary

One gap blocks the phase from being fully verified:

**Gap: Test environment missing Pexels API keys.**

The integration test suite (QGEN-01/02/03, Success Criterion 4) is correctly written and structurally complete, but it cannot execute because `PEXELS_API_KEY_*` is not available in the test environment. The key exists in `apps/web/.env` but `vitest` uses `global-setup.ts` which only sets database and JWT variables — it does not load `.env` or inject Pexels keys.

This is an environment configuration gap, not an implementation gap. The route implementation and test logic are both correct.

**Fix required:** Add `PEXELS_API_KEY_1` to `apps/web/.env.test`, or forward it from `global-setup.ts`, then confirm all 21 tests pass.

---

_Verified: 2026-03-25T12:30:00Z_
_Verifier: Claude (gsd-verifier)_
