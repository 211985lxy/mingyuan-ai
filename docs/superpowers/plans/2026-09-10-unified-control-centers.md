# Unified Statistics and Audit Control Centers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver two production-grade admin control centers: a domain-backed statistics center for operations and business outcomes, and a normalized audit center for accountable changes, with durable reconciliation, alerts, authenticated metrics, and an Alibaba SLS integration boundary.

**Architecture:** Keep domain tables and specialist audit tables as facts. Add `AuditEvent` as a redacted, append-only cross-source index with idempotent ingestion and durable reconciliation; add `ChannelMetricDaily` for durable channel reporting and `OperationalAlert` for actionable control-plane health. The two admin pages use separate APIs and share only time, correlation, freshness, and alert contracts. SLS receives raw journald/Nginx logs through LoongCollector; the application stores only server-generated links.

**Tech Stack:** Next.js App Router, TypeScript, Prisma/MySQL, Vitest, React server/client components, Redis runtime counters, Prometheus `prom-client`, Alibaba Cloud SLS/LoongCollector, existing Feishu supervisor notifier.

## Global Constraints

- Work only in `apps/web/` and its tests/migrations unless a task explicitly names another product-repository path.
- Never read, print, commit, or copy `.env`, database dumps, activation-code lists, or SLS credentials.
- All admin APIs use existing `withAdminOnly`/`withAdminOrEditor` authentication and the existing request ID/logger path.
- Management dates use `Asia/Shanghai`; custom statistics and audit ranges are at most 31 days.
- `0` means a successful query found zero; failed or incomplete sources return `null` plus a degradation reason.
- `AuditEvent` is an index, not the source of financial, business, or raw-log truth.
- Do not store chat text, knowledge text, full request/response bodies, passwords, tokens, cookies, or environment values in audit metadata or SLS.
- Audit index and `ChannelMetricDaily` retention is 180 days; raw SLS retention is 30 days; specialist source tables are not deleted by this plan.
- Production systemd/timer changes, SLS resource creation, real retention deletion, and deployment require a separate explicit production approval after code verification.
- Each task ends with a focused test run and its own commit. Preserve the unrelated untracked `apps/web/scripts-temp-feishu-live-verify.ts` file.

---

## Task 1: Add durable control-center schema and shared contracts

**Files:**
- Modify: `apps/web/prisma/identity.prisma`
- Create: `apps/web/prisma/migrations/20260910100000_unified_control_centers/migration.sql`
- Create: `apps/web/src/lib/control-center-contracts.ts`
- Create: `apps/web/src/lib/shanghai-time.ts`
- Test: `apps/web/__tests__/unit/control-center-contracts.test.ts`
- Test: `apps/web/__tests__/unit/shanghai-time.test.ts`

**Interfaces:**
- `parseShanghaiDateRange(searchParams: URLSearchParams, now?: Date): { start: Date; end: Date; from: string; to: string } | { error: string }`
- `normalizeControlCenterFilters(input): { from: string; to: string; projectId?: string; agentId?: string; channel?: string }`
- `type OperationalAlertStatus = "open" | "acknowledged" | "resolved"`
- `type OperationalAlertSeverity = "warning" | "error" | "critical"`

- [ ] **Step 1: Write failing contract tests.** Cover default 7-day range, inclusive Shanghai date conversion to an exclusive UTC end, invalid dates, `from > to`, and ranges over 31 days. Assert an absent source is represented by `null`, not zero, in the response type fixture.

```ts
it("uses Shanghai calendar dates and an exclusive end", () => {
  const result = parseShanghaiDateRange(new URLSearchParams({ from: "2026-09-01", to: "2026-09-07" }))
  expect(result).toEqual(expect.objectContaining({ from: "2026-09-01", to: "2026-09-07" }))
  if ("error" in result) throw new Error(result.error)
  expect(result.start.toISOString()).toBe("2026-08-31T16:00:00.000Z")
  expect(result.end.toISOString()).toBe("2026-09-07T16:00:00.000Z")
})
```

- [ ] **Step 2: Run the focused tests and verify they fail** with the missing-module or missing-function error.

