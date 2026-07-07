# Roadmap: ClipFlow

## Milestones

- ✅ **v1.0 Smart Material Matching** — Phases 1-3 (shipped 2026-03-25) — [archive](milestones/v1.0-ROADMAP.md)
- ✅ **v2.0 Official Website** — Phases 4-6 (shipped 2026-03-26)
- ✅ **v3.0 4K Video Enhancement** — Phases 7-9 (shipped 2026-04-02)
- ✅ **v4.0 IP 档案三维定位升级** — Phases 10-12 (shipped 2026-04-02) — [archive](milestones/v4.0-ROADMAP.md)
- 🚧 **v5.0 同行对标分析** — Phases 13-16 (in progress)

## Phases

<details>
<summary>✅ v1.0 Smart Material Matching (Phases 1-3) — SHIPPED 2026-03-25</summary>

- [x] Phase 1: Query Generation (2/2 plans) — completed 2026-03-25
- [x] Phase 2: Infrastructure Prerequisites (2/2 plans) — completed 2026-03-25
- [x] Phase 3: Relevance Scoring and Fallback (2/2 plans) — completed 2026-03-25

</details>

<details>
<summary>✅ v2.0 Official Website (Phases 4-6) — SHIPPED 2026-03-26</summary>

- [x] Phase 4: Foundation and Infrastructure (2/2 plans) — completed 2026-03-26
- [x] Phase 5: Content Sections (1/1 plans) — completed 2026-03-26
- [x] Phase 6: Responsive, Animations and Performance (1/1 plans) — completed 2026-03-26

</details>

<details>
<summary>✅ v3.0 4K Video Enhancement (Phases 7-9) — SHIPPED 2026-04-02</summary>

- [x] Phase 7: API Integration & DB Foundation (2/2 plans) — completed 2026-04-02
- [x] Phase 8: Enhancement Pipeline (2/2 plans) — completed 2026-04-02
- [x] Phase 9: Frontend Display & Deployment (2/2 plans) — completed 2026-04-02

</details>

<details>
<summary>✅ v4.0 IP 档案三维定位升级 (Phases 10-12) — SHIPPED 2026-04-02</summary>

- [x] Phase 10: Data Infrastructure & AI Generation Engine (2/2 plans) — completed 2026-04-02
- [x] Phase 11: Frontend Wizard & 3D Result Display (2/2 plans) — completed 2026-04-02
- [x] Phase 12: Downstream Adaptation & Legacy Migration (3/3 plans) — completed 2026-04-02

</details>

### 🚧 v5.0 同行对标分析 (In Progress)

**Milestone Goal:** User inputs a competitor account URL; system auto-scrapes account data and generates a 6-dimension radar-scored AI analysis report.

- [x] **Phase 13: DB Schema & TikHub Client** — Prisma model with full schema + TikHub API client module (completed 2026-04-05)
- [x] **Phase 14: Data Acquisition Layer** — Platform detection + account profile + video list + stats + comment sampling (completed 2026-04-05)
- [x] **Phase 15: Analysis Pipeline Engine** — Async pipeline (scrape → enrich → analyze), metrics calculation, AI report generation (completed 2026-04-05)
- [x] **Phase 16: Report Frontend** — Progress indicators, radar chart, tabbed sections, heatmap, history list (completed 2026-04-05)

## Phase Details

### Phase 13: DB Schema & TikHub Client
**Goal**: The infrastructure prerequisites that every other phase depends on exist and are correct
**Depends on**: Phase 12
**Requirements**: INFRA-01, INFRA-02
**Success Criteria** (what must be TRUE):
  1. CompetitorAnalysis Prisma model is migrated to the live DB with all required columns (targetUrl, platform, status, rawAccountData, rawVideoData, metricsData, analysisResult, scores, timestamps)
  2. TikHub API client module makes authenticated requests with Bearer token, returns typed responses, and surfaces errors with timeout
  3. A test call to TikHub succeeds against a real endpoint without using mocks
**Plans**: 2 plans
Plans:
- [x] 13-01-PLAN.md — Add CompetitorAnalysis Prisma model + migration + regenerate client (INFRA-01)
- [x] 13-02-PLAN.md — TikHub API client module with types, auth, error handling, smoke test (INFRA-02)

### Phase 14: Data Acquisition Layer
**Goal**: The system can collect all raw data needed for analysis from Douyin and Xiaohongshu accounts
**Depends on**: Phase 13
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05
**Success Criteria** (what must be TRUE):
  1. System correctly identifies the platform (Douyin vs Xiaohongshu) and extracts the user identifier from a pasted URL
  2. System fetches and stores competitor account profile fields (nickname, avatar, followers, bio, video count) via TikHub
  3. System fetches up to 50 videos from the account's video list via TikHub pagination
  4. System batch-fetches view, like, comment, share, and collect counts for all fetched videos
  5. System samples up to 20 comments each from the top 5 videos by view count
