## ADDED Requirements

### Requirement: Douyin hot list tables
The system SHALL persist Douyin hot search data in a DouyinHotItem table for individual entries and a DouyinHotSnapshot table for fetch cycle metadata, with appropriate indexes for time-based queries and uniqueness constraints.

#### Scenario: Hot list batch is stored
- **WHEN** a successful hot list fetch stores items and a snapshot record
- **THEN** DouyinHotItem records exist with sentenceId, word, hotValue, position, label, videoCount, discussCount, coverUrl, eventTime, fetchedAt, and batchId; and a DouyinHotSnapshot record exists with batchId, fetchedAt, itemCount, and status

#### Scenario: Duplicate prevention within batch
- **WHEN** an attempt is made to insert a DouyinHotItem with the same sentenceId and batchId as an existing record
- **THEN** the database rejects the duplicate based on the composite unique constraint

### Requirement: Content template table
The system SHALL persist content templates in a ContentTemplate table with fields for script framework (TEXT), variable definitions (JSON), hook type, Shanjian style binding, industry tags (JSON array for MySQL compatibility), content type, hot topic keywords (JSON array, separate from display tags), seasonal event config (JSON with event id and date range), lifecycle status (draft/published/archived), sort ordering, featured flag, usage count, creator, publication and archive timestamps.

#### Scenario: Template with full metadata is persisted
- **WHEN** an admin creates a content template with script text, variable definitions, industry tags, content type, hook type, Shanjian styleId, hot topic keywords, and preset packRules
- **THEN** all fields are stored in a single ContentTemplate row with JSON-typed array fields for MySQL compatibility and the status defaults to "draft"

#### Scenario: Template industry filtering uses JSON_CONTAINS
- **WHEN** the system queries templates by industry in MySQL
- **THEN** the query uses JSON_CONTAINS on the industry JSON array column with an index on status for pre-filtering

#### Scenario: Template queries use indexes
- **WHEN** the system queries templates by status, by sortOrder, or by featured+status combination
- **THEN** each query path has a corresponding database index

### Requirement: Admin user table
The system SHALL persist admin users in an AdminUser table with email, hashed password, name, role (editor/admin), and active status, fully separate from the regular users table.

#### Scenario: Admin user is created
- **WHEN** an admin user record is created with email, password hash, name, and role
- **THEN** the record is stored in the AdminUser table with a unique email constraint and the isActive flag defaults to true

#### Scenario: Admin email uniqueness
- **WHEN** an attempt is made to create an AdminUser with an email that already exists
- **THEN** the database rejects the duplicate based on the unique constraint on email
