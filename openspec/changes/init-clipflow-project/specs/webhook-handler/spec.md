## ADDED Requirements

### Requirement: Fast acknowledgment and idempotency
The webhook endpoint SHALL acknowledge incoming Shanjian callbacks immediately and SHALL process each external task callback idempotently.

#### Scenario: Duplicate webhook delivery
- **WHEN** Shanjian sends the same callback payload for the same external task more than once
- **THEN** the system acknowledges each request but applies the business-side state transition at most once

### Requirement: Avatar callback reconciliation
The webhook handler SHALL map avatar clone callbacks to the correct avatar record and update avatar readiness or failure state.

#### Scenario: Avatar clone callback arrives
- **WHEN** the webhook receives a clone-task result for a known avatar task identifier
- **THEN** the corresponding avatar is updated to `ready` with binding metadata on success or `failed` on error

### Requirement: Video callback reconciliation
The webhook handler SHALL map video generation callbacks to the correct video task and finalize task state, durable media storage, and downstream billing updates.

#### Scenario: Video generation callback arrives
- **WHEN** the webhook receives a video-task result for a known video generation task identifier
- **THEN** the corresponding task is updated to `completed` or `failed` and the post-success settlement workflow is triggered exactly once

### Requirement: Recovery polling for missing callbacks
The system SHALL periodically query overdue external tasks so that missing callbacks do not leave avatar or video tasks stuck indefinitely.

#### Scenario: Callback never arrives
- **WHEN** an avatar or video task remains in a non-terminal state beyond its timeout threshold
- **THEN** the recovery job queries the upstream task status and reconciles the local state accordingly
