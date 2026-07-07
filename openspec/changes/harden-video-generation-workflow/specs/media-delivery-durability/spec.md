## ADDED Requirements

### Requirement: All upstream-readable media inputs use a unified reachability contract
The system SHALL normalize every media input sent to the upstream video provider through a unified reachability layer. Managed private storage URLs MUST be converted into temporary upstream-readable URLs before submission, and unreadable assets MUST be rejected before the upstream call.

#### Scenario: Private OSS packaging asset is normalized for upstream access
- **WHEN** a production plan includes an image, video, or music asset stored in managed private storage
- **THEN** the backend resolves that asset to an upstream-readable URL before constructing the upstream request

#### Scenario: Unreachable packaging asset blocks submission
- **WHEN** a packaging asset or background-music asset cannot be resolved to an upstream-readable URL
- **THEN** the system rejects task submission with an explicit asset-readability error instead of sending the unresolved asset to the upstream provider

### Requirement: Completed outputs expose explicit delivery durability
The system SHALL explicitly distinguish between durable delivery and degraded delivery for generated outputs. A completed task MUST record whether the user-facing result has been durably archived or is still dependent on an expiring upstream URL.

#### Scenario: Successful archival marks task as durable
- **WHEN** a generated video and its cover are successfully transferred into managed durable storage
- **THEN** the completed task records a durable delivery state and returns durable user-facing URLs

#### Scenario: Transfer failure marks task as degraded
- **WHEN** the upstream generation succeeds but archival into durable storage fails
- **THEN** the task may remain completed, but the system records a degraded delivery state together with a user-visible warning and any known expiry information

### Requirement: Result archival is safe for large media objects
The system SHALL archive generated outputs in a way that is safe for large media objects and does not depend on fully buffering the object in application memory.

#### Scenario: Large output is archived without full in-memory buffering
- **WHEN** the system transfers a generated video into managed storage
- **THEN** the transfer path supports large outputs without requiring the full object to be loaded into application memory before upload

### Requirement: User-facing runtime surfaces degraded delivery honestly
The system SHALL expose degraded delivery states through backend responses so frontend pages can honestly communicate durable-vs-expiring access to the user.

#### Scenario: Video detail page receives degraded delivery metadata
- **WHEN** a client requests a completed task whose result archival degraded
- **THEN** the API response includes explicit degraded-delivery metadata that the frontend can display instead of presenting the result as a normal durable success
