# Phase 14: Data Acquisition Layer - Context

**Gathered:** 2026-04-05
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

The system can collect all raw data needed for analysis from Douyin and Xiaohongshu accounts. This phase delivers:
1. URL platform detection and user identifier extraction
2. Account profile fetching via TikHub API
3. Video list fetching with pagination
4. Batch video statistics fetching
5. Comment sampling from top-performing videos

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — infrastructure data layer phase. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

Key technical references:
- Technical design: `docs/competitor-analysis-technical-design.md` (URL parser, platform adapters, TikHub endpoints)
- TikHub client: `src/lib/tikhub/client.ts` (created in Phase 13)
- TikHub types: `src/lib/tikhub/types.ts` (NormalizedAccount, NormalizedVideo, PlatformAdapter interface)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/tikhub/client.ts` — `tikhubGet<T>()` with Bearer auth, timeout, error handling (Phase 13)
- `lib/tikhub/types.ts` — PlatformAdapter interface, NormalizedAccount, NormalizedVideo, NormalizedComment, Platform type (Phase 13)
- `lib/tikhub/index.ts` — re-exports

### Established Patterns
- TikHub API uses cursor-based pagination (max_cursor for Douyin, cursor for XHS)
- Douyin App V3 endpoints preferred over Web for stability
- Batch video stats via fetch_multi_video_statistics (up to 50 IDs per call)

### Integration Points
- New files: `lib/tikhub/url-parser.ts`, `lib/tikhub/adapters/douyin.ts`, `lib/tikhub/adapters/xiaohongshu.ts`, `lib/tikhub/adapters/index.ts`
- Consumes: `tikhubGet<T>()` from Phase 13
- Consumed by: Phase 15 pipeline

</code_context>

<specifics>
## Specific Ideas

TikHub endpoint mapping per platform (from technical design doc):

**Douyin:**
- URL→sec_user_id: GET /api/v1/douyin/web/get_sec_user_id
- Profile: GET /api/v1/douyin/app/v3/handler_user_profile
- Videos: GET /api/v1/douyin/app/v3/fetch_user_post_videos (paginated, count=20)
- Stats: GET /api/v1/douyin/app/v3/fetch_multi_video_statistics (batch 50)
- Comments: GET /api/v1/douyin/web/fetch_video_comments

**Xiaohongshu:**
- URL→user_id: GET /api/v1/xiaohongshu/app/get_user_id_and_xsec_token
- Profile: GET /api/v1/xiaohongshu/app_v2/get_user_info
- Notes: GET /api/v1/xiaohongshu/app_v2/get_user_posted_notes (cursor-based)
- Note details: GET /api/v1/xiaohongshu/web_v2/fetch_feed_notes_v2
- Comments: GET /api/v1/xiaohongshu/app_v2/get_note_comments

</specifics>

<deferred>
## Deferred Ideas

- B站 adapter (Phase 2 milestone)
- 快手 adapter (Phase 2 milestone)

</deferred>