```bash
pnpm --filter @mingyuan/web exec vitest run __tests__/unit/control-center-contracts.test.ts __tests__/unit/shanghai-time.test.ts
```

- [ ] **Step 3: Implement the date and response contracts.** Use `Intl.DateTimeFormat` with `Asia/Shanghai`, accept only `YYYY-MM-DD`, default to the current Shanghai date and the preceding six dates, and return the exclusive next-midnight end. Keep all numeric metric fields typed as `number | null` where a source can be unavailable.

- [ ] **Step 4: Add Prisma models and migration.** Add `AdminAuditLog.status`, `AdminAuditLog.severity`, and `AdminAuditLog.correlationId`; add `AuditEvent.payloadHash`; add `AuditReconcileCheckpoint`, `ChannelMetricDaily`, and `OperationalAlert` with the indexes needed by date, status, fingerprint, source, and platform. Use the existing string status conventions and MySQL `datetime`/`json` types.

- [ ] **Step 5: Generate the Prisma client and run schema checks.**

```bash
pnpm --filter @mingyuan/web exec prisma generate
pnpm --filter @mingyuan/web run schema:migration-integrity
pnpm --filter @mingyuan/web exec vitest run __tests__/unit/control-center-contracts.test.ts __tests__/unit/shanghai-time.test.ts
```

- [ ] **Step 6: Commit.**

```bash
git add apps/web/prisma/identity.prisma apps/web/prisma/migrations/20260910100000_unified_control_centers/migration.sql apps/web/src/lib/control-center-contracts.ts apps/web/src/lib/shanghai-time.ts apps/web/__tests__/unit/control-center-contracts.test.ts apps/web/__tests__/unit/shanghai-time.test.ts
git commit -m "feat(schema): add control center data contracts"
```

## Task 2: Make audit ingestion redacted, idempotent, and transaction-safe

**Files:**
- Modify: `apps/web/src/lib/audit-event-contract.ts`
- Modify: `apps/web/src/lib/audit-events.ts`
- Modify: `apps/web/src/lib/admin-audit.ts`
- Create: `apps/web/src/lib/audited-admin-mutation.ts`
- Test: `apps/web/__tests__/unit/audit-events.test.ts`
- Test: `apps/web/__tests__/unit/audited-admin-mutation.test.ts`

**Interfaces:**
- `normalizeAuditEvent(input: AuditEventInput): NormalizedAuditEvent` must return a stable `payloadHash` and allowlisted metadata.
- `recordAuditEvent(input, options?): Promise<{ ok: boolean; id?: string; inserted: boolean; conflict?: boolean }>`
- `runAuditedAdminMutation<T>(input: AuditedAdminMutationInput): Promise<T>`

- [ ] **Step 1: Extend failing tests.** Add cases for denied metadata keys, bounded summaries, same-key/same-payload deduplication (`inserted: false`), and same-key/different-payload conflict (`conflict: true`). Add a transaction test proving a rolled-back mutation creates no source audit row.

```ts
it("rejects an idempotency key reused with a different payload", async () => {
  auditEvent.upsert.mockRejectedValueOnce({ code: "P2002" })
  auditEvent.findUnique.mockResolvedValueOnce({ id: "existing", payloadHash: "different" })
  await expect(recordAuditEvent(input, { strict: true })).rejects.toMatchObject({ code: "AUDIT_IDEMPOTENCY_CONFLICT" })
})
```

- [ ] **Step 2: Run the focused tests and verify the new cases fail.**

```bash
pnpm --filter @mingyuan/web exec vitest run __tests__/unit/audit-events.test.ts __tests__/unit/audited-admin-mutation.test.ts
```

- [ ] **Step 3: Implement allowlisted normalization.** Define per-source safe metadata keys, remove unknown keys recursively, cap string lengths, validate IDs/enums, reject raw content fields, and compute SHA-256 over the normalized JSON payload. Generate SLS links only after trusted server-side configuration is available.

