## ADDED Requirements

### Requirement: Hourly hot list collection
The system SHALL fetch the Douyin hot search list from the configured primary data source every hour via a scheduled cron job.

#### Scenario: Successful hourly fetch
- **WHEN** the hourly cron job executes and the primary data source returns a valid response
- **THEN** the system stores all hot search items in the database with a unique batch identifier and updates the Redis cache with the latest hot list data

#### Scenario: Cron endpoint is protected
- **WHEN** an external caller invokes the cron endpoint without the correct CRON_SECRET bearer token
- **THEN** the system rejects the request with HTTP 401 and does not execute the fetch

### Requirement: Data source fallback chain
The system SHALL attempt a secondary data source when the primary source fails, and SHALL serve the most recent cached data when all sources are unavailable.

#### Scenario: Primary source fails
- **WHEN** the primary data source (xxapi.cn) returns an error or times out
- **THEN** the system automatically attempts the fallback source (vvhan.com) before recording a failure

#### Scenario: All sources fail
- **WHEN** both primary and fallback sources are unavailable
- **THEN** the system logs the failure, records a failed snapshot, and the frontend API continues serving the most recent successfully cached hot list from Redis or database

### Requirement: Hot list deduplication
The system SHALL store hot list items with a composite unique constraint on sentence identifier and batch identifier to prevent duplicate entries within the same fetch cycle.

#### Scenario: Duplicate items in a single fetch
- **WHEN** the data source returns items with duplicate sentence identifiers within one response
- **THEN** the system stores each unique sentence identifier exactly once per batch

### Requirement: User-facing hot topics API
The system SHALL expose a public API endpoint that returns the current hot search list for authenticated users.

#### Scenario: User requests current hot topics
- **WHEN** an authenticated user calls the hot topics API
- **THEN** the system returns the latest hot list from Redis cache, including rank, title, hot value, label, video count, cover URL, and Douyin search URL

#### Scenario: Cache is empty
- **WHEN** the Redis cache has expired and no cached data is available
- **THEN** the system falls back to querying the most recent batch from the database

### Requirement: Hot list data retention and cleanup
The system SHALL automatically remove hot list records older than 30 days and snapshot records older than 90 days.

#### Scenario: Daily cleanup job runs
- **WHEN** the daily cleanup cron job executes
- **THEN** the system deletes DouyinHotItem records with fetchedAt older than 30 days and DouyinHotSnapshot records with fetchedAt older than 90 days

### Requirement: Fetch snapshot tracking
The system SHALL record a snapshot entry for every fetch attempt, tracking the batch identifier, item count, timestamp, and success or failure status.

#### Scenario: Fetch completes with results
- **WHEN** a fetch cycle completes successfully
- **THEN** a DouyinHotSnapshot record is created with status "success" and the count of items stored

#### Scenario: Fetch fails entirely
- **WHEN** a fetch cycle fails after exhausting all fallback sources
- **THEN** a DouyinHotSnapshot record is created with status "failed" and zero item count
