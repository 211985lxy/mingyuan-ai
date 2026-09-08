# Unified Audit Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one administrator-only audit center that indexes existing AIM, administrator, agent, repository, and server events without breaking existing specialist logs.

**Architecture:** Keep `AimExecutionTrace`, `AdminAuditLog`, and `AgentApiCallLog` as specialist records. Add an append-only `AuditEvent` index plus a shared event writer, reconciliation job, signed ingestion endpoint, and administrator query UI. Use request/run/trace/Git identifiers to correlate events; keep raw server logs in journald/SLS.

**Tech Stack:** Next.js App Router, TypeScript, Prisma/MariaDB, Pino, Vitest, existing administrator JWT/CSRF guards, systemd deployment.

## Global Constraints

- Do not touch unrelated dirty worktrees or merge their changes into this work package.
- Do not log secrets, tokens, cookies, database URLs, customer full text, or full prompts.
- Preserve existing specialist tables and legacy endpoints during phase one.
- Audit-index failure must not block ordinary business requests; high-risk administrator mutations retain their existing `AdminAuditLog` requirement.
- Production schema changes use a reviewed additive migration, schema contract update, migration-integrity checks, and deployment verification.
- Server SLS/LoongCollector collection is phase two; phase one records only key deployment/runtime events and links to raw logs when available.

## File Map

- Create `apps/web/prisma/migrations/20260907100000_add_audit_event/migration.sql` and modify the Prisma schema/production contract for the new index.
- Create `apps/web/src/lib/audit-events.ts` for the normalized event contract, redaction, idempotent writer, and reconciliation helpers.
- Create `apps/web/src/app/api/admin/audit-events/route.ts`, `apps/web/src/app/api/admin/audit-events/[id]/route.ts`, and `apps/web/src/app/api/internal/audit-events/route.ts` for query/detail/signed ingestion.
- Create `apps/web/src/app/admin/audit-center/page.tsx` and adapt the admin sidebar/legacy pages for the unified entry point.
- Create focused unit tests for normalization, idempotency, redaction, authorization, query filters, and legacy links; update migration/API contract tests.
- Add an external CLI/hook integration only after the server contract is tested; the CLI must store its queue outside the repository and never write credentials into Git-tracked files.

### Task 1: Establish schema and event contract

**Files:** Prisma schema fragments, production schema contract, additive migration, `apps/web/src/lib/audit-events.ts`, unit tests.

- [ ] Write failing tests covering source/category/severity/status validation, sensitive-key redaction, stable idempotency key generation, and metadata size limits.
- [ ] Run the focused tests and confirm they fail before implementation.
- [ ] Add `AuditEvent` with the fields and indexes defined in the approved design; use nullable links rather than foreign keys to specialist tables so imported external events remain valid.
- [ ] Implement `normalizeAuditEvent()` and `recordAuditEvent()` with `source + idempotencyKey` upsert semantics, actor hashing, request/correlation propagation, and non-throwing best-effort mode.
- [ ] Add `reconcileAuditEvents()` that pages through specialist tables by stable ID/time and writes deterministic index events.
- [ ] Run focused tests, Prisma formatting/generation checks, and migration-integrity checks.
- [ ] Commit the schema and contract as `feat(audit): add unified event index`.

### Task 2: Wire existing server events and signed ingestion

**Files:** existing admin audit/observability helpers, internal ingestion route, cron reconciliation route, environment contract, tests.

- [ ] Add tests for admin-only reads, HMAC signature expiry/replay rejection, malformed event rejection, and successful idempotent ingestion.
- [ ] Implement `POST /api/internal/audit-events` with `AUDIT_INGEST_SECRET`, timestamped HMAC body signing, constant-time verification, and bounded payloads.
- [ ] Make existing admin, AIM, and Agent API writers emit an index event after their specialist write; preserve existing error behavior for required high-risk admin audit writes.
- [ ] Add `POST /api/cron/audit-reconcile`, guarded by the existing cron secret, with bounded pages and a resumable cursor.
- [ ] Add explicit deployment success/failure and health-check event calls to the deploy script without printing secrets.
- [ ] Run focused tests and typecheck; commit as `feat(audit): ingest and reconcile audit events`.

### Task 3: Add administrator query/detail APIs

**Files:** admin query/detail routes, API inventory, route tests.

- [ ] Write failing tests for default “today” window, cursor pagination, every supported filter, stable ordering, and correlation-chain lookup.
- [ ] Implement `GET /api/admin/audit-events` with bounded limit, UTC storage/Asia-Shanghai date boundaries, filters for source/category/severity/status/actor/project/correlation ID, and redacted metadata.
- [ ] Implement `GET /api/admin/audit-events/:id` with the event and related events sharing its correlation ID.
- [ ] Guard both routes with `withAdminOnly`, add request IDs to responses, and record read access using the existing admin audit helper.
- [ ] Update API inventory and run route/auth tests; commit as `feat(audit): expose unified audit query api`.

### Task 4: Build the unified audit-center UI and compatibility links

**Files:** new audit-center page, admin sidebar/layout, three legacy pages, component/e2e tests.

- [ ] Add component tests for overview cards, filters, empty/error/loading states, timeline selection, and correlation detail display.
- [ ] Build `/admin/audit-center` using existing admin shell/components; show today’s totals, unified timeline, filters, event detail, and related-chain view.
- [ ] Keep `/admin/logs`, `/admin/agents`, and `/admin/usage` reachable but redirect them to `/admin/audit-center` with source/category query presets.
- [ ] Change sidebar to use the unified entry as the primary log item while preserving legacy URLs for bookmarks.
- [ ] Run component/e2e tests and accessibility/lint checks; commit as `feat(audit): add unified audit center ui`.

### Task 5: Add external Agent/Git queue and rollout verification

**Files:** repository-side audit CLI/hook adapter, external queue documentation, tests, release/runbook docs.

- [ ] Test queue atomicity, `0600` permissions, encryption-at-rest, retry backoff, idempotent replay, and repository-path/Git-SHA capture.
- [ ] Implement one shared CLI used by Claude/Codex/Cursor/Qoder/Trae adapters for `start`, `finish`, `fail`, and `commit`; store the queue outside the repository.
- [ ] Add a post-commit adapter that submits Git-confirmed events and marks Agent-declared events as declarations until a matching SHA exists.
- [ ] Document the adapter contract and the limitation that arbitrary tools bypassing the adapter cannot be guaranteed to emit an event.
- [ ] Run full relevant unit tests, typecheck, lint, API inventory, architecture-size checks, production build, and a local end-to-end audit write/query/replay smoke test.
- [ ] Commit as `feat(audit): add offline agent audit queue`.

### Task 6: Finish rollout and cleanup

- [ ] Verify migration status and production schema contract on a clean release worktree.
- [ ] Deploy only after the additive migration and application build pass; verify health, an admin audit event, an AIM trace index, an idempotent replay, and a failed-event path.
- [ ] Keep SLS collection as a separate phase-two runbook with no unapproved production configuration changes in this work package.
- [ ] Remove the temporary worktree after the commit is safely handed off and confirm the remaining worktree count.
