# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

---

## Milestone: v4.0 — IP 档案三维定位升级

**Shipped:** 2026-04-02
**Phases:** 3 (10-12) | **Plans:** 7 | **Files changed:** 29 (+6,017/-396 lines)

### What Was Built
- Dual-version IpProfile schema (profileVersion field, 5 survey inputs, 3 JSON positioning columns) with zero-downtime Prisma migration
- AI generation endpoint with Zod validation, ratio normalization auto-fix, 2-retry pipeline, and prompt injection protection
- 5-question stepper wizard (card-grid for Q1/Q3/Q5, textarea for Q2/Q4) with view state machine and mobile-first immersive UX
- Three-card 3D result display (Business/Persona/Content) with InlineStringField and BadgeEditor, Confirm/Re-generate actions
- `resolveScriptScoringFields` helper centralizing v1/v2 field resolution across all scoring call sites
- Non-blocking v1 upgrade banners on /home and /ip-profile with 9→5 field pre-fill mapping

### What Worked
- **Discuss-skip + auto-advance** enabled fully autonomous execution across all 3 phases without user interruption
- **Audit-first approach** caught the DB migration gap before marking milestone complete — prevented a silent production failure
- **Phase 10 type definitions** (ip-profile-v2.ts, api.ts extensions) set up clean foundation for Phase 11 UI work with no type conflicts
- **resolveScriptScoringFields pattern** consolidated 3 divergent null-check patterns into a single helper cleanly

### What Was Inefficient
- **Worktree isolation required manual cherry-picks**: Phase 11 Plan 02 and Phase 12 Plan 01 both ran in isolated worktrees whose feat commits didn't auto-merge back to `remote-exec`. Required `git show worktree:file > working-tree-file` for Phase 11 (conflict) and `git cherry-pick` for Phase 12 (clean). Consider `parallelization: false` for this repo.
- **REQUIREMENTS.md metadata lag**: DATA-01..06 and AIGEN-01..06 checkboxes were never updated after Phase 10 execution (the `phase complete` CLI returned `requirements_updated: false`). Required manual fix at archive time. The traceability table is useful but needs automated checkbox sync.
- **DB migration credentials gap**: Phase 10 execution created the migration file but couldn't apply it to live DB (invalid credentials). This surfaced at audit as a deploy blocker. Credential validation should be a pre-execution gate.

### Patterns Established
- **`resolveScriptScoringFields` pattern**: When adapting multiple call sites to v1/v2 branching logic, extract one centralized resolver rather than inline null-checks at each call site
- **`(profileVersion ?? 1) === 1` guard**: Treat null/undefined profileVersion as v1 for backward compat — established in Phase 12 and should be followed in all future v1/v2 branching
- **View state machine for complex UI flows**: `'loading' | 'wizard' | 'generating' | 'result' | 'dashboard'` pattern avoids scattered boolean flags; use this in future multi-step UI pages

### Key Lessons
1. **Worktree executor pattern creates silent merge gaps** — parallel agents running in isolation are efficient but require explicit cherry-pick protocols; the orchestrator must verify feat commits landed on the target branch, not just docs commits
2. **Schema migrations need credentials pre-check** — if live DB credentials aren't available during plan execution, the migration file is created but the deploy step is silently skipped; add a credentials check as a pre-execution gate or document it as a known manual step
3. **Audit file is the best milestone health signal** — the `v4.0-MILESTONE-AUDIT.md` 3-source cross-reference (VERIFICATION.md × SUMMARY frontmatter × REQUIREMENTS.md) caught the metadata lag discrepancy clearly; this format should be standardized for all future milestones

### Cost Observations
- Model mix: ~100% sonnet (claude-sonnet-4-6)
- Execution mode: remote-exec branch with autonomous workflow
- Notable: All 3 phases executed in a single day (2026-04-02) with zero user interventions required

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 Smart Material Matching | 3 | 6 | Initial GSD setup |
| v2.0 Official Website | 3 | 4 | UI work with ui-ux-pro-max skill |
| v3.0 4K Video Enhancement | 3 | 6 | Aliyun SDK integration, webhook lifecycle |
| v4.0 IP 档案三维定位升级 | 3 | 7 | First fully autonomous run; worktree isolation surfaced as gap |

### Top Lessons (Verified Across Milestones)

1. **Milestone audit before completion** catches integration gaps that phase-level verification misses (v4.0: DB migration gap, metadata lag)
2. **Centralized adapters over scattered null-checks**: resolveScriptScoringFields (v4.0), buildIpProfilePromptSnapshot (v4.0), two-tier scoring (v1.0) all prove the pattern
3. **Backward compatibility via version field + dual-path dispatch** works cleanly — `profileVersion` dual-track shipped with zero v1 user breakage
