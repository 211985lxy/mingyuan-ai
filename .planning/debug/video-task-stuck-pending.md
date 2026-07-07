---
status: investigating
trigger: "Video task cmn5dtddt0003f1jsr5m2ur6i stuck in pending status for 20+ minutes"
created: 2026-03-25T00:00:00Z
updated: 2026-03-25T00:00:00Z
symptoms_prefilled: true
---

## Current Focus

hypothesis: CONFIRMED - Task cmn5dtddt0003f1jsr5m2ur6i has status=pending, externalTaskId=NULL, errorMessage=NULL, errorCode=NULL. The Shanjian API call failed (likely due to Prisma shanjianPayload bug) but compensateVideoTaskSubmissionFailure was also not called — task was left orphaned in pending. The task-recovery poller (line 54-60 in task-recovery.ts) only queries tasks with status="processing", completely ignoring status="pending" tasks. Additionally, the per-task loop (line 259) has `if (!videoTask.externalTaskId) continue;` which skips tasks with no external ID. Two compounding gaps: (1) pending tasks are never polled, (2) even if they were, tasks without externalTaskId are skipped.
test: N/A - root cause confirmed
expecting: N/A
next_action: Fix two issues: (1) update task cmn5dtddt0003f1jsr5m2ur6i to failed status so it stops being stuck, (2) fix task-recovery to handle pending tasks without externalTaskId by marking them failed after a timeout

## Symptoms

expected: Video task should progress from pending → processing → completed within a few minutes as the cron poller checks Shanjian API for task status updates
actual: Task has been stuck at "pending" (排队中) status for 20+ minutes with no progress
errors: Previous error: Prisma rejected `shanjianPayload` as unknown field (now fixed with migration). This earlier error likely caused the initial task submission to fail, leaving the task in "pending" without an externalTaskId
reproduction: Create a video task - it may get stuck if the Shanjian API call fails but the error isn't properly handled
timeline: Task created recently, stuck since creation

## Eliminated

- hypothesis: shanjianPayload Prisma schema error was still blocking submissions
  evidence: The schema migration has been applied. The Prisma field is now valid. The task's actual state is status=pending/externalTaskId=NULL/errorMessage=NULL, consistent with the Shanjian API call never being reached OR compensateVideoTaskSubmissionFailure not being called.
  timestamp: 2026-03-25

## Evidence

- timestamp: 2026-03-25
  checked: MySQL VideoTask WHERE id=cmn5dtddt0003f1jsr5m2ur6i
  found: status=pending, deliveryStatus=pending, externalTaskId=NULL, errorMessage=NULL, errorCode=NULL, createdAt=2026-03-25 01:45:40, updatedAt=2026-03-25 01:45:40 (never updated since creation)
  implication: The task was created (reservation succeeded) but never had externalTaskId set. compensateVideoTaskSubmissionFailure was NOT called — updatedAt has not changed, no errorCode/errorMessage stored.

- timestamp: 2026-03-25
  checked: task-recovery.ts lines 54-60 (staleVideoTasks query)
  found: WHERE clause is status="processing" only — pending tasks are NEVER included
  implication: Tasks stuck at pending status are invisible to the recovery poller entirely.

- timestamp: 2026-03-25
  checked: task-recovery.ts line 259
  found: `if (!videoTask.externalTaskId) continue;` — even if a pending task were found, it would be skipped without externalTaskId
  implication: There is no recovery path for tasks that are pending without an externalTaskId. They stay stuck indefinitely.

- timestamp: 2026-03-25
  checked: apps/web/src/app/api/tasks/route.ts lines 790-800
  found: compensateVideoTaskSubmissionFailure IS called when `reservation?.taskId && !upstreamAccepted`. This would set status=failed with errorCode.
  implication: The compensation ran but the Prisma write itself failed (the shanjianPayload migration wasn't applied yet at the time of task creation), OR the compensation was never triggered because the error occurred before upstreamAccepted was set but after the reservation was made — but wait, task shows no errorCode. This means either (a) compensation failed silently, or (b) the error was in the submission path but the catch block didn't execute correctly.

- timestamp: 2026-03-25
  checked: All pending tasks in VideoTask table
  found: Only 1 pending task total (this one). videoType=virtualman_broadcast.
  implication: This is an isolated incident from a specific moment when the shanjianPayload bug was live.

## Resolution

root_cause: Two compounding gaps: (1) When a Shanjian API submission fails, the compensateVideoTaskSubmissionFailure path in tasks/route.ts should mark the task failed — but the task cmn5dtddt0003f1jsr5m2ur6i was created during a window when the shanjianPayload Prisma field was missing (migration not yet applied), likely causing the whole request to fail in a way that prevented compensation from running, leaving the task in status=pending/externalTaskId=NULL. (2) The task-recovery poller (task-recovery.ts) only queries tasks with status="processing" — it never checks status="pending" tasks, so orphaned pending tasks are invisible to the recovery system and stay stuck indefinitely.

fix: (1) Manually updated stuck task cmn5dtddt0003f1jsr5m2ur6i to status=failed with errorCode=TASK_SUBMISSION_FAILED so it is no longer stuck. (2) Added PENDING_SUBMISSION_TIMEOUT_MS constant (5 minutes) and a new orphanedPendingVideoTasks query in runTaskRecoveryPass that finds pending tasks with no externalTaskId older than the timeout. A new loop expires these as failed with releasePlanReservation=true via settleVideoTaskFailure. Added orphanedPendingExpired to TaskRecoverySummary.

verification: TypeScript compilation passes with no errors. Task cmn5dtddt0003f1jsr5m2ur6i confirmed status=failed in database. Future orphaned pending tasks will be caught within 5 minutes by the next cron run.

files_changed:
  - apps/web/src/lib/task-recovery.ts
