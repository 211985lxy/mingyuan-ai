## ADDED Requirements

### Requirement: Cron poll for stale tasks
The system SHALL provide GET /api/cron/poll-tasks (protected by CRON_SECRET) that finds tasks stuck in processing state beyond timeout thresholds and actively queries Shanjian for status. Covers three record types: Avatar, VideoTask, Asset (voice clones).

#### Scenario: Poll stale avatar (fast/image clone)
- **WHEN** cron runs and finds avatar with status="cloning" and updatedAt < now()-15min
- **THEN** calls getTaskInfo(externalTaskId), applies same logic as webhook avatar callback

#### Scenario: Poll stale avatar (professional clone)
- **WHEN** cron runs and finds avatar with status="cloning", cloneType implied by absence of speakerName, and updatedAt < now()-7hours
- **THEN** calls getTaskInfo(externalTaskId), applies same logic as webhook avatar callback

#### Scenario: Poll stale video task
- **WHEN** cron runs and finds videoTask with status="processing" and updatedAt < now()-5min
- **THEN** calls getTaskInfo(externalTaskId), applies same logic as webhook video callback

#### Scenario: Poll stale voice clone
- **WHEN** cron runs and finds Asset with assetType="voice", status="processing", updatedAt < now()-10min
- **THEN** calls getTaskInfo(externalTaskId), applies same logic as webhook voice callback

#### Scenario: Task still processing at Shanjian
- **WHEN** getTaskInfo returns status="processing"
- **THEN** skips the task (continue waiting)

### Requirement: Polling lock
The system SHALL use Redis `SET NX` with 60s TTL on key `poll:{taskId}` to prevent concurrent polling of the same task.

#### Scenario: Lock acquired
- **WHEN** poll lock does not exist for taskId
- **THEN** sets lock, proceeds with polling

#### Scenario: Lock exists
- **WHEN** poll lock already exists for taskId
- **THEN** skips this task