- [ ] **Step 4: Implement conflict-aware upsert.** On a unique-key race, fetch the existing row; return a duplicate when hashes match; throw a typed conflict error when hashes differ. Never report `inserted: true` for an existing row.

- [ ] **Step 5: Implement `runAuditedAdminMutation`.** Resolve request/correlation IDs, create `AdminAuditLog` in the same transaction as `mutate(tx)`, set `success` only after the transaction commits, and enqueue the normalized `AuditEvent` write after commit. On a failed transaction, write a failed source event in a separate best-effort path without claiming the mutation succeeded.

- [ ] **Step 6: Preserve compatibility.** Keep `recordAdminAudit` as a thin wrapper for existing routes and route new code through the shared helper. Add `status`, `severity`, and `correlationId` to source rows without changing existing callers’ return type.

- [ ] **Step 7: Run tests, typecheck, and commit.**

```bash
pnpm --filter @mingyuan/web exec vitest run __tests__/unit/audit-events.test.ts __tests__/unit/audited-admin-mutation.test.ts __tests__/unit/admin-sensitive-audit.test.ts
pnpm --filter @mingyuan/web run typecheck
git add apps/web/src/lib/audit-event-contract.ts apps/web/src/lib/audit-events.ts apps/web/src/lib/admin-audit.ts apps/web/src/lib/audited-admin-mutation.ts apps/web/__tests__/unit/audit-events.test.ts apps/web/__tests__/unit/audited-admin-mutation.test.ts
git commit -m "feat(audit): enforce redaction and idempotent writes"
```

## Task 3: Close admin write coverage and repair reconciliation

**Files:**
- Modify: `apps/web/src/app/api/admin/**/route.ts` for every `POST`, `PUT`, `PATCH`, and `DELETE` route found by the inventory
- Modify: `apps/web/src/lib/audit-events.ts`
- Modify: `apps/web/src/app/api/cron/audit-reconcile/route.ts`
- Create: `apps/web/src/lib/audit-reconcile.ts`
- Create: `apps/web/__tests__/unit/admin-write-audit-manifest.test.ts`
- Modify: `apps/web/__tests__/unit/audit-events.test.ts`
- Modify: `apps/web/__tests__/unit/audit-ingest-route.test.ts`

**Interfaces:**
- `reconcileAuditEvents(input?: { limit?: number; source?: string; cursor?: string }): Promise<ReconcileResult>`
- `runAuditReconcileBatch(now?: Date): Promise<{ scanned: number; indexed: number; failures: number; lagMs: number | null }>`
- `AUDIT_ADMIN_WRITE_EXEMPTIONS: Readonly<Record<string, string>>`

- [ ] **Step 1: Inventory all admin writes and add a failing manifest test.** The test must enumerate route files and export names, require `runAuditedAdminMutation`/`recordAdminAudit`, or require an explicit exemption reason. It must fail for any new uncovered write route.

```bash
rg -l "export const (POST|PUT|PATCH|DELETE)" apps/web/src/app/api/admin -g 'route.ts' | sort
```

- [ ] **Step 2: Run the manifest test before changes and record the uncovered route list.** Do not edit routes that are read-only.

- [ ] **Step 3: Wrap each uncovered business mutation.** Use action names matching the route domain (`knowledge.entry.updated`, `template.archived`, `settings.updated`, `benchmark.item.deleted`, etc.), pass only safe IDs and counts, and keep all domain mutations in the same transaction as `AdminAuditLog`.

- [ ] **Step 4: Add durable checkpoints.** Read/write `AuditReconcileCheckpoint` per source with a high-water marker and a separate historical cursor. The job must be restartable and idempotent, and it must expose the latest successful run and error.

- [ ] **Step 5: Fix status mapping.** Map `running` to `started`, `success` to `success`, and `failed` to `failed`; skip unknown values with a warning. Do not coerce every non-failed value to success.

- [ ] **Step 6: Make the cron route bounded and observable.** Keep `CRON_SECRET`, cap the page at 200, return `scanned/indexed/failures/lagMs/checkpoints`, and increment the real audit reconciliation metrics on failure or lag. Leave production scheduler wiring for the separately approved operations step.

