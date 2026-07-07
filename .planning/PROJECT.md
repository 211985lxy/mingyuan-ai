# ClipFlow

## What This Is

ClipFlow is a marketing short-video assembly-line tool for small business owners who need to build personal IP through video content. It automates the three-layer video creation pipeline: Director (structure/pacing), Scriptwriter (content/messaging), and Packaging (visual assembly via Shanjian templates, stock media, BGM, subtitles). Users build their IP through a 5-question AI-guided onboarding wizard that generates a structured three-dimensional positioning (Business + Persona + Content). The platform now includes competitor analysis — users paste a rival's account URL and receive an AI-generated report with 6-dimension radar scoring and actionable benchmarking recommendations.

## Core Value

Small business owners with zero video production skills can produce professional marketing videos through an AI-guided pipeline that handles structure, script, and visual packaging end-to-end.

## Requirements

### Validated

- ✓ Three-layer video creation system (Director → Scriptwriter → Packaging) — shipped
- ✓ IP profile system for personalized content generation — shipped
- ✓ Content template and structure blueprint system — shipped
- ✓ AI script generation from brief + IP profile — shipped
- ✓ Shanjian integration for video rendering (digital human, mixcut, broadcast) — shipped
- ✓ Stock media search (Pexels + Pixabay) with OSS transfer — shipped
- ✓ AI-powered packaging material suggestions — shipped
- ✓ Hot topic discovery and content fit scoring — shipped
- ✓ Video task lifecycle management with webhook handling — shipped
- ✓ Aliyun VIAPI 4K video enhancement pipeline (submit/poll/webhook/auto-trigger) — v3.0
- ✓ 4K frontend display (badge, processing indicator, failure tooltip, OSS lifecycle) — v3.0
- ✓ 5-question guided wizard for IP profile onboarding — v4.0
- ✓ AI three-dimensional positioning generation (Business + Persona + Content) — v4.0
- ✓ Three-card result display with inline editing and confirmation — v4.0
- ✓ Dual-version IP profile compatibility (v1 flat → v2 3D positioning) — v4.0
- ✓ Downstream prompt pipeline adaptation for 3D IP data — v4.0
- ✓ Legacy user upgrade flow with field pre-filling — v4.0

- ✓ TikHub API 集成（抖音/小红书平台适配器，URL 解析 + 账号数据采集） — v5.0
- ✓ 异步分析 Pipeline（scrape → enrich → analyze，DB 状态驱动） — v5.0
- ✓ AI 竞品分析报告生成（Claude 6维雷达评分 + 分段报告） — v5.0
- ✓ 前端报告展示（URL 输入、历史列表、雷达图、分段报告详情页） — v5.0

### Active

(None — planning next milestone)

### Out of Scope

- IP Center consolidation (merging IP profile + digital human + voice into one page) — deferred to v5.0+
- Chat-based onboarding (conversational UI for 5 questions) — stepper wizard chosen for higher completion rate
- IP profile version history / rollback — IP positioning is overwrite-only, no user need for rollback
- Batch data migration script for v1→v2 — early-stage user count; guide users to self-serve upgrade instead
- Streaming LLM output for positioning — JSON validation requires complete output; 3-8s loading animation acceptable

## Context

- **Tech stack:** Next.js 15 (App Router), Prisma ORM, MySQL, Tailwind CSS, shadcn/ui
- **External APIs:** Shanjian (video rendering), Pexels, Pixabay (stock media), LLM via TheRouter, Aliyun VIAPI (4K enhancement), TikHub (social media data API)
- **Deployment:** Kubernetes on Alibaba Cloud, OSS for durable storage
- **Language:** UI in Chinese, codebase in English/TypeScript
- **IP Profile current state (v4.0):** Dual-version schema — v1 (9 flat fields) + v2 (profileVersion=2, 5 survey inputs, 3D positioning JSON: business/persona/content). All downstream LLM consumers (script-generator, hot-topic-intelligence, brief/ai-fill, packaging-material-suggestions) adapt via `resolveScriptScoringFields` and `buildIpProfilePromptSnapshot` version dispatch. DB migration `20260402124607_add_v2_positioning_fields` created — **requires `npx prisma migrate deploy` on live DB before v2 flows work**.

## Constraints

- **Zero Mock Rule**: All features must use real APIs, databases, and services — no mocks, stubs, or fake data
- **UI**: shadcn/ui only, invoke ui-ux-pro-max skill for all UI work
- **Three-layer integrity**: Changes must state which layer they affect and preserve downstream lineage
- **Backward compatibility**: v1 IP profile users must never be blocked or broken; profileVersion dual-track required

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| LLM-driven search query planning | AI understands context better than rule-based keyword extraction | ✓ Good — Phase 1 fixed with industry vocabulary + role semantics + few-shot examples |
| Pexels + Pixabay dual provider with interleaving | Diversity of stock sources, fallback if one is sparse | ✓ Good |
| Safe roles only for AI suggestions (product_detail, store_environment, process) | Prevent AI from generating fake credentials/cases | ✓ Good |
| No post-search relevance filtering | Trusted stock API ranking as sufficient | ✓ Fixed — Phase 3 added two-tier scoring + abstract fallback |
| Two-dimensional persona model (expertise × expression style) | Avoids brand-risky labels (卖惨/炫富); produces more nuanced personas | ✓ Good — implemented in v4.0 Zod schema |
| Mixed storage (flat + JSON) for 3D positioning | High-frequency fields flat for WHERE, nested structures as JSON for flexibility | ✓ Good — business/persona/content as JSON columns |
| Synchronous LLM generation (no background task) | One-time operation, 3-8s acceptable with loading animation | ✓ Good — loading UX with progressive messages ships well |
| Stepper wizard over chat UI | Higher completion rate for low-tech users; existing wizard pattern in codebase | ✓ Good — implemented with card-grid + textarea pattern |
| resolveScriptScoringFields helper for v1/v2 field resolution | Single centralized function prevents scattered null-checks across scoring callers | ✓ Good — 3 call sites consolidated cleanly |
| Worktree isolation for parallel plan execution | Prevents git conflicts when multiple agents work simultaneously | ⚠️ Revisit — requires manual cherry-pick when worktree commits don't auto-merge; consider `parallelization: false` for this repo |
| TikHub API as primary data source | Paid API is compliant and stable vs direct scraping | ✓ Good — unified interface across Douyin/Xiaohongshu, ~$0.06-0.20 per analysis |
| Non-blocking Promise pipeline for competitor analysis | Matches existing marketing-analysis.ts pattern, no BullMQ needed | ✓ Good — DB-driven status tracking + frontend polling works well |
| 6-dimension radar scoring model | Standard mental model in Chinese short-video market | ✓ Good — content/growth/engagement/monetization/persona/operation axes |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-05 — v5.0 milestone complete: 同行对标分析 shipped (4 phases, 12 plans, 16 requirements)*
