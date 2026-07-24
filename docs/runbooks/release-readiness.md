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

Run `pnpm release:verify` with isolated `TEST_DATABASE_URL` and target-environment `DATABASE_URL`. Its database E2E suite is deterministic and removes model-provider credentials before tests start. After E2E, **real-model `eval:daily` is required** (missing provider keys or gate failure aborts release). Temporary skip needs both `--skip-daily-eval` and `AIM_RELEASE_SKIP_DAILY_EVAL_SIGNED_OFF_BY=<业务负责人>`; that skip is not release evidence. Run `pnpm --dir apps/web run test:e2e:real-llm` only in an approved, budgeted canary window. Local review may run `node scripts/release-verify.mjs --allow-missing-services`, but the resulting DB skip is not release evidence.

## Staging and canary evidence

Before production, record the commit SHA, sanitized snapshot date, migration status, browser version, seed account class, and results for the ten journeys above. Do not record passwords or customer content.

Start with internal accounts and a small project set. Observe generation success, P95 latency, model fallback, empty results, retries, whole-document rewrites, publication review, and support complaints. Application rollback must preserve a schema compatible with the previous SHA.

Production defaults `BACKGROUND_TASKS_ENABLED` to `false`: task-producing endpoints fail closed until a scheduler is declared. When deploying durable background tasks to Kubernetes, apply `k8s/cronjobs.yaml` and `k8s/mingyuan-web.yaml` with the application SHA, then verify `cron-background-tasks` can authenticate, complete a single bounded task, and leave a success/failure record. Other deployment targets must provide an equivalent authenticated scheduler before setting `BACKGROUND_TASKS_ENABLED=true`.

The ECS standalone release installs `mingyuan-background-tasks.timer`, which invokes the authenticated local worker every five minutes. The deploy script enables `BACKGROUND_TASKS_ENABLED=true` only after that timer is installed, restarts `mingyuan-web`, and starts one empty-queue probe. Verify both the service and timer after release with `systemctl is-active mingyuan-web mingyuan-background-tasks.timer`.

Account deletion remains intentionally unavailable until a durable cross-system deletion outbox exists. Project archive/export/permanent deletion is covered; do not claim account-erasure compliance from project lifecycle tests.