- [ ] **Step 7: Run the manifest, audit, and API contract tests; commit.**

```bash
pnpm --filter @mingyuan/web exec vitest run __tests__/unit/admin-write-audit-manifest.test.ts __tests__/unit/audit-events.test.ts __tests__/unit/audit-ingest-route.test.ts __tests__/unit/audit-events-routes.test.ts
pnpm --filter @mingyuan/web run api:contracts
git add apps/web/src/app/api/admin apps/web/src/lib/audit-events.ts apps/web/src/lib/audit-reconcile.ts apps/web/src/app/api/cron/audit-reconcile/route.ts apps/web/__tests__/unit/admin-write-audit-manifest.test.ts apps/web/__tests__/unit/audit-events.test.ts apps/web/__tests__/unit/audit-ingest-route.test.ts
git commit -m "feat(audit): cover admin writes and durable reconciliation"
```

## Task 4: Add complete audit summaries, details, and retention-safe UI

**Files:**
- Modify: `apps/web/src/app/api/admin/audit-events/route.ts`
- Modify: `apps/web/src/app/api/admin/audit-events/[id]/route.ts`
- Create: `apps/web/src/app/api/admin/audit-events/summary/route.ts`
- Modify: `apps/web/src/app/admin/audit-center/page.tsx`
- Modify: `apps/web/src/app/admin/usage/page.tsx`
- Modify: `apps/web/src/app/admin/agents/page.tsx`
- Modify: `apps/web/src/app/admin/logs/page.tsx`
- Modify: `apps/web/__tests__/unit/audit-events-routes.test.ts`
- Modify: `apps/web/__tests__/components/audit-center-page.test.tsx`

**Interfaces:**
- `GET /api/admin/audit-events` returns `{ data, nextCursor }` with filter metadata and no page-derived summary counts.
- `GET /api/admin/audit-events/summary` returns `{ total, failed, critical, sourceCount, from, to }` using the same filter parser.
- `GET /api/admin/audit-events/:id/related` returns cursor-paginated related events.

- [ ] **Step 1: Add failing route tests** for 31-day range rejection, full-result summary counts, status/severity filters, source fields, idempotency key, and related-event pagination.
- [ ] **Step 2: Extract one filter parser** shared by list and summary. Use Shanghai date bounds and a cursor that is stable for `(occurredAt,id)` ordering.
- [ ] **Step 3: Implement summary and related endpoints.** Count against the complete filtered query; never infer counts from the first 50 rows. Record read operations without polluting the business mutation counts.
- [ ] **Step 4: Update the detail UI.** Render source record type/id, idempotency key, correlation/request/trace IDs, safe metadata, generated SLS link when present, and a “load more related” action.
- [ ] **Step 5: Update compatibility pages.** Redirect usage to `/admin/statistics?section=cost`, agents to `/admin/statistics?section=executions`, and logs to `/admin/audit-center` while preserving query intent where safe.
- [ ] **Step 6: Run route/component tests and commit.**

```bash
pnpm --filter @mingyuan/web exec vitest run __tests__/unit/audit-events-routes.test.ts __tests__/components/audit-center-page.test.tsx
git add apps/web/src/app/api/admin/audit-events apps/web/src/app/admin/audit-center/page.tsx apps/web/src/app/admin/usage/page.tsx apps/web/src/app/admin/agents/page.tsx apps/web/src/app/admin/logs/page.tsx apps/web/__tests__/unit/audit-events-routes.test.ts apps/web/__tests__/components/audit-center-page.test.tsx
git commit -m "feat(admin): complete audit center queries and details"
```

## Task 5: Build the domain-backed statistics API and durable channel rollups

**Files:**
- Create: `apps/web/src/lib/statistics-center.ts`
- Create: `apps/web/src/app/api/admin/statistics/overview/route.ts`
- Modify: `apps/web/src/lib/aim/review-cycle-metrics.ts` only to extract shared query helpers without changing metric definitions
- Modify: `apps/web/src/lib/channel-metrics.ts`
- Modify: `apps/web/src/app/api/admin/channel-metrics/route.ts`
- Create: `apps/web/src/app/api/cron/channel-metrics-rollup/route.ts`
- Test: `apps/web/__tests__/unit/statistics-center.test.ts`
- Modify: `apps/web/__tests__/unit/channel-metrics.test.ts`
- Test: `apps/web/__tests__/unit/statistics-overview-route.test.ts`

