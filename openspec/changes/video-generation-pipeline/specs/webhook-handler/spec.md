## ADDED Requirements

### Requirement: Unified webhook endpoint
The system SHALL provide POST /api/webhook/shanjian that receives all Shanjian async callbacks. MUST immediately return 200 (fast ACK) and process asynchronously.

#### Scenario: Receive callback
- **WHEN** Shanjian POSTs webhook payload with `{ taskId, status, result, errorCode, errorMessage, costRights }`
- **THEN** system returns 200 immediately

### Requirement: Idempotent processing
The system SHALL use Redis `SET NX` with 24h TTL on key `webhook:{taskId}` to prevent duplicate processing. If key already exists, skip processing silently.

#### Scenario: First callback for a task
- **WHEN** webhook received for taskId not yet in Redis
- **THEN** sets Redis key, proceeds with processing

#### Scenario: Duplicate callback
- **WHEN** webhook received for taskId already in Redis
- **THEN** skips processing, returns 200

### Requirement: Task type dispatch
The system SHALL identify task type by querying in order: 1) `avatar.externalTaskId` 2) `videoTask.externalTaskId` 3) `asset.externalTaskId` (for voice clones, TTS, ASR). Unknown taskIds MUST be logged and ignored (return 200).

#### Scenario: Avatar clone callback
- **WHEN** taskId matches an Avatar record
- **THEN** routes to avatar callback handler

#### Scenario: Video task callback
- **WHEN** taskId matches a VideoTask record
- **THEN** routes to video callback handler

#### Scenario: Voice clone callback
- **WHEN** taskId matches an Asset record with assetType="voice"
- **THEN** routes to voice callback handler

#### Scenario: Unknown taskId
- **WHEN** taskId matches no record
- **THEN** logs warning, returns 200

### Requirement: Avatar callback handling
The system SHALL update avatar clone callbacks into terminal avatar states. On success it SHALL set the avatar to `ready` and persist returned `virtualmanId` and `speakerId`. On failure it SHALL set the avatar to `failed` and persist `errorCode` and `errorMessage`.

#### Scenario: Successful avatar clone
- **WHEN** callback with status "succeed" and result.virtualmanId
- **THEN** updates avatar: status="ready", externalVirtualmanId=result.virtualmanId, externalSpeakerId=result.speakerId

#### Scenario: Failed avatar clone
- **WHEN** callback with status "failed"
- **THEN** updates avatar: status="failed", errorCode, errorMessage

### Requirement: Video callback handling
The system SHALL finalize video generation callbacks into terminal task states. On success it SHALL transfer returned media to OSS when available, persist final media URLs and duration, mark the task `completed`, and settle actual credits. On failure it SHALL mark the task `failed` and refund any pre-deducted credits.

#### Scenario: Successful video generation
- **WHEN** callback with status "succeed" and result.videoUrl
- **THEN** transfers video+cover to OSS, updates task: status="completed", videoUrl=ossUrl, coverUrl=ossCoverUrl, duration, creditsCost=actual; adjusts user credits

#### Scenario: Failed video generation
- **WHEN** callback with status "failed"
- **THEN** updates task: status="failed", errorCode, errorMessage; refunds pre-deducted credits to user

#### Scenario: OSS transfer failure (degraded)
- **WHEN** OSS upload fails during transfer
- **THEN** saves original Shanjian URL (24h expiry), logs error for retry

### Requirement: Voice clone callback handling
The system SHALL finalize voice clone callbacks into terminal asset states. On success it SHALL persist `externalSpeakerId`, `demoAudioUrl`, and set the asset to `ready`. On failure it SHALL set the asset to `failed` and persist `errorCode` and `errorMessage`.

#### Scenario: Successful voice clone
- **WHEN** callback with status "succeed" and result.speakerId
- **THEN** updates Asset: status="ready", externalSpeakerId=result.speakerId, demoAudioUrl=result.demoAudioUrl

#### Scenario: Failed voice clone
- **WHEN** callback with status "failed"
- **THEN** updates Asset: status="failed", errorCode, errorMessage

### Requirement: Database-level state machine guard
As a second defense line when Redis is unavailable, status transitions MUST be guarded at DB level: only allow processing→completed/failed for VideoTask, cloning→ready/failed for Avatar, processing→ready/failed for Asset. Transition attempts on already-terminal states MUST be silently ignored.

#### Scenario: Duplicate callback with Redis down
- **WHEN** Redis SET NX fails (unavailable) and callback arrives for already-completed task
- **THEN** DB update is skipped because status is already terminal, no side effects
