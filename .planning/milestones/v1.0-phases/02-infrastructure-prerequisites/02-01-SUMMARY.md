---
phase: 02-infrastructure-prerequisites
plan: "01"
subsystem: packaging-material-suggestions
tags: [oss, async, performance, decoupling]
dependency_graph:
  requires: []
  provides: [non-blocking-suggestion-response, async-oss-transfer]
  affects: [packaging-material-suggestions, packaging-materials]
tech_stack:
  added: []
  patterns: [fire-and-forget, Promise.allSettled]
key_files:
  created:
    - apps/web/__tests__/e2e/packaging-material-oss-decoupling.test.ts
  modified:
    - apps/web/src/app/api/packaging-material-suggestions/route.ts
decisions:
  - Async OSS transfers use Promise.allSettled so one failed transfer does not abort others
  - Cron endpoint transferPendingPexelsMedia serves as safety net for failed async transfers
  - isMaterialReadyForProduction durability gate remains unchanged — production-plan submission still blocks on ossStatus === "ready"
metrics:
  duration: "4 minutes"
  completed: "2026-03-25"
  tasks_completed: 2
  files_modified: 2
requirements_fulfilled: [INFRA-01]
---

# Phase 02 Plan 01: Decouple OSS Transfer from Suggestion Response Summary

**One-liner:** Non-blocking suggestion endpoint using fire-and-forget Promise.allSettled OSS transfer after response assembly, preserving the ossStatus === "ready" production durability gate.

## Objective

Decouple OSS transfer from the packaging-material-suggestions response path so suggestions return immediately with `ossStatus: "pending"` for fresh items instead of blocking 500ms-2s per item.

## Tasks Completed

### Task 1: Remove blocking OSS transfer from suggestion loop (commit: b75830a)

Removed the 40-line blocking OSS transfer block from the per-item loop in route.ts (lines 1003-1042). The `effectiveRow` pattern was eliminated entirely; all accesses now use `row` directly. A fire-and-forget block using `Promise.allSettled` was added after `signedSuggestions` is assembled and before the `return` statement.

**Key changes:**
- Deleted `let effectiveRow = row` and the blocking `await transferPexelsMediaToOss(...)` + re-fetch block
- Replaced all `effectiveRow.*` references with `row.*`
- Added async batch transfer using `prisma.pexelsMedia.findMany()` + `Promise.allSettled()` — not awaited
- The `.then()` chain logs warnings on partial failures; `.catch()` handles batch-level failures

### Task 2: Add test verifying OSS decoupling behavior (commit: 0046773)

Created `apps/web/__tests__/e2e/packaging-material-oss-decoupling.test.ts` with 8 tests:

- **Durability gate unit tests (5):** isMaterialReadyForProduction with ai_pexels/pending (false), ai_pexels/ready (true), manual_upload/pending (true), manual_library/pending (true); getBlockingAiMaterials filters mixed arrays correctly
- **Static analysis tests (3):** route.ts source does not contain `await transferPexelsMediaToOss`, does contain `Promise.allSettled`, does not contain `effectiveRow`

All 8 tests pass.

## Verification Results

- `grep -c "await transferPexelsMediaToOss" route.ts` → 0 (blocking call removed)
- `grep -n "Promise.allSettled" route.ts` → 1 match (fire-and-forget batch)
- `grep -n "effectiveRow" route.ts` → 0 matches (variable eliminated)
- `grep "ossStatus.*ready" packaging-materials.ts` → unchanged durability gate
- TypeScript compilation: zero errors
- All 8 vitest tests: passed

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all changes are real implementation, no stubs introduced.

## Self-Check: PASSED

- File `apps/web/__tests__/e2e/packaging-material-oss-decoupling.test.ts` exists
- File `apps/web/src/app/api/packaging-material-suggestions/route.ts` modified
- Commit b75830a exists (Task 1)
- Commit 0046773 exists (Task 2)