**Interfaces:**
- `loadStatisticsOverview(input: StatisticsOverviewInput): Promise<StatisticsOverviewResponse>`
- `recordChannelMetric(input): Promise<{ persisted: boolean; degraded: boolean }>`
- `rollupChannelMetricDay(day: string, platform?: string): Promise<{ written: number; failed: number }>`

- [ ] **Step 1: Add failing tests** for default/explicit periods, previous equal-length comparison, Shanghai bucket boundaries, operation metrics, reuse of `ReviewMetricsSnapshot`, null-on-source-failure, no-platform channel totals, and 180-day rollup writes.
- [ ] **Step 2: Implement the shared statistics loader.** Query `AimExecutionTrace` and the existing review-cycle metrics source, calculate p50/p95 from bounded durations, include tokens/cost, and return `freshness/degradedSources/coverage`. Never use `AuditEvent` for business values.
- [ ] **Step 3: Implement `ChannelMetricDaily` writes.** Store low-cardinality platform/metric/day rows with an upsert, use Shanghai day keys, and expose a failure flag when Redis or Prisma is unavailable. Keep Redis counters for runtime speed but stop treating their 7-day TTL as report history.
- [ ] **Step 4: Implement `/api/admin/statistics/overview`.** Enforce admin auth, parse filters with the shared range parser, cap query limits, and return operations/business/channels/daily trend/comparison/freshness/coverage.
- [ ] **Step 5: Implement the rollup cron route.** Protect it with `CRON_SECRET`, process one bounded day per invocation, and make repeated calls idempotent. Do not enable a production timer in this task.
- [ ] **Step 6: Run focused tests, typecheck, and commit.**

```bash
pnpm --filter @mingyuan/web exec vitest run __tests__/unit/statistics-center.test.ts __tests__/unit/statistics-overview-route.test.ts __tests__/unit/channel-metrics.test.ts
pnpm --filter @mingyuan/web run typecheck
git add apps/web/src/lib/statistics-center.ts apps/web/src/app/api/admin/statistics/overview/route.ts apps/web/src/lib/aim/review-cycle-metrics.ts apps/web/src/lib/channel-metrics.ts apps/web/src/app/api/admin/channel-metrics/route.ts apps/web/src/app/api/cron/channel-metrics-rollup/route.ts apps/web/__tests__/unit/statistics-center.test.ts apps/web/__tests__/unit/statistics-overview-route.test.ts apps/web/__tests__/unit/channel-metrics.test.ts
git commit -m "feat(stats): add domain-backed overview and channel rollups"
```

## Task 6: Add the statistics page, dashboard links, and operational alerts

**Files:**
- Create: `apps/web/src/app/admin/statistics/page.tsx`
- Create: `apps/web/src/lib/operational-alerts.ts`
- Create: `apps/web/src/app/api/admin/alerts/route.ts`
- Create: `apps/web/src/app/api/admin/alerts/[id]/route.ts`
- Create: `apps/web/src/app/api/cron/operational-alerts/route.ts`
- Modify: `apps/web/src/lib/aim/feishu-supervisor-notifier.ts`
- Modify: `apps/web/src/app/admin/page.tsx`
- Test: `apps/web/__tests__/components/statistics-page.test.tsx`
- Test: `apps/web/__tests__/unit/operational-alerts.test.ts`
- Modify: `apps/web/__tests__/unit/feishu-supervisor-notifier.test.ts`

**Interfaces:**
- `upsertOperationalAlert(input): Promise<{ id: string; changed: boolean }>`
- `listOperationalAlerts(filters): Promise<{ data: OperationalAlert[]; nextCursor: string | null }>`
- `transitionOperationalAlert(id, transition, adminId): Promise<OperationalAlert>`
- Existing Feishu notifier receives `{ type: "system_alert", fingerprint, severity, summary, occurredAt, correlationId }`.

