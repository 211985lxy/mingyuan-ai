---
phase: 16-report-frontend
plan: "01"
subsystem: frontend-infrastructure
tags: [competitor-analysis, api-client, types, recharts, shadcn, sidebar]
dependency_graph:
  requires: []
  provides:
    - competitor API client functions (startCompetitorAnalysis, getCompetitorAnalysis, listCompetitorReports, deleteCompetitorAnalysis)
    - TypeScript types for competitor API (ApiCompetitorAnalysis, ApiCompetitorReport, CompetitorReportsResponse, CompetitorAnalysisStatus)
    - shadcn Table component
    - recharts package
    - sidebar nav entry for 同行对标
  affects:
    - apps/web/src/app/(dashboard)/competitor/page.tsx (plan 02 consumer)
    - apps/web/src/app/(dashboard)/competitor/[id]/page.tsx (plan 03 consumer)
tech_stack:
  added:
    - recharts ^2.15.4 (radar charts, bar charts)
  patterns:
    - direct request<T>() calls without data-wrapper unwrapping (competitor API returns unwrapped responses)
    - re-export of tikhub domain types through api.ts for UI layer isolation
key_files:
  created:
    - apps/web/src/components/ui/table.tsx
  modified:
    - apps/web/package.json (recharts added)
    - apps/web/src/types/api.ts (competitor types block added)
    - apps/web/src/lib/api/client.ts (competitor functions section added)
    - apps/web/src/components/layout/app-sidebar.tsx (同行对标 nav item added)
decisions:
  - "Competitor API functions use direct request<T>() without .data unwrapping — competitor routes return responses without the standard { data: } envelope"
  - "CompetitorMetrics and CompetitorAnalysisResult re-exported from api.ts via tikhub/types — UI layer imports from @/types/api only, not directly from tikhub internals"
metrics:
  duration: "442s"
  completed_date: "2026-04-05"
  tasks_completed: 2
  files_modified: 5
requirements:
  - UI-05
---

# Phase 16 Plan 01: Competitor Analysis Frontend Infrastructure Summary

Foundation layer for the competitor analysis frontend: recharts installation, shadcn Table component, TypeScript types, API client functions, and sidebar navigation entry. Enables plans 02 and 03 to build pages without duplication of infrastructure work.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Install recharts and add shadcn Table component | c4a5042 | apps/web/package.json, package-lock.json, apps/web/src/components/ui/table.tsx |
| 2 | Add competitor types, API client functions, and sidebar nav | b9e88fe | apps/web/src/types/api.ts, apps/web/src/lib/api/client.ts, apps/web/src/components/layout/app-sidebar.tsx |

## What Was Built

**recharts** (`^2.15.4`) installed as a dependency in `apps/web` — required for radar charts in the analysis detail page (plan 03).

**shadcn Table component** (`src/components/ui/table.tsx`) — standard shadcn/ui implementation with 8 exports: `Table`, `TableHeader`, `TableBody`, `TableFooter`, `TableHead`, `TableRow`, `TableCell`, `TableCaption`. Uses `forwardRef` and `cn()` for class merging, consistent with all other shadcn components in the codebase.

**TypeScript types** added to `src/types/api.ts`:
- `CompetitorAnalysisStatus` union type (pending | scraping | enriching | analyzing | completed | failed)
- `ApiCompetitorAnalysis` — full analysis record with metricsData and analysisResult typed via tikhub/types
- `ApiCompetitorReport` — lighter list-item shape from the reports endpoint
- `CompetitorReportsResponse` — paginated response wrapper
- Re-exports `CompetitorMetrics` and `CompetitorAnalysisResult` from `@/lib/tikhub/types` so UI layer only imports from `@/types/api`

**API client functions** added to `src/lib/api/client.ts` (competitor section):
- `startCompetitorAnalysis(url)` — POST /api/competitor/analyze, 10s timeout
- `getCompetitorAnalysis(id)` — GET /api/competitor/:id
- `listCompetitorReports(page, limit)` — GET /api/competitor/reports with pagination
- `deleteCompetitorAnalysis(id)` — DELETE /api/competitor/:id, returns void

**Sidebar nav entry** — `同行对标` item with `href="/competitor"` and `BarChart2` icon added after `IP档案`, before `我的视频`.

## Key Decisions

1. **Direct request<T>() without .data unwrapping**: Competitor API routes (`/api/competitor/*`) return responses without the standard `{ data: T }` envelope used by most other routes. Functions call `request<T>()` directly, matching the actual route behavior verified in Phase 15.

2. **Re-export tikhub types through api.ts**: `CompetitorMetrics` and `CompetitorAnalysisResult` originate in `@/lib/tikhub/types` but are re-exported from `@/types/api` so pages and components have a single stable import path that does not depend on internal lib structure.

## Deviations from Plan

None — plan executed exactly as written. The `recharts` version installed was `^2.15.4` (latest patch in the `^2.15.0` range), which satisfies the plan's `^2.15.0` requirement.

Note: `pnpm add` failed due to `@clipflow/shared` not being in the npm registry (workspace-only package). Installed via `npm install -w @clipflow/web recharts` from the monorepo root instead — same result, same lockfile entry.

## Known Stubs

None — this plan adds infrastructure only (types, client functions, component, package). No UI rendering with data sources.

## Self-Check: PASSED

- `/Users/ethan/Workspace/z/clipflow/apps/web/src/components/ui/table.tsx` — FOUND
- `/Users/ethan/Workspace/z/clipflow/apps/web/src/types/api.ts` contains `ApiCompetitorAnalysis` — FOUND
- `/Users/ethan/Workspace/z/clipflow/apps/web/src/lib/api/client.ts` contains `startCompetitorAnalysis` — FOUND
- `/Users/ethan/Workspace/z/clipflow/apps/web/src/components/layout/app-sidebar.tsx` contains `同行对标` — FOUND
- Commit `c4a5042` — FOUND
- Commit `b9e88fe` — FOUND
- TypeScript: 0 errors
