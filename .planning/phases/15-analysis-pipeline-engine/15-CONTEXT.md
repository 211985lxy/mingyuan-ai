# Phase 15: Analysis Pipeline Engine - Context

**Gathered:** 2026-04-05
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped — autonomous mode)

<domain>
## Phase Boundary

Users can submit a URL and the system asynchronously processes it through the full scrape → enrich → analyze pipeline to produce a scored report. This phase delivers:
1. POST /api/competitor/analyze endpoint (submit URL, receive analysisId)
2. Async pipeline with DB-driven status tracking (pending→scraping→enriching→analyzing→completed/failed)
3. Quantitative metrics calculation (engagement rate, posting frequency, viral ratio, heatmap data)
4. AI analysis report generation via Claude (6-dimension radar scores + narrative sections)

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion. Use ROADMAP success criteria and existing codebase patterns.

Key patterns to follow:
- Non-blocking Promise pipeline (same as marketing-analysis.ts pattern)
- LLMClient.shared() for AI analysis (same as script-generator.ts, hot-topic-intelligence.ts)
- withUserAuth middleware for API route protection
- DB status transitions via prisma.competitorAnalysis.update()

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/tikhub/` — getAdapter, parseUrl, tikhubGet (Phase 13-14)
- `lib/llm/client.ts` — LLMClient.shared() with provider chain
- `lib/marketing-analysis.ts` — Pattern for non-blocking analysis pipeline
- `lib/prisma.ts` — Prisma client singleton
- `lib/logger.ts` — Pino structured logging
- `app/api/` routes — withUserAuth middleware pattern

### Established Patterns
- API routes use NextRequest/NextResponse
- Non-blocking: `Promise` triggered without await, error caught in .catch()
- JSON columns for flexible nested data
- responseFormat: { type: 'json_object' } for structured LLM output

### Integration Points
- New files: `lib/competitor-analysis/pipeline.ts`, `lib/competitor-analysis/metrics.ts`, `lib/competitor-analysis/analyzer.ts`, `lib/competitor-analysis/types.ts`
- New API routes: `app/api/competitor/analyze/route.ts`, `app/api/competitor/[id]/route.ts`, `app/api/competitor/reports/route.ts`
- Consumes: Phase 13 DB model + Phase 14 data adapters
- Consumed by: Phase 16 frontend

</code_context>

<specifics>
## Specific Ideas

Technical design reference: `docs/competitor-analysis-technical-design.md` sections IV-VI.

</specifics>

<deferred>
## Deferred Ideas

None — phase scope is well-defined.

</deferred>
