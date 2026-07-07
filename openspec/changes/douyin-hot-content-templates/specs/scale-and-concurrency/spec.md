## ADDED Requirements

### Requirement: Per-user concurrent video generation limit
The system SHALL enforce a maximum number of simultaneously processing video tasks per user based on their subscription plan.

#### Scenario: Free user submits while one task is processing
- **WHEN** a free-plan user attempts to create a video task while they already have 1 task in "processing" status
- **THEN** the system rejects the request and informs the user to wait for the current task to complete or upgrade their plan

#### Scenario: Pro user submits within concurrency limit
- **WHEN** a pro-plan user with 3 tasks in "processing" status attempts to create a new video task (limit is 5)
- **THEN** the system accepts the request and creates the task normally

### Requirement: Shanjian concurrency error handling
The system SHALL gracefully handle Shanjian API concurrency limit errors and present a user-friendly message instead of a raw error.

#### Scenario: Shanjian returns concurrency exceeded
- **WHEN** the Shanjian API returns error code "Concurrency.Limit" for a video generation request
- **THEN** the system returns a user-friendly "system busy" message and does not create a failed task record

### Requirement: Public data caching
The system SHALL cache infrequently changing public data (voice list, digital human list, Shanjian templates) in Redis with appropriate TTLs to minimize database and external API load.

#### Scenario: Public voice list is cached
- **WHEN** the public voice list API is called and a cached version exists in Redis within the 24-hour TTL
- **THEN** the system returns the cached data without calling the Shanjian API

#### Scenario: Cache expires and is refreshed
- **WHEN** a cached public data entry expires beyond its TTL
- **THEN** the next request fetches fresh data from the source, stores it in Redis, and returns the fresh data

### Requirement: Content template cache with active invalidation
The system SHALL cache published content template listings in Redis and invalidate the cache when any template's published state changes.

#### Scenario: Template is published and cache updates
- **WHEN** an admin publishes or archives a template
- **THEN** the system invalidates the published templates cache so the next user request reflects the change

### Requirement: API response cache headers
The system SHALL set appropriate Cache-Control headers on public data endpoints to enable CDN and browser caching.

#### Scenario: Hot topics endpoint sets cache headers
- **WHEN** a client requests the hot topics API
- **THEN** the response includes Cache-Control headers allowing public caching for up to 5 minutes

#### Scenario: Voice list endpoint sets cache headers
- **WHEN** a client requests the public voice list API
- **THEN** the response includes Cache-Control headers allowing public caching for up to 1 hour

### Requirement: Database index optimization
The system SHALL define database indexes on frequently queried columns to support the 1000-user query load without degradation.

#### Scenario: Video task lookup by user and status
- **WHEN** the system queries a user's processing tasks for concurrency checking
- **THEN** the query uses an index on (user_id, status) and completes within acceptable latency

#### Scenario: Template filtering by status and industry
- **WHEN** a user browses templates filtered by status and industry
- **THEN** the query uses a JSON-aware index or optimized query on (status) with JSON_CONTAINS for industry and completes within acceptable latency
