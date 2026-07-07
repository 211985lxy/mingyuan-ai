## ADDED Requirements

### Requirement: User registration
The system SHALL allow new users to register with email and password. Password MUST be hashed with bcrypt (cost 12). Registration SHALL return a JWT token and user profile (id, email, name). Duplicate emails SHALL be rejected with 409.

#### Scenario: Successful registration
- **WHEN** POST /api/auth/register with `{ email, password, name }`
- **THEN** system creates user with hashed password, plan="free", credits=100, returns `{ token, user: { id, email, name, plan, credits } }` with status 201

#### Scenario: Duplicate email
- **WHEN** POST /api/auth/register with an email that already exists
- **THEN** system returns 409 with `{ error: "Email already registered" }`

#### Scenario: Missing fields
- **WHEN** POST /api/auth/register without email, password, or name
- **THEN** system returns 400

### Requirement: User login
The system SHALL authenticate users by email and password, returning a JWT token valid for 7 days.

#### Scenario: Successful login
- **WHEN** POST /api/auth/login with valid email and password
- **THEN** system returns `{ token, user: { id, email, name, plan, credits } }` with status 200

#### Scenario: Invalid credentials
- **WHEN** POST /api/auth/login with wrong email or password
- **THEN** system returns 401 with `{ error: "Invalid credentials" }`

### Requirement: User profile retrieval
The system SHALL provide the current user's profile via GET /api/auth/me, protected by JWT.

#### Scenario: Authenticated profile fetch
- **WHEN** GET /api/auth/me with valid Bearer token
- **THEN** system returns `{ user: { id, email, name, plan, credits, createdAt } }`

#### Scenario: No token
- **WHEN** GET /api/auth/me without Authorization header
- **THEN** system returns 401

### Requirement: withUserAuth middleware
The system SHALL provide a `withUserAuth` middleware wrapper that validates JWT, checks user existence in DB, and injects `{ user: { id, email } }` into the handler context. Pattern MUST match existing `withAdminAuth`.

#### Scenario: Valid token passes through
- **WHEN** request has valid Bearer token and user exists in DB
- **THEN** middleware passes request to handler with user context

#### Scenario: Expired or invalid token
- **WHEN** request has expired or tampered JWT
- **THEN** middleware returns 401 without calling handler
