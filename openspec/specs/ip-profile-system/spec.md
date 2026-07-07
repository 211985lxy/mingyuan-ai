# Purpose
Define the persistent personal IP profile model and gating behavior that shapes the content-first workflow and script generation pipeline.

## Requirements

### Requirement: Single active IP profile per user
The system SHALL provide one active personal IP profile per user. The profile SHALL be readable and updatable through authenticated API endpoints, and SHALL persist the information required to guide later content generation.

#### Scenario: User fetches existing IP profile
- **WHEN** an authenticated user requests `GET /api/ip-profile`
- **THEN** the system returns the user's active IP profile if one exists, including its computed completeness state

#### Scenario: User creates or updates IP profile
- **WHEN** an authenticated user submits `PUT /api/ip-profile` with profile fields such as display name, nickname, industry, primary offer, target audience, IP traits, tone of voice, proof points, and call to action
- **THEN** the system upserts the active IP profile for that user and returns the saved profile with updated completeness state

#### Scenario: Unauthenticated request is rejected
- **WHEN** `GET /api/ip-profile` or `PUT /api/ip-profile` is called without a valid user token
- **THEN** the system returns 401

### Requirement: Profile completeness gates the content workflow
The system SHALL treat a complete IP profile as a prerequisite for starting the content-first creation workflow.

#### Scenario: User without complete profile opens dashboard
- **WHEN** an authenticated user without a complete IP profile opens `/`
- **THEN** the console prioritizes a CTA to `/ip-profile` and does not present video creation as the first action

#### Scenario: User without complete profile opens create flow
- **WHEN** an authenticated user without a complete IP profile opens `/create`
- **THEN** the frontend redirects or blocks progression until the user completes the IP profile

### Requirement: IP profile is injected into script generation prompts
The script generation pipeline SHALL derive a structured profile prompt snapshot from the saved IP profile and include it in every template-guided script generation request.

#### Scenario: Successful generation with complete profile
- **WHEN** an authenticated user with a complete IP profile requests script generation
- **THEN** the backend loads the saved profile, derives a prompt snapshot from it, and injects that snapshot into the LLM request

#### Scenario: Generation rejected when profile is incomplete
- **WHEN** a script generation request is made for a user whose active IP profile is missing required fields
- **THEN** the system returns a precondition failure and instructs the client to complete the profile first
