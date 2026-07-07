# Phase 12: Downstream Adaptation & Legacy Migration - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

All downstream LLM consumers (script-generator, hot-topic-intelligence, brief/ai-fill, packaging-material-suggestions) adapt to v2 promptSnapshot structure, legacy v1 users see non-blocking upgrade nudge with field pre-filling, /create page continues working for v1 complete users, and quality regression validation confirms v2 generates equal or better script quality across 5 industries.

This phase covers: downstream LLM consumer adaptation, legacy v1 user UX (non-blocking upgrade banners), /create page backward compatibility, and quality regression validation. It does NOT include further changes to the IP profile wizard or 3D positioning API (completed in Phases 10-11).

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

Key decisions from STATE.md accumulated context:
- profileVersion dual-track — v1 users never blocked, upgrade is opt-in
- buildIpProfilePromptSnapshot already returns correct format per version (transparent for brief/ai-fill and packaging-material-suggestions)
- Upgrade nudge is non-blocking and dismissible (banner, not modal)
- Quality regression test validates v2 generates equal or better script quality

</decisions>

<code_context>
## Existing Code Insights

Codebase context will be gathered during plan-phase research.

Key files identified from STATE.md dependency map:
- `ip-profile.ts` — core logic (5 exported functions), buildIpProfilePromptSnapshot already v2-aware
- `script-generator.ts` — 5 locations reading IP fields, needs v2 structure adaptation
- `hot-topic-intelligence.ts` — FitInput.ipProfile type extension needed
- `brief/ai-fill/route.ts` — promptSnapshot context (should be transparent via buildIpProfilePromptSnapshot)
- `packaging-material-suggestions/route.ts` — industry/targetAudience (transparent via buildIpProfilePromptSnapshot)
- `home/page.tsx` — isComplete check, needs upgrade banner for v1 users
- `create/page.tsx` — profile context, must continue working for v1 complete users
- `ip-profile/page.tsx` — rewritten in Phase 11, already handles v1→v2 upgrade flow

</code_context>

<specifics>
## Specific Ideas

From ROADMAP success criteria:
- Upgrade banner text: "Upgrade to 3D Positioning" on IP profile page for v1 complete users
- Home page banner text: "Unlock AI-powered 3D positioning — upgrade your IP profile" + "Learn more" CTA
- Both banners are non-blocking and dismissible
- Pre-fill mapping: displayName→Q2, industry→Q1, primaryOffer+targetAudience→Q3, ipTraits→Q4, callToAction→Q5
- Quality regression: 5 industries (空调维修, 餐饮, 电商, 教育, 健身) with v1 vs v2 comparison

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
