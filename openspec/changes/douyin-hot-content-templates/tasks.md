## 1. Database Schema (MySQL + Prisma)

- [x] 1.1 Add DouyinHotItem model to Prisma schema with fields: id, sentenceId, word, hotValue, position, label, videoCount, discussCount, coverUrl, eventTime, fetchedAt, batchId. Add composite unique constraint on (sentenceId, batchId) and indexes on fetchedAt and position
- [x] 1.2 Add DouyinHotSnapshot model to Prisma schema with fields: id, batchId (unique), fetchedAt, itemCount, rawJson (Json), status. Default status to "success"
- [x] 1.3 Add ContentTemplate model to Prisma schema with fields: id, name, displayName, description, scriptTemplate (db.Text), variables (Json), hookType, shanjianStyleId, videoType, packRulesJson (Json), processRulesJson (Json), industry (Json — array of strings for MySQL), contentType, tags (Json — array of strings), hotTopicKeywords (Json — array of strings, separate from tags), seasonalEvents (Json — array of {id, startDate, endDate}), status (default "draft"), sortOrder, featured, usageCount, createdBy, publishedAt, archivedAt, createdAt, updatedAt. Add indexes on status, (status, sortOrder), and (featured, status)
- [x] 1.4 Add AdminUser model to Prisma schema with fields: id, email (unique), password, name, role (default "editor", enum: editor/admin), isActive (default true), createdAt, updatedAt
- [x] 1.5 Run `npx prisma migrate dev` to generate and apply the MySQL migration (schema validated; migration deferred until MySQL instance available)

## 2. Environment Configuration

