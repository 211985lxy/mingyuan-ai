# Phase 11: Frontend Wizard & 3D Result Display - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

New users complete a 5-question stepper wizard with card-based selection and text input, AI generates 3D positioning with loading animation, results display as three cards (Business/Persona/Content) with inline editing and badge management, and the flow is fully mobile-responsive with immersive one-question-per-screen UX.

This phase covers the complete IP profile onboarding rewrite: wizard flow for new users, 3D result display with inline editing, and returning-user dashboard view. It does NOT include downstream LLM consumer adaptation (Phase 12).

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

Key decisions from STATE.md accumulated context:
- Stepper wizard UI pattern (matches existing avatar creation wizard)
- Synchronous LLM generation with loading animation (no background task needed)
- profileVersion dual-track — v1 users never blocked, upgrade is opt-in

</decisions>

<code_context>
## Existing Code Insights

Codebase context will be gathered during plan-phase research.

Key files identified from Phase 10 context:
- `ip-profile/page.tsx` — full UI to be rewritten
- `ip-profile.ts` — core logic with isComplete/getMissingFields for v1 vs v2
- `/api/ip-profile` — GET/PUT endpoints already updated in Phase 10
- `/api/ip-profile/generate-positioning` — POST endpoint from Phase 10
- Phase 10 delivered: dual-version schema, v2 API, AI generation with Zod validation

</code_context>

<specifics>
## Specific Ideas

From ROADMAP success criteria:
- Q1 (industry), Q3 (monetization), Q5 (content goal): card-based single-selection
- Q2 (target customer), Q4 (personal traits): text area input
- Loading animation with progressive status messages: "Analyzing your answers...", "Building positioning...", "Finalizing..."
- Three result cards: "Business Positioning", "Persona Design", "Content Strategy"
- One-line AI summary at top: "Your IP positioning: [summary]"
- Inline editing: click-to-edit strings, badge add/remove for tag arrays, save on blur
- "Confirm & Save" and "Re-generate" buttons
- Mobile: full-screen immersive layout, bottom sticky CTA, swipe-friendly

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
