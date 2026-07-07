# GSD Debug Knowledge Base

Resolved debug sessions. Used by `gsd-debugger` to surface known-pattern hypotheses at the start of new investigations.

---

## shanjian-payload-field — Prisma "Unknown argument shanjianPayload" on VideoTask.updateMany()
- **Date:** 2026-03-25
- **Error patterns:** Unknown argument, shanjianPayload, VideoTask, updateMany, Prisma, migration, generated client
- **Root cause:** shanjianPayload field was added to schema.prisma and the DB column existed (via db push or manual SQL), but no migration file was tracked in the Prisma migrations table. The generated Prisma client may have been stale at the time of the error.
- **Fix:** Created migration SQL file (ALTER TABLE VideoTask ADD COLUMN shanjianPayload JSON NULL), marked it as applied via `prisma migrate resolve --applied`, and ran `prisma generate` to refresh the generated client types.
- **Files changed:** apps/web/prisma/migrations/20260325000000_add_shanjian_payload_to_video_task/migration.sql
---

