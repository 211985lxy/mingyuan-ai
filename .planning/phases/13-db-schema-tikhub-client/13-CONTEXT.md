# Phase 13: DB Schema & TikHub Client - Context

**Gathered:** 2026-04-05
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

The infrastructure prerequisites that every other phase depends on exist and are correct. This phase delivers:
1. CompetitorAnalysis Prisma model with full schema and migration
2. TikHub API client module with Bearer auth, typed responses, error handling, and cost tracking

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

Key technical references:
- Technical design: `docs/competitor-analysis-technical-design.md` (full schema, client design, types)
- Existing patterns: `lib/prisma.ts` for DB client, `lib/pexels.ts` / `lib/pixabay.ts` for external API client patterns
- LLM client pattern: `lib/llm/client.ts` for typed API wrapper with error handling

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/prisma.ts` — Prisma client singleton
- `lib/pexels.ts` / `lib/pixabay.ts` — External API client patterns (fetch + typed responses)
- `lib/llm/client.ts` — Provider pattern with typed responses and error handling
- `lib/logger.ts` — Pino logger for structured logging

### Established Patterns
- Prisma schema at `apps/web/prisma/schema.prisma`
- JSON columns stored as `Json?` type in Prisma for flexible nested data
- API clients use `fetch` with `AbortSignal.timeout()` for timeouts
- Environment variables for API keys (e.g., PEXELS_API_KEY, PIXABAY_API_KEY)

### Integration Points
- New model added to existing `schema.prisma` with `User` relation
- New env vars: `TIKHUB_API_KEY`, `TIKHUB_BASE_URL`
- Client module at `lib/tikhub/client.ts`

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Refer to ROADMAP phase description, success criteria, and `docs/competitor-analysis-technical-design.md` for detailed schema and client design.

</specifics>

<deferred>
## Deferred Ideas

None — infrastructure phase.

</deferred>