- [ ] **Step 1: Add failing tests** for fingerprint dedupe, occurrence count, acknowledge/resolve transitions, 15-minute notification suppression, and no Feishu send for warning alerts.
- [ ] **Step 2: Implement alert persistence and safe metadata.** Enforce the four default rules from the design, keep state transitions auditable, and avoid raw payloads.
- [ ] **Step 3: Extend the existing Feishu notifier.** Reuse its transport/configuration; add only a system-alert message shape and the dedupe window. Do not introduce another bot client.
- [ ] **Step 4: Build `/admin/statistics`.** Show date presets 1/7/30, custom date validation, operations/business side-by-side, daily trend, channel section, freshness badges, null/degraded states, and links into audit filters. Do not render missing sources as zero.
- [ ] **Step 5: Add backend inbox routes and dashboard summary.** Keep alert list/transition admin-only and show open error/critical counts on `/admin`.
- [ ] **Step 6: Run component/unit tests and commit.**

```bash
pnpm --filter @mingyuan/web exec vitest run __tests__/components/statistics-page.test.tsx __tests__/unit/operational-alerts.test.ts __tests__/unit/feishu-supervisor-notifier.test.ts
git add apps/web/src/app/admin/statistics apps/web/src/lib/operational-alerts.ts apps/web/src/app/api/admin/alerts apps/web/src/app/api/cron/operational-alerts/route.ts apps/web/src/lib/aim/feishu-supervisor-notifier.ts apps/web/src/app/admin/page.tsx apps/web/__tests__/components/statistics-page.test.tsx apps/web/__tests__/unit/operational-alerts.test.ts apps/web/__tests__/unit/feishu-supervisor-notifier.test.ts
git commit -m "feat(admin): add statistics page and alert inbox"
```

## Task 7: Protect Prometheus metrics and add runtime observability

**Files:**
- Modify: `apps/web/src/app/api/metrics/route.ts`
- Modify: `apps/web/src/lib/metrics.ts`
- Modify: `apps/web/.env.example`
- Modify: `apps/web/.env.production.example`
- Test: `apps/web/__tests__/unit/metrics-route.test.ts`
- Test: `apps/web/__tests__/unit/control-center-runtime-metrics.test.ts`

**Interfaces:**
- `METRICS_SCRAPE_SECRET` is required and must be at least 32 characters.
- `GET /api/metrics` returns 401 for absent/wrong Bearer token and 200 only for the configured token.

- [ ] **Step 1: Add failing auth tests** for absent, malformed, wrong, and correct authorization headers.
- [ ] **Step 2: Implement constant-time secret validation** using the existing secret comparison helper; do not reveal whether the secret is missing or incorrect.
- [ ] **Step 3: Remove declarations with no real call sites or mark them unused only after a call-site scan.** Add counters/gauges for audit failures/conflicts, reconcile lag, statistics failures, channel rollup failures, and SLS heartbeat lag, and update them at the actual failure/success boundaries.
- [ ] **Step 4: Update environment contracts and observability docs** with a secret placeholder only, never a credential value.
- [ ] **Step 5: Run tests and commit.**

```bash
pnpm --filter @mingyuan/web exec vitest run __tests__/unit/metrics-route.test.ts __tests__/unit/control-center-runtime-metrics.test.ts
pnpm --filter @mingyuan/web run env:check
git add apps/web/src/app/api/metrics/route.ts apps/web/src/lib/metrics.ts apps/web/.env.example apps/web/.env.production.example apps/web/__tests__/unit/metrics-route.test.ts apps/web/__tests__/unit/control-center-runtime-metrics.test.ts
git commit -m "fix(observability): authenticate metrics scraping"
```

## Task 8: Add retention code and the approved production handoff package

