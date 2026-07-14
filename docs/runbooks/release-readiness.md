# Release Readiness

## Automated customer-journey evidence

| Journey | Automated evidence |
|---|---|
| Register and activate | `activation-flow.test.ts`, auth contract tests |
| Direction brief to content | `aim-workflow.test.ts`, `aim-workflow-brief.test.ts` |
| New, scoped edit, reference rewrite, multi-platform split | deterministic Harness fixtures, editor tests |
| Knowledge import and authorization | knowledge upload, ownership, and project-scope tests |
| Topic daily report retry and handoff | topic daily report, source, presentation, and generation tests |
| Competitor discovery, monitoring, refresh, and fallback | competitor analysis/watch/research tests |
| Publish check, publication outcome, and review | Douyin publish check and content outcome tests |
| Agent API compatibility | Agent API contract and project-scope tests |
| Admin run diagnostics | admin run route, admin auth, and snapshot redaction tests |
| Project lifecycle | project route lifecycle, export, permanent-delete confirmation, and ownership tests |

Run `pnpm release:verify` with isolated `TEST_DATABASE_URL` and target-environment `DATABASE_URL`. It is intentionally strict. Local review may run `node scripts/release-verify.mjs --allow-missing-services`, but the resulting skip is not release evidence.

## Staging and canary evidence

Before production, record the commit SHA, sanitized snapshot date, migration status, browser version, seed account class, and results for the ten journeys above. Do not record passwords or customer content.

Start with internal accounts and a small project set. Observe generation success, P95 latency, model fallback, empty results, retries, whole-document rewrites, publication review, and support complaints. Application rollback must preserve a schema compatible with the previous SHA.

Account deletion remains intentionally unavailable until a durable cross-system deletion outbox exists. Project archive/export/permanent deletion is covered; do not claim account-erasure compliance from project lifecycle tests.
