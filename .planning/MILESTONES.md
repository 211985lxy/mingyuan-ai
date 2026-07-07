# Milestones

## v5.0 同行对标分析 (Shipped: 2026-04-05)

**Phases completed:** 4 phases, 12 plans, 9 tasks

**Key accomplishments:**

- DouyinAdapter implementing all 5 PlatformAdapter methods using TikHub App V3 endpoints with cursor pagination, 50-ID batch stats, and typed internal wire types
- XiaohongshuAdapter with 5-method PlatformAdapter interface — cursor pagination, 20-item stats batching, XHS App V2 + Web V2 endpoints
- getAdapter factory + tikhub barrel index wiring Douyin/XHS adapters and url-parser into a single Phase 15-ready public API, verified by 23-check structural smoke test
- DB-tracked async state machine wiring TikHub scraping, metrics calculation, and Claude AI analysis into a single non-blocking `runCompetitorAnalysisPipeline()` function
- Three Next.js App Router API routes exposing the competitor analysis pipeline: submit URL, poll status, list history, delete record — all protected by withUserAuth and enforcing user ownership
- Client-side URL form with platform detection + paginated history table using shadcn Table, Badge, and Card at /competitor
- Real-time progress polling page + full structured report with recharts 6-axis radar, 6 score cards, 6 tabbed analysis sections, top-10 video table, and 7×24 posting time heatmap

---

## v4.0 IP 档案三维定位升级 (Shipped: 2026-04-02)

**Phases completed:** 3 phases (10-12), 7 plans, 29 files changed (+6,017/-396 lines)

**Key accomplishments:**

- Dual-version IpProfile schema with 9 new fields (profileVersion, 5 survey inputs, 3 JSON positioning columns) — zero-downtime Prisma migration
- AI generation endpoint (POST /api/ip-profile/generate-positioning) with Zod validation, auto-fix ratio normalization, 2-retry pipeline, and prompt injection protection
- 5-question stepper wizard with card-grid/textarea steps, view state machine, and generatePositioning() API client with 30s timeout
- Three-card 3D result display (Business/Persona/Content) with inline editing, BadgeEditor for tag arrays, Confirm/Re-generate buttons, and read-only dashboard view
- Downstream v2 adaptation: resolveScriptScoringFields helper in script-generator, FitInput v2 types in hot-topic-intelligence, effectiveIndustry/Offer/Audience in packaging-material-suggestions
- Non-blocking opt-in upgrade banners for v1 users on /home and /ip-profile, with pre-fill mapping from 9 flat fields to 5 wizard survey questions

**Known tech debt:**

- DB migration `20260402124607_add_v2_positioning_fields` not yet applied to live DB — requires `npx prisma migrate deploy`
- 7 browser-only verification items deferred (mobile layout, inline editing, badge interactions, banners, quality regression with real API key)

---

## v1.0 Smart Material Matching (Shipped: 2026-03-25)

**Phases completed:** 3 phases, 6 plans, 9 tasks

**Key accomplishments:**

- Vitest integration + unit test suite for QGEN-01 through QGEN-04: 15 unit tests passing (deterministic path), 6 integration tests covering LLM + Pexels quality across 5 industry archetypes

---