**Plans**: 4 plans
Plans:
- [x] 14-01-PLAN.md — URL parser: detectPlatform + extractUserId for Douyin and Xiaohongshu (DATA-01)
- [x] 14-02-PLAN.md — Douyin adapter: resolveUrl + fetchAccount + fetchVideos + fetchVideoStats + fetchComments (DATA-02, DATA-03, DATA-04, DATA-05)
- [x] 14-03-PLAN.md — Xiaohongshu adapter: resolveUrl + fetchAccount + fetchVideos + fetchVideoStats + fetchComments (DATA-02, DATA-03, DATA-04, DATA-05)
- [x] 14-04-PLAN.md — Adapter registry (getAdapter) + updated tikhub index + smoke test validation (DATA-01 through DATA-05)

### Phase 15: Analysis Pipeline Engine
**Goal**: Users can submit a URL and the system asynchronously processes it through the full scrape → enrich → analyze pipeline to produce a scored report
**Depends on**: Phase 14
**Requirements**: PIPE-01, PIPE-02, PIPE-03, PIPE-04
**Success Criteria** (what must be TRUE):
  1. User can POST a competitor URL to /api/competitor/analyze and receive an analysisId immediately (non-blocking)
  2. DB status transitions correctly through pending → scraping → enriching → analyzing → completed (or failed on error)
  3. System calculates quantitative metrics including weighted engagement rate, posting frequency, consistency score, viral ratio, duration distribution, top hashtags, and posting time heatmap data
  4. System generates a Claude AI report with 6-dimension radar scores (content_power, growth_power, engagement_power, monetization_power, persona_power, operation_power) and all structured narrative sections stored in analysisResult
**Plans**: 3 plans
Plans:
- [x] 15-01-PLAN.md — Types barrel + metrics calculator (calculateMetrics) + AI analyzer (analyzeCompetitor) with unit tests (PIPE-03, PIPE-04)
- [x] 15-02-PLAN.md — Pipeline orchestrator (runCompetitorAnalysisPipeline): scrape → enrich → analyze with DB status transitions (PIPE-02)
- [x] 15-03-PLAN.md — API routes: POST /analyze, GET /[id], GET /reports, DELETE /[id] (PIPE-01, PIPE-02)

### Phase 16: Report Frontend
**Goal**: Users can view analysis progress in real time and read a complete structured report with visualizations after completion
**Depends on**: Phase 15
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05
**Success Criteria** (what must be TRUE):
  1. While analysis runs, user sees step-by-step status indicators that update as each pipeline stage completes (no manual refresh required)
  2. User can view the completed report's 6-dimension radar chart with labeled axes and score cards for each dimension
  3. User can navigate tabbed analysis sections (account positioning, content strategy, growth analysis, engagement analysis, monetization analysis, actionable recommendations) and read the full narrative
  4. User can view the top 10 video ranking table and posting time heatmap visualizations
  5. User can see a paginated history list of past analyses showing platform icon, account name, overall score, and status
**Plans**: 3 plans
Plans:
- [x] 16-01-PLAN.md — recharts install + shadcn Table + competitor API client functions + TypeScript types + sidebar nav (UI-05)
- [x] 16-02-PLAN.md — /competitor/page.tsx: URL input form + paginated history list (UI-01, UI-05)
- [x] 16-03-PLAN.md — /competitor/[id]/page.tsx: progress polling + radar chart + score cards + tabs + top videos table + heatmap (UI-01, UI-02, UI-03, UI-04)

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Query Generation | v1.0 | 2/2 | Complete | 2026-03-25 |
| 2. Infrastructure Prerequisites | v1.0 | 2/2 | Complete | 2026-03-25 |
| 3. Relevance Scoring and Fallback | v1.0 | 2/2 | Complete | 2026-03-25 |
| 4. Foundation and Infrastructure | v2.0 | 2/2 | Complete | 2026-03-26 |
| 5. Content Sections | v2.0 | 1/1 | Complete | 2026-03-26 |
| 6. Responsive, Animations and Performance | v2.0 | 1/1 | Complete | 2026-03-26 |
| 7. API Integration & DB Foundation | v3.0 | 2/2 | Complete | 2026-04-02 |
| 8. Enhancement Pipeline | v3.0 | 2/2 | Complete | 2026-04-02 |
| 9. Frontend Display & Deployment | v3.0 | 2/2 | Complete | 2026-04-02 |
| 10. Data Infrastructure & AI Generation Engine | v4.0 | 2/2 | Complete | 2026-04-02 |
| 11. Frontend Wizard & 3D Result Display | v4.0 | 2/2 | Complete | 2026-04-02 |
| 12. Downstream Adaptation & Legacy Migration | v4.0 | 3/3 | Complete | 2026-04-02 |
| 13. DB Schema & TikHub Client | v5.0 | 2/2 | Complete    | 2026-04-05 |
| 14. Data Acquisition Layer | v5.0 | 4/4 | Complete    | 2026-04-05 |
| 15. Analysis Pipeline Engine | v5.0 | 3/3 | Complete    | 2026-04-05 |
| 16. Report Frontend | v5.0 | 3/3 | Complete    | 2026-04-05 |
