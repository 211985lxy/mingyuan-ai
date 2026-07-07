## ADDED Requirements

### Requirement: Admin authentication isolation
The system SHALL authenticate admin users from a separate AdminUser table with independent JWT tokens, fully isolated from the regular user authentication system.

#### Scenario: Admin logs in
- **WHEN** an admin user submits valid email and password credentials to the admin login endpoint
- **THEN** the system returns a JWT token scoped to admin operations that is not interchangeable with regular user tokens

#### Scenario: Regular user token used on admin endpoint
- **WHEN** a request with a regular user JWT attempts to access an admin API endpoint
- **THEN** the system rejects the request with HTTP 401

### Requirement: Two-tier role permissions
The system SHALL enforce a fixed two-tier role model (editor, admin) where each role has a predefined set of permissions.

#### Scenario: Editor creates and publishes a template
- **WHEN** an admin user with the "editor" role creates a template and publishes it
- **THEN** the system allows template creation and publishing but rejects any attempt to delete templates or manage admin users

#### Scenario: Admin deletes a template
- **WHEN** an admin user with the "admin" role deletes a template in "draft" status
- **THEN** the system permanently removes the template record

#### Scenario: Editor attempts deletion
- **WHEN** an admin user with the "editor" role attempts to delete a template
- **THEN** the system rejects the request with HTTP 403

### Requirement: Template lifecycle state management
The system SHALL enforce the template lifecycle transitions: draft → published → archived, with restore (archived → published) as a valid reverse transition.

#### Scenario: Publish a draft template
- **WHEN** an authorized admin publishes a template with status "draft"
- **THEN** the template transitions to "published" status with the publishedAt timestamp recorded and the template becomes visible to end users

#### Scenario: Archive a published template
- **WHEN** an authorized admin archives a template with status "published"
- **THEN** the template transitions to "archived" status with the archivedAt timestamp recorded and the template is no longer visible to end users

#### Scenario: Restore an archived template
- **WHEN** an authorized admin restores a template with status "archived"
- **THEN** the template transitions back to "published" status and becomes visible to end users again

#### Scenario: Invalid state transition
- **WHEN** an admin attempts a transition not in the allowed state machine (e.g., archived → draft)
- **THEN** the system rejects the request with a validation error indicating the invalid transition

### Requirement: Template CRUD operations
The system SHALL provide admin API endpoints for creating, reading, updating, and listing templates across all lifecycle states.

#### Scenario: Admin lists all templates
- **WHEN** an authorized admin requests the template list
- **THEN** the system returns templates across all statuses (draft, published, archived) with pagination support

#### Scenario: Admin edits a template
- **WHEN** an authorized admin updates a template's script framework, variables, or classification metadata
- **THEN** the system persists the changes and updates the modification timestamp

### Requirement: Template sort ordering and featuring
The system SHALL allow admins to set a numeric sort weight and a featured flag on templates to control display ordering and prominence for end users.

#### Scenario: Admin features a template
- **WHEN** an admin sets the featured flag to true on a published template
- **THEN** the template appears in featured template queries and is prioritized in default listing order

#### Scenario: Admin adjusts sort weight
- **WHEN** an admin sets sortOrder to 100 on a template
- **THEN** that template appears before templates with lower sortOrder values in user-facing listings

### Requirement: Hot list collection monitoring
The system SHALL expose admin API endpoints to view hot list fetch history and collection health statistics.

#### Scenario: Admin views fetch history
- **WHEN** an admin requests the hot topics history endpoint
- **THEN** the system returns recent DouyinHotSnapshot records with batch ID, fetch timestamp, item count, and status

#### Scenario: Admin checks collection health
- **WHEN** an admin requests collection statistics
- **THEN** the system returns the count of successful and failed fetches over the last 24 hours and 7 days

### Requirement: Initial admin user seeding
The system SHALL provide a mechanism to create the first admin user during system initialization, either via a seed script or an environment-variable-driven bootstrap.

#### Scenario: System initializes with no admin users
- **WHEN** the application starts and the AdminUser table is empty
- **THEN** a seed script or migration creates a default admin user from configured environment variables (ADMIN_EMAIL, ADMIN_PASSWORD)

### Requirement: Starter template seed data
The system SHALL include a seed script that populates the content template table with an initial set of templates covering core industries, so the system has value immediately after deployment.

#### Scenario: Seed script runs on fresh database
- **WHEN** the template seed script executes against an empty ContentTemplate table
- **THEN** at least 8 published templates are created covering the top industries (房产, 电商, 教育, 餐饮, 美容, 汽车, 健康, 本地生活), each with a complete 358-structured script framework and variable definitions
