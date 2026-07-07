---
phase: 12-downstream-adaptation-legacy-migration
plan: "03"
subsystem: testing
tags: [quality-regression, v2-ip-profile, llm-testing, intg-07]
dependency_graph:
  requires: [12-01]
  provides: [INTG-07]
  affects: [script-generator, ip-profile]
tech_stack:
  added: []
  patterns: [vitest-e2e, real-llm-comparison, describeIfKey-guard]
key_files:
  created:
    - apps/web/__tests__/e2e/v2-quality-regression.test.ts
  modified: []
decisions:
  - "5-point tolerance chosen for LLM non-determinism: v2 best score >= v1 best score - 5"
  - "Minimum quality threshold set to 40 (not 60) to account for keyword-based fallback scoring on generic templates"
  - "describeIfKey guard skips entire suite when THEROUTER_API_KEY is absent (no CI failure)"
  - "promptSnapshot computed at test initialization via buildIpProfilePromptSnapshot to exercise the actual v1/v2 rendering logic"
metrics:
  duration: "~2 minutes"
  completed: "2026-04-02"
  tasks_completed: 1
  files_created: 1
  files_modified: 0
---

# Phase 12 Plan 03: v2 Quality Regression Test Summary

## One-liner

Vitest e2e test comparing v1 flat vs v2 3D positioning script quality across 5 industries (空调维修, 餐饮, 电商, 教育, 健身) using real LLM calls with 5-point tolerance guard.

## What Was Built

A single vitest e2e test file (`apps/web/__tests__/e2e/v2-quality-regression.test.ts`) that serves as the final validation gate for the v4.0 milestone. It confirms the new 3D positioning system does not degrade script quality for any industry vertical.

### Key design points:

1. **Pattern compliance**: Follows `script-quality.test.ts` exactly — dotenv load, `LLMClient.reset()`, `describeIfKey` guard.

2. **5 industry fixtures**: Each industry has a paired v1 (flat fields) and v2 (3D positioning) profile with semantically equivalent content:
   - 空调维修 (HVAC repair): Wang Shifu — 15yr experience
   - 餐饮 (F&B): Zhang Laobao — restaurant operations consultant
   - 电商 (e-commerce): Li Jie — product selection expert
   - 教育 (education): Chen Laoshi — child focus specialist
   - 健身 (fitness): Zhao Jiaolian — busy office worker reduction coach

3. **promptSnapshot computation**: Profiles' `promptSnapshot` fields are computed before tests via `buildIpProfilePromptSnapshot()`, exercising the actual v1 flat-line format vs v2 three-section (【商业定位】【人设设计】【内容策略】) format.

4. **Score assertions**:
   - Both v1 and v2 must produce 3 candidates
   - All scripts must be > 50 chars
   - v2 best score >= v1 best score - 5 (5-point tolerance)
   - Both v1 and v2 must score >= 40 minimum

5. **Zero Mock compliance**: No hardcoded responses, no mock LLM clients. All assertions run against real LLM pipeline calls.

## Commits

| Task | Commit | Files |
|------|--------|-------|
| Task 1: v2 quality regression test | `92f5106` | apps/web/__tests__/e2e/v2-quality-regression.test.ts (405 lines) |

## Deviations from Plan

None — plan executed exactly as written. The TypeScript "cannot find vitest" error is pre-existing across all e2e test files and is not introduced by this change (identical error appears in `script-quality.test.ts`).

## Known Stubs

None. The test contains no stubs — all profiles have real industry-specific data and real LLM calls.

## Self-Check: PASSED

- [x] `apps/web/__tests__/e2e/v2-quality-regression.test.ts` exists (405 lines)
- [x] Commit `92f5106` exists in git log
- [x] All 5 industries present: 空调维修, 餐饮, 电商, 教育, 健身
- [x] `generateScriptCandidates` called 3+ times (v1 + v2 for each industry)
- [x] `buildIpProfilePromptSnapshot` imported and used
- [x] `LLMClient.reset()` present
- [x] `THEROUTER_API_KEY` env guard present
- [x] `timeout: 120_000` per test
- [x] `toBeGreaterThanOrEqual(v1BestScore - 5)` tolerance assertion
- [x] Minimum threshold `toBeGreaterThanOrEqual(40)` for both v1 and v2
