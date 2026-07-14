# Data lifecycle and recovery

## Data map

| Data | Purpose | Default retention | Delete path | Backup scope |
|---|---|---|---|---|
| User and subscription | Authentication and access | Account lifetime | Account deletion is not exposed until cross-system deletion has an outbox | Database |
| Client project and knowledge | Customer context and RAG | Project lifetime | Archive by default; confirmed permanent delete removes project-scoped rows | Database |
| AIM drafts, generations, outcomes, Wiki | Content production and review | Project/account lifetime | Project permanent delete or individual history delete | Database |
| Harness full snapshot | Short-lived diagnosis | 30 days | `/api/cron/cleanup` deletes at `expiresAt` | Database backup only while retained |
| Execution trace and API log metadata | Reliability and abuse audit | 180 days, pending business approval | Scheduled retention job required before production claim | Database |
| Competitor, hot-list and extraction cache | Research evidence | Hot items 30 days; snapshots 90 days; customer research until account deletion | Cleanup cron or owned-resource delete | Database |
| Uploaded image, video and music | Customer source assets | Until user deletion | Asset DELETE removes current managed OSS object before its DB row | Database plus OSS |
| External provider copies | Processing only | Provider contract dependent | Provider-specific deletion must be confirmed before account deletion is offered | Not assumed |

Harness snapshots are redacted by default. Full prompts and outputs require `AIM_STORE_SENSITIVE_SNAPSHOTS=true`, remain admin-only, and expire on the same schedule.

## Project export and deletion

- `GET /api/projects/:id/export` returns an owned project JSON export. A collection over 5,000 rows is rejected instead of silently truncated.
- `DELETE /api/projects/:id` keeps the compatible archive behavior.
- Permanent deletion requires `?permanent=true&confirm=<exact project name>`. It removes project-scoped knowledge, entities, generations, outcomes, Wiki, memories, benchmark profiles, run snapshots, traces, API logs and Agent API project scopes in one database transaction.
- Account deletion is deliberately not exposed yet. Database deletion and OSS/provider deletion need a durable deletion job/outbox before that operation can be made reliable.

## Backup and restore drill

Temporary objectives pending business approval: RPO 24 hours, RTO 4 hours. They are objectives, not evidence that production meets them.

1. Run `pnpm --dir apps/web backup:database` from an encrypted backup host. Set `BACKUP_DIR` to an encrypted, access-controlled volume with off-host replication.
2. Store the generated `.sql.gz` and `.sha256` together. The script keeps the password out of process arguments.
3. Create an empty isolated MySQL database whose name clearly contains `test`.
4. Run `TEST_DATABASE_URL=... pnpm --dir apps/web backup:verify -- <backup.sql.gz>`.
5. Run Prisma migration status, schema verification and the database E2E suite against that restored test database.
6. Record backup timestamp, restore duration, migration version, row-count checks and operator. Never record credentials.

Do not restore into production as a rollback for partially applied destructive DDL without a reviewed incident plan. Production automation, encryption policy and an actual restore drill remain release prerequisites.