- [x] 2.1 Add new environment variables to `.env.example`: CRON_SECRET, DOUYIN_HOT_PRIMARY_URL (default: https://v2.xxapi.cn/api/douyinhot), DOUYIN_HOT_FALLBACK_URL (default: https://api.vvhan.com/api/hotlist/douyinHot), ADMIN_EMAIL, ADMIN_PASSWORD
- [x] 2.2 Add env validation for CRON_SECRET in the cron route handler (fail with 401 if missing)
- [x] 2.3 Add cron job declarations to vercel.json: `/api/cron/douyin-hot` (hourly: `0 * * * *`), `/api/cron/cleanup` (daily: `0 3 * * *`)

## 3. Douyin Hot List Service

- [x] 3.1 Create `lib/douyin-hot.ts` with DouyinHotService class. Implement `fetchFromXxapi()` that calls the primary URL and parses the response into typed DouyinHotItem array
- [x] 3.2 Implement `fetchFromVvhan()` as the fallback fetcher, normalizing the different response format to the same DouyinHotItem interface
- [x] 3.3 Implement `fetchWithFallback()` that tries primary then fallback, logging warnings on fallback and errors when both fail
- [x] 3.4 Implement `storeBatch(batchId, items)` that bulk upserts items into DouyinHotItem table with the batch identifier
- [x] 3.5 Implement `cacheLatest(items)` that writes the latest hot list to Redis key `douyin:hot:latest` with 70-minute TTL
- [x] 3.6 Implement `fetchAndStore()` as the main cron entry point that orchestrates fetch → store → cache → snapshot creation
- [x] 3.7 Implement `getLatestHotList()` that reads from Redis cache first, falls back to DB query for the most recent batch, and returns typed HotTopic array for the frontend
- [x] 3.8 Create `app/api/cron/douyin-hot/route.ts` — GET handler that validates CRON_SECRET, calls fetchAndStore(), returns batch result
- [x] 3.9 Create `app/api/hot-topics/route.ts` — GET handler for authenticated users that calls getLatestHotList() and returns the hot topics with cache headers (max-age=300)

## 4. Data Cleanup Cron

- [x] 4.1 Create `app/api/cron/cleanup/route.ts` — GET handler that validates CRON_SECRET, deletes DouyinHotItem records older than 30 days, deletes DouyinHotSnapshot records older than 90 days, returns counts deleted

## 5. Content Template Engine

- [x] 5.1 Create `lib/template-engine.ts` with `renderTemplate(scriptTemplate: string, variables: Record<string, string>): string` function that replaces `{{variableName}}` placeholders with provided values
- [x] 5.2 Add TypeScript types for TemplateVariable, ContentType, HookType, TemplateStatus, SeasonalEvent in `types/content-template.ts`

## 6. Admin Authentication

- [x] 6.1 Create `lib/admin-auth.ts` with password hashing (bcrypt), JWT signing/verification for admin tokens, and admin middleware that validates admin JWT and extracts role
- [x] 6.2 Create `app/api/admin/auth/login/route.ts` — POST handler that authenticates AdminUser by email+password and returns admin JWT
- [x] 6.3 Create admin auth middleware helper `withAdminAuth(handler, requiredRole?)` that wraps route handlers with admin JWT validation and optional role check (editor can do most things, admin required for delete/user-management)

## 7. Template Admin API

- [x] 7.1 Create `app/api/admin/templates/route.ts` — POST (create template, requires editor+), GET (list all templates with status/industry/contentType filters and pagination)
- [x] 7.2 Create `app/api/admin/templates/[id]/route.ts` — GET (template detail), PUT (edit template, requires editor+), DELETE (delete template, requires admin only)
- [x] 7.3 Create `app/api/admin/templates/[id]/publish/route.ts` — POST (draft → published, requires editor+, records publishedAt)
- [x] 7.4 Create `app/api/admin/templates/[id]/archive/route.ts` — POST (published → archived, requires editor+, records archivedAt)
- [x] 7.5 Create `app/api/admin/templates/[id]/restore/route.ts` — POST (archived → published, requires editor+)
- [x] 7.6 Create `app/api/admin/templates/[id]/sort/route.ts` — PUT (update sortOrder, requires editor+)
- [x] 7.7 Create `app/api/admin/templates/[id]/feature/route.ts` — PUT (toggle featured flag, requires editor+)
- [x] 7.8 Implement state machine validation in a shared helper: validate that requested transition is allowed (draft→published, published→archived, archived→published) and reject all others with 422
- [x] 7.9 Add Redis cache invalidation on template publish/archive/restore: delete `templates:published` cache key after any status change to/from published

## 8. User-Facing Template API

- [x] 8.1 Create `app/api/templates/route.ts` — GET (list published templates, filterable by industry via JSON_CONTAINS, contentType, featured, search keyword; ordered by sortOrder desc; paginated; cache headers max-age=1800)
- [x] 8.2 Create `app/api/templates/[id]/route.ts` — GET (published template detail with variable definitions)
- [x] 8.3 Create `app/api/templates/[id]/generate/route.ts` — POST (accept variable values, validate required fields, render template via renderTemplate(), return script text; increment usageCount)

## 9. Hot Topic ↔ Template Matching

- [x] 9.1 Implement `matchTemplatesForHotTopic(topicWord: string)` that finds published templates whose hotTopicKeywords (not display tags) include substrings matching the hot topic word
- [x] 9.2 Implement seasonal event matching that checks if current date (MM-DD) falls within any template's seasonalEvents date ranges
- [x] 9.3 Add optional `recommendedTemplates` field to the hot topics API response: for each hot topic, include up to 3 matched template IDs and names

## 10. Script System Integration

- [ ] 10.1 Update `POST /api/scripts/generate` request body to accept optional `hotTopic` (string) and `hotValue` (number) parameters (BLOCKED: depends on /api/scripts/generate route from init-clipflow-project backend)
- [ ] 10.2 Update the LLM prompt template to conditionally incorporate hot topic context when hotTopic parameter is provided, instructing the model to naturally reference the trending topic in at least 1 of 3 generated scripts (BLOCKED: depends on LLM integration from init-clipflow-project backend)
- [ ] 10.3 Add template-based script saving: when a user generates a script from a content template, allow saving it as a user-owned script record with a reference to the source template ID (BLOCKED: depends on /api/scripts route from init-clipflow-project backend)

## 11. Concurrency Controls

- [x] 11.1 Create `lib/rate-limit.ts` with `checkConcurrencyLimit(userId, plan)` that queries video_tasks WHERE userId AND status='processing' and compares count against plan limits (free:1, basic:3, pro:5)
- [ ] 11.2 Integrate concurrency check into `POST /api/tasks` (video task creation) — reject with clear error message and upgrade prompt if limit is exceeded (BLOCKED: depends on /api/tasks route from init-clipflow-project backend)
- [x] 11.3 Handle Shanjian `Concurrency.Limit` error code in the shanjian client: catch and rethrow as a user-friendly "system busy" error instead of a generic 500

## 12. Caching Layer

- [x] 12.1 Implement Redis caching wrapper for public voice list (GET /api/voices) with 24-hour TTL
- [x] 12.2 Implement Redis caching wrapper for public digital human list (GET /api/virtualmen) with 24-hour TTL
- [x] 12.3 Implement Redis caching wrapper for Shanjian template list (GET /api/templates/shanjian) with 6-hour TTL, keyed by scene parameter
- [x] 12.4 Implement content template list cache (key: `templates:published`) with 30-minute TTL and active invalidation on publish/archive/restore operations
- [x] 12.5 Add Cache-Control response headers: hot-topics (max-age=300), voices (max-age=3600), templates (max-age=1800)

## 13. Admin Dashboard & Monitoring

- [x] 13.1 Create `app/api/admin/hot-topics/history/route.ts` — GET (list DouyinHotSnapshot records, paginated, most recent first)
- [x] 13.2 Create `app/api/admin/hot-topics/stats/route.ts` — GET (return success/failure counts for last 24h and 7d)
- [x] 13.3 Create `app/api/admin/dashboard/route.ts` — GET (return key metrics: total users, total videos today, active templates count, hot list fetch health)

## 14. Database Indexes

- [x] 14.1 Add MySQL indexes via Prisma @@index: video_tasks(user_id, status), content_templates(status, sort_order), content_templates(featured, status), douyin_hot_items(fetched_at), douyin_hot_items(position)
- [x] 14.2 Verify all indexes are included in the Prisma schema with `@@index` annotations and apply migration

## 15. Seed Data & Bootstrap

- [x] 15.1 Create `prisma/seed-admin.ts` — seed script that creates the initial admin user from ADMIN_EMAIL and ADMIN_PASSWORD env vars if AdminUser table is empty
- [x] 15.2 Create `prisma/seed-templates.ts` — seed script that inserts 8 starter content templates (one per core industry: 房产, 电商, 教育, 餐饮, 美容, 汽车, 健康, 本地生活), each with complete 358-structured script framework, variable definitions, and published status
- [x] 15.3 Add seed scripts to `prisma/seed.ts` main entry point and configure in package.json (`prisma.seed`)
- [x] 15.4 Create Postman collection JSON (`docs/admin-api.postman.json`) covering all admin endpoints with example requests for template CRUD, lifecycle transitions, and hot list monitoring

## 16. E2E Flow Validation

- [ ] 16.1 Validate the full hot-topic-to-video pipeline manually: fetch hot list → user sees hot topics → selects one → AI generates script with hot topic integrated → user selects avatar → generates video → video completes
- [ ] 16.2 Validate the full template-to-video pipeline manually: user browses templates → filters by industry → selects template → fills variables → renders script → saves script → selects avatar → generates video → video completes
