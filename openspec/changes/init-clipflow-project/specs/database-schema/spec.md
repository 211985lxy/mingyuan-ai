## ADDED Requirements

### Requirement: MVP core entities
The system SHALL persist the MVP domain using relational tables for users, avatars, assets, scripts, and video tasks, including ownership relationships and audit timestamps.

#### Scenario: Persisting a new video workflow
- **WHEN** a user creates assets, scripts, avatars, and video tasks during normal product use
- **THEN** each record is stored in its corresponding table with a foreign-key relationship back to the owning user

### Requirement: Media generation fields
The system SHALL persist the external task identifiers, processing status, canonical media URLs, error details, and settled `credits_cost` needed to recover and explain asynchronous generation flows.

#### Scenario: Tracking a Shanjian generation task
- **WHEN** the system creates or updates an avatar clone task or a video generation task
- **THEN** it stores the external task identifier and the internal state required to resume, reconcile, and display the workflow

### Requirement: Schema shall match MVP scope
The MVP schema SHALL NOT require publish-specific tables such as `social_accounts` or `publish_sessions` to satisfy this change.

#### Scenario: Initializing the MVP database
- **WHEN** the initial Prisma schema is created for this change
- **THEN** it includes only the tables required for authentication, assets, scripts, billing, and video generation
