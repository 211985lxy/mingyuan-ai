# Requirements: ClipFlow

**Defined:** 2026-04-05
**Core Value:** Small business owners with zero video production skills can produce professional marketing videos through an AI-guided pipeline that handles topic ideation, formula-based copywriting, and visual packaging end-to-end.

## v5.0 Requirements

Requirements for 同行对标分析. Continues from v4.0 Phase 12 completion.

**Technical design:** `docs/competitor-analysis-technical-design.md`
**Research:** `docs/competitor-analysis-research.md`

### Data Acquisition (DATA-)

- [x] **DATA-01**: System can detect platform (Douyin/Xiaohongshu) from input URL and extract user identifier
- [x] **DATA-02**: System can fetch competitor account profile (nickname, avatar, followers, bio, video count) via TikHub API
- [x] **DATA-03**: System can fetch competitor's video list (up to 50 videos) with pagination via TikHub API
- [x] **DATA-04**: System can batch-fetch video statistics (views, likes, comments, shares, collects) via TikHub API
- [x] **DATA-05**: System can sample comments from top 5 performing videos (20 comments each) via TikHub API

### Analysis Pipeline (PIPE-)

- [x] **PIPE-01**: User can submit a competitor account URL to start analysis (POST /api/competitor/analyze)
- [x] **PIPE-02**: System runs async pipeline (scrape → enrich → analyze) with DB-driven status tracking (pending/scraping/enriching/analyzing/completed/failed)
- [x] **PIPE-03**: System calculates quantitative metrics: weighted engagement rate, posting frequency, consistency score, viral ratio, duration distribution, top hashtags, posting time heatmap
- [x] **PIPE-04**: System generates AI analysis report via Claude with 6-dimension radar scores (content_power, growth_power, engagement_power, monetization_power, persona_power, operation_power) and structured narrative sections

### Report & UI (UI-)

- [x] **UI-01**: User can view analysis progress with step-by-step status indicators during pipeline execution
- [x] **UI-02**: User can view completed report with 6-dimension radar chart and score cards
- [x] **UI-03**: User can browse tabbed analysis sections: account positioning, content strategy, growth analysis, engagement analysis, monetization analysis, actionable recommendations
- [x] **UI-04**: User can view top 10 videos ranking table and posting time heatmap
- [x] **UI-05**: User can see paginated history of past analyses with platform, account name, score, and status

### Infrastructure (INFRA-)

- [x] **INFRA-01**: CompetitorAnalysis Prisma model with full schema (target URL, platform, status, raw data JSON, metrics JSON, analysis result JSON, scores, timestamps) and migration
- [x] **INFRA-02**: TikHub API client module with Bearer auth, typed responses, error handling, timeout, and per-request cost tracking

## Future Requirements

- B站 + 快手平台适配器 (Phase 2 expansion)
- 星图 API 集成获取粉丝画像 (Xingtu premium endpoints)
- 多账号对比（雷达图叠加）
- 定期监控（Cron 定时分析同一账号）
- 与 IP Profile 联动（对标建议 → 创作指导）
- 视频号支持（依赖新榜/友望 API）
- Apify 集成（评论深挖、视频转文字）
- 视频内容 AI 分析（封面风格、Hook 结构、转文字）

## Out of Scope

- 直接爬取平台数据（合规风险，使用付费 API）
- 视频号分析（平台完全封闭，无可用 API）
- 粉丝画像详细数据（需星图付费端点，MVP 不含）
- 视频下载/转文字功能（MVP 仅分析元数据和互动数据）
- 实时直播监控（非核心场景）

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 13 | Complete |
| INFRA-02 | Phase 13 | Complete |
| DATA-01 | Phase 14 | Complete |
| DATA-02 | Phase 14 | Complete |
| DATA-03 | Phase 14 | Complete |
| DATA-04 | Phase 14 | Complete |
| DATA-05 | Phase 14 | Complete |
| PIPE-01 | Phase 15 | Complete |
| PIPE-02 | Phase 15 | Complete |
| PIPE-03 | Phase 15 | Complete |
| PIPE-04 | Phase 15 | Complete |
| UI-01 | Phase 16 | Complete |
| UI-02 | Phase 16 | Complete |
| UI-03 | Phase 16 | Complete |
| UI-04 | Phase 16 | Complete |
| UI-05 | Phase 16 | Complete |
