## 1. Data Contract And Domain Foundations

- [x] 1.1 Define the revised `VideoTask` delivery contract, including active-state and delivery-state fields or metadata needed to represent `pending`, `durable`, and `degraded`
- [x] 1.2 Add and migrate any Prisma schema changes required for explicit task reservation and delivery-status persistence
- [x] 1.3 Introduce shared domain helpers for task state transitions, compensation idempotency, and delivery-status updates

## 2. Reliable Task Submission

- [x] 2.1 Refactor `POST /api/tasks` to create a local reservation before upstream submission
- [x] 2.2 Count both `pending` and `processing` tasks in active-concurrency enforcement
- [x] 2.3 Move task reservation, plan reservation, and task creation into a consistent transaction boundary
- [x] 2.4 Implement submission compensation so upstream creation failures release reservations, mark the task terminally, and compensate exactly once
- [x] 2.5 Ensure production-plan consumption and release semantics match the new reservation model

## 3. Unified Terminal Settlement

- [x] 3.1 Extract a shared terminal-settlement service used by webhook processing, recovery polling, and submission compensation
- [x] 3.2 Refactor `/api/webhook/shanjian` to use the shared settlement service for success, failure, and compensation paths
- [x] 3.3 Refactor `runTaskRecoveryPass` to use the same shared settlement service and preserve idempotent behavior
- [x] 3.4 Remove direct upstream state advancement from `GET /api/tasks/[id]` so it becomes a pure read of backend-confirmed task state

## 4. Media Reachability And Durable Delivery

- [x] 4.1 Introduce a unified `resolveUpstreamReadableUrl` path for training assets, packaging materials, BGM, and voice-clone inputs
- [x] 4.2 Validate packaging assets and BGM before upstream submission and return explicit asset-readability errors when resolution fails
- [x] 4.3 Replace full-buffer result archival with a streaming-safe transfer path in OSS integration
- [x] 4.4 Persist explicit durable-vs-degraded delivery metadata whenever result archival succeeds, partially succeeds, or falls back to expiring upstream URLs
- [x] 4.5 Surface degraded-delivery warnings and expiry metadata through task list/detail API responses

## 5. Verification And Migration

- [x] 5.1 Add or update backend tests for reservation creation, exactly-once compensation, shared terminal settlement, and degraded delivery reporting
- [x] 5.2 Run a repair/backfill pass for historical tasks that still point to expiring upstream URLs when feasible
- [x] 5.3 Document rollout, feature-flag, and rollback steps for the new reservation and delivery model
