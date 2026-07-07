---
phase: 1
slug: query-generation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-25
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | apps/web/vitest.config.ts |
| **Quick run command** | `cd apps/web && npx vitest run --reporter=verbose __tests__/e2e/packaging-material-query.test.ts` |
| **Full suite command** | `cd apps/web && npx vitest run --reporter=verbose __tests__/e2e/packaging-material-query.test.ts` |
| **Estimated runtime** | ~15 seconds (real Pexels API calls) |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | QGEN-01 | integration | `vitest run packaging-material-query` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 1 | QGEN-02 | integration | `vitest run packaging-material-query` | ❌ W0 | ⬜ pending |
| 1-01-03 | 01 | 1 | QGEN-03 | integration | `vitest run packaging-material-query` | ❌ W0 | ⬜ pending |
| 1-02-01 | 02 | 1 | QGEN-04 | integration | `vitest run packaging-material-query` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/web/__tests__/e2e/packaging-material-query.test.ts` — test stubs for QGEN-01..04
- [ ] Test helpers for calling packaging-material-suggestions API with real Pexels

*Existing vitest infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| LLM prompt quality review | QGEN-01, QGEN-03 | Prompt engineering quality is subjective | Review system prompt text for clarity, specificity, and few-shot example quality |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