**Files:**
- Create: `apps/web/src/lib/control-center-retention.ts`
- Create: `apps/web/src/app/api/cron/control-center-retention/route.ts`
- Create: `apps/web/__tests__/unit/control-center-retention.test.ts`
- Create: `docs/operations/unified-control-centers-production-runbook.md`
- Create: `docs/operations/sls-loongcollector-canary-checklist.md`

**Interfaces:**
- `previewControlCenterRetention(now?: Date): Promise<RetentionPreview>`
- `deleteExpiredControlCenterRows(input: { now: Date; execute: boolean }): Promise<RetentionResult>`

- [ ] **Step 1: Add failing retention tests** for 180-day boundary, 1000-row batches, 20-batch maximum, report-only mode, and preservation of specialist tables.
- [ ] **Step 2: Implement report-only retention first.** The route returns counts and boundaries; deletion requires `execute=true` plus the production secret and remains disabled by default.
- [ ] **Step 3: Add the runbook.** Document the 03:30 Shanghai schedule, first 7 days report-only, explicit approval before deletion, rollback by disabling flags, SLS Project/Logstore verification, journald sources, no-env-file rule, and canary query by correlation ID.
- [ ] **Step 4: Run retention tests and commit.**

```bash
pnpm --filter @mingyuan/web exec vitest run __tests__/unit/control-center-retention.test.ts
git add apps/web/src/lib/control-center-retention.ts apps/web/src/app/api/cron/control-center-retention/route.ts apps/web/__tests__/unit/control-center-retention.test.ts docs/operations/unified-control-centers-production-runbook.md docs/operations/sls-loongcollector-canary-checklist.md
git commit -m "feat(ops): add control center retention and rollout runbook"
```

## Task 9: Full verification and production approval gate

**Files:**
- Modify only files required by failing verification commands; do not broaden scope.

- [ ] **Step 1: Run the focused suites.**

```bash
pnpm --filter @mingyuan/web exec vitest run __tests__/unit/audit-events.test.ts __tests__/unit/audit-events-routes.test.ts __tests__/unit/audit-ingest-route.test.ts __tests__/unit/statistics-center.test.ts __tests__/unit/statistics-overview-route.test.ts __tests__/unit/operational-alerts.test.ts __tests__/unit/metrics-route.test.ts __tests__/unit/control-center-retention.test.ts
pnpm --filter @mingyuan/web exec vitest run --config vitest.component.config.ts __tests__/components/audit-center-page.test.tsx __tests__/components/statistics-page.test.tsx
```

- [ ] **Step 2: Run repository gates.**

```bash
pnpm --filter @mingyuan/web run typecheck
pnpm --filter @mingyuan/web run lint
pnpm --filter @mingyuan/web run api:contracts
pnpm --filter @mingyuan/web run db:bounds
pnpm --filter @mingyuan/web run schema:migration-integrity
```

- [ ] **Step 3: Review the final diff.** Confirm no `.env`, dump, activation-code, generated secret, or unrelated Feishu untracked file is staged; confirm every commit is on `codex/unified-control-centers`.

- [ ] **Step 4: Perform local smoke checks.** Start the web app with test credentials, verify both pages, summary counts, pagination, alert transitions, and 401 metrics behavior. Record results in the runbook.

- [ ] **Step 5: Stop at production approval.** Present the exact code SHA, migration SQL, environment keys, SLS canary checklist, timer changes, retention preview count, and rollback switches. Only after explicit approval may production migration, LoongCollector installation, systemd/timer edits, SLS resource creation, retention deletion, and deployment be executed.

## Self-review checklist

- Every design requirement has a task: independent pages (Tasks 4–6), complete admin audit coverage (Task 3), exact status mapping and durable checkpoint (Task 3), full summaries/details (Task 4), domain-backed business/operations metrics and channel persistence (Task 5), alerts/Feishu (Task 6), authenticated Prometheus (Task 7), SLS and retention handoff (Task 8), rollout and approval boundary (Task 9).
- No task treats missing data as zero or `AuditEvent` as business truth.
- No task deletes specialist source logs.
- Every new interface has a name, parameter shape, return shape, and focused test.
- No `TODO`, `TBD`, “implement later”, or unspecified error-handling step is required.
