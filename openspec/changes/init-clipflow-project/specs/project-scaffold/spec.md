## ADDED Requirements

### Requirement: Unified full-stack scaffold
The system SHALL provide a single Next.js App Router application using TypeScript, Tailwind CSS, and shadcn/ui for both authenticated dashboard pages and server endpoints.

#### Scenario: Developer boots the project
- **WHEN** a developer installs dependencies, configures the required environment variables, and starts the app
- **THEN** the application serves auth pages, dashboard routes, and API routes from the same repository

### Requirement: Shared integration clients
The system SHALL initialize reusable clients for database access, Redis, authentication, OSS, LLM, and the Shanjian adapter from centralized modules.

#### Scenario: Route handler needs infrastructure access
- **WHEN** an API route performs persistence, cache, authentication, media, or third-party operations
- **THEN** it uses the shared integration module for that dependency instead of creating an ad hoc client

### Requirement: Runtime configuration validation
The system SHALL fail fast when required runtime configuration for PostgreSQL, Redis, OSS, Shanjian, LLM, or authentication secrets is missing.

#### Scenario: Missing integration secret
- **WHEN** the application starts or an affected feature is invoked without a required environment variable
- **THEN** the system reports which configuration is missing before the protected flow can proceed
