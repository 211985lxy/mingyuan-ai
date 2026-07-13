# Database Migration Runbook

## Rules

- `apps/web/prisma/**/*.prisma` and `apps/web/prisma/migrations/**` are the only schema sources of truth.
- Application routes must not execute DDL or resolve Prisma migration history.
- Production deploys are serialized by the `production-deploy` workflow concurrency group. Do not disable Prisma advisory locking.
- Never run `prisma db push` against production.
- Never automatically reverse a migration that may have partially executed destructive DDL.

## Normal Release

1. CI validates and generates the Prisma client, then prepares an empty test database from the immutable baseline and applies all later migrations.
2. CI runs database E2E tests and verifies the test database has no diff from the Prisma schema.
3. The deploy workflow builds immutable SHA-tagged images.
4. `prisma migrate deploy` applies production migrations under a 15-minute job timeout.
5. `prisma migrate status` and `prisma migrate diff` must both pass before deployment begins.
6. Kubernetes deploys the SHA-tagged images and checks `/api/healthz`.
7. Only after health succeeds are `web:latest` and `worker:latest` advanced to that SHA.

## Destructive Changes

Use four releases. Do not combine them into one migration.

1. **Expand**: add nullable columns, new tables, or compatible indexes. Old code must continue working.
2. **Backfill**: run a resumable, observable worker. Record progress and make retries idempotent.
3. **Switch**: deploy code that reads the new shape while retaining old data for rollback.
4. **Contract**: after the rollback window and verification, remove old columns or constraints in a separate reviewed migration.

Every contract migration must state the backup point, expected lock duration, affected row count, rollback boundary, and owner in its pull request.

## Failure Handling

- If a migration has not started, fix the migration and rerun the workflow.
- If Prisma reports a failed migration, stop deployment. Inspect `_prisma_migrations` and the actual table state before using `prisma migrate resolve`.
- If a non-destructive migration completed but application rollout failed, roll back only the application images; leave the compatible expanded schema in place.
- If destructive DDL partially completed, do not run an inverse migration automatically. Restore from the documented backup or complete a reviewed forward repair.
- Capture `prisma migrate status`, the failing migration name, database error, deployment SHA, and operator decision in the incident record.

## Existing Production Bootstrap

`prisma migrate resolve --applied <migration>` is permitted only once when adopting Prisma Migrate for a pre-existing database. Before resolving, compare the live database with the matching migration and current production schema contract. Record the exact resolved migration list and schema diff; never keep this as an undocumented operator step.
