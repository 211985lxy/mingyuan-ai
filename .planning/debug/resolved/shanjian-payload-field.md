---
status: resolved
trigger: "Prisma throws 'Unknown argument `shanjianPayload`' when calling videoTask.updateMany() with shanjianPayload in the data object"
created: 2026-03-25T00:00:00Z
updated: 2026-03-25T00:10:00Z
---

## Current Focus

hypothesis: CONFIRMED - shanjianPayload was added to schema.prisma and the column existed in the DB (likely added manually or by a prior prisma db push), but no Prisma migration file existed, and prisma generate may not have been run. Fixed by creating the migration file and running prisma generate.
test: Verified column exists in DB, migration is tracked in _prisma_migrations, generated client has the field, and tsc --noEmit reports 0 errors
expecting: No more "Unknown argument shanjianPayload" errors
next_action: DONE

## Symptoms

expected: videoTask.updateMany() should accept shanjianPayload in the data argument and store the Shanjian API request payload for debugging/auditing purposes
actual: Prisma throws "Unknown argument `shanjianPayload`. Available options are marked with ?" - the field is not in the generated Prisma client types
errors: Invalid `tx.videoTask.updateMany()` invocation - Unknown argument `shanjianPayload`
reproduction: Trigger the video creation flow that calls the Shanjian API - when the code tries to save the shanjianPayload to the videoTask record, it fails
started: Likely a new field added to code but not to schema (per symptom description)

## Eliminated

## Evidence

- timestamp: 2026-03-25T00:00:00Z
  checked: apps/web/prisma/schema.prisma VideoTask model
  found: shanjianPayload Json? field IS present at line 135
  implication: The schema has the field - the problem must be a missing migration or stale generated client

- timestamp: 2026-03-25T00:01:00Z
  checked: apps/web/prisma/migrations/ - all SQL files
  found: No migration file contains shanjianPayload or shanjian_payload in any migration SQL
  implication: The database column was never created - the schema was edited and prisma generate was run, but prisma migrate dev was never run

- timestamp: 2026-03-25T00:02:00Z
  checked: generated client types (VideoTask.ts VideoTaskUpdateManyMutationInput at line 696)
  found: shanjianPayload IS present in the generated Prisma client types - client was already regenerated
  implication: prisma generate was run, but prisma migrate was not - database has no shanjianPayload column

- timestamp: 2026-03-25T00:03:00Z
  checked: git diff HEAD -- apps/web/prisma/schema.prisma
  found: shanjianPayload Json? is a new field in current working tree, not in HEAD commit
  implication: Field was added to schema in working tree but the migration was never created

## Resolution

root_cause: shanjianPayload was added to schema.prisma (and the DB column was somehow already present - likely via prisma db push or manual SQL), but no Prisma migration file existed for tracking this change. The Prisma migrate baseline was out of sync, and the generated client may have been stale at the time the error occurred. Running prisma generate refreshes the TypeScript types.
fix: Created migration file 20260325000000_add_shanjian_payload_to_video_task/migration.sql with the ALTER TABLE statement, marked it as applied in the migrations table via `prisma migrate resolve --applied`, and ran `prisma generate` to confirm the generated client is up to date. Verified the column exists in the database and TypeScript compilation succeeds with 0 errors.
verification: Column confirmed in DB via SHOW COLUMNS; migration tracked in _prisma_migrations; shanjianPayload present in VideoTaskUpdateManyMutationInput type; tsc --noEmit reports 0 errors
files_changed:
  - apps/web/prisma/migrations/20260325000000_add_shanjian_payload_to_video_task/migration.sql
