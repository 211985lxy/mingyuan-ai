## ADDED Requirements

### Requirement: Email and password authentication
The system SHALL allow users to register and sign in with email and password credentials, and SHALL protect dashboard routes from unauthenticated access.

#### Scenario: Unauthenticated visitor requests a dashboard page
- **WHEN** a visitor who is not signed in navigates to a protected dashboard route
- **THEN** the system redirects the visitor to the authentication flow before showing dashboard content

### Requirement: Account identity and entitlements
The system SHALL store and display each user's current plan and remaining credits using the MVP plan identifiers `free`, `basic`, and `pro`.

#### Scenario: Signed-in user opens the account page
- **WHEN** an authenticated user views account settings
- **THEN** the page shows the user's current plan, remaining credits, and an upgrade call to action

### Requirement: MVP account settings scope
The MVP account experience SHALL focus on profile access and billing visibility, and SHALL NOT require external publishing account binding to complete the change.

#### Scenario: User views account settings in MVP
- **WHEN** the account page is rendered for the MVP release
- **THEN** the page works without OAuth-connected publishing accounts and any future publishing controls are omitted or clearly marked as unavailable
