# Phase 16: Report Frontend - Context

**Gathered:** 2026-04-05
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous mode)

<domain>
## Phase Boundary

Users can view analysis progress in real time and read a complete structured report with visualizations after completion. This phase delivers:
1. URL input form with platform detection feedback
2. Analysis progress indicators (step-by-step status polling)
3. Completed report with 6-dimension radar chart and score cards
4. Tabbed analysis sections (6 sections)
5. Top videos ranking table and posting time heatmap
6. Paginated history of past analyses

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — frontend phase. Must invoke ui-ux-pro-max skill for design consistency per CLAUDE.md rules. Use shadcn/ui components only.

Key constraints:
- shadcn/ui only — no alternative UI libraries
- recharts for data visualization (radar chart, heatmap)
- Chinese language UI
- Follow existing dashboard layout patterns

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `components/ui/` — shadcn/ui components (Button, Card, Dialog, Tabs, Table, Badge, Progress, Input)
- `lib/api/client.ts` — Typed fetch wrapper with auth support
- `(dashboard)/layout.tsx` — Dashboard layout with sidebar
- `(dashboard)/videos/page.tsx` — Polling pattern for async task status

### Established Patterns
- Dashboard pages at `(dashboard)/[feature]/page.tsx`
- Client-side polling with setInterval for async operations
- Zustand for client state
- Chinese language UI text

### Integration Points
- New pages: `(dashboard)/competitor/page.tsx`, `(dashboard)/competitor/[id]/page.tsx`
- Sidebar navigation entry for "同行对标"
- API client functions for competitor endpoints
- recharts dependency (add if not present)

</code_context>

<specifics>
## Specific Ideas

Report layout from technical design doc Section VIII:
- Header: avatar + name + key stats
- Radar chart (6 axes) + score cards (6 cards)
- Tabbed sections: 账号定位 / 内容策略 / 增长分析 / 互动分析 / 变现分析 / 对标建议
- Top 10 videos table
- Posting time heatmap (7 days × 24 hours)
- History list with platform icon, account name, score, status

</specifics>

<deferred>
## Deferred Ideas

- Multi-account comparison (radar overlay)
- PDF export
- Periodic monitoring (cron-based re-analysis)

</deferred>
