## ADDED Requirements

### Requirement: Video task submission reserves local state before upstream acceptance
The system SHALL create a local task reservation before it treats a video generation attempt as accepted. Task reservation, concurrency reservation, and production-plan reservation MUST be recorded in local state before the upstream video provider response is trusted.

#### Scenario: Successful task reservation precedes upstream submission
- **WHEN** an authenticated user submits a valid video task request
- **THEN** the backend first creates a local `VideoTask` in an active pre-upstream state and reserves the required concurrency slot before calling the upstream provider

#### Scenario: Reservation failure blocks upstream submission
- **WHEN** the backend cannot reserve concurrency or the referenced production plan
- **THEN** the system rejects the request locally and MUST NOT call the upstream provider

### Requirement: Failed task settlement compensates at most once
The system SHALL settle failed video tasks through a single idempotent compensation path. A failed task MUST release any still-reserved local resources exactly once regardless of whether the terminal failure is discovered by webhook, recovery polling, or local compensation after upstream submission fails.

#### Scenario: Failure discovered by webhook
- **WHEN** the upstream provider reports a task failure through webhook
- **THEN** the system marks the task as failed and applies any required local compensation exactly once

#### Scenario: Failure discovered by recovery worker
- **WHEN** the recovery worker determines that a previously active task has failed upstream
- **THEN** the system marks the task as failed and applies any required local compensation exactly once

#### Scenario: Failure discovered during submission compensation
- **WHEN** the upstream task creation request fails after a local reservation was created
- **THEN** the system marks the reserved task as failed or cancelled, releases any still-reserved local resources, and compensates exactly once

### Requirement: Terminal task transitions are owned by backend orchestration channels
The system SHALL allow only backend orchestration channels to advance a video task from an active state to a terminal state. Read APIs and page polling MUST NOT independently perform upstream status advancement.

#### Scenario: Read API returns backend-confirmed state only
- **WHEN** a client requests `GET /api/tasks/[id]`
- **THEN** the system returns the locally confirmed task state and MUST NOT use that read request to independently query or settle the upstream task

#### Scenario: Backend orchestration channels advance task state
- **WHEN** the system needs to reconcile an upstream task result
- **THEN** only webhook processing and the recovery worker are permitted to advance the task to `completed` or `failed`

### Requirement: Production plan consumption is consistent with task acceptance
The system SHALL treat production plan consumption as part of reliable task reservation. A plan MUST NOT be irreversibly consumed unless the task is accepted locally, and failed submission compensation MUST release the plan for retry when appropriate.

#### Scenario: Accepted task consumes the production plan
- **WHEN** a task reservation is successfully created for a production plan and the upstream submission succeeds
- **THEN** the production plan is marked as consumed for subsequent reuse protection

#### Scenario: Compensated submission releases the production plan
- **WHEN** a reserved task fails before upstream acceptance is confirmed
- **THEN** the system releases the production plan reservation so the user can retry instead of leaving the plan permanently unusable
