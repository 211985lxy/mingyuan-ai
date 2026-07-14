# Purpose

Define server-owned content generation that combines authorized project context, knowledge, task constraints, and user input into persisted AIM versions.

## Requirements

### Requirement: Server owns generation context

The server SHALL validate project access and compose the final generation context. The client MUST NOT be trusted to provide authoritative project facts, knowledge records, source generation records, or final prompts.

#### Scenario: Authorized generation

- **WHEN** an authenticated user requests content for an accessible project
- **THEN** the server loads authorized context, composes the runtime task, and records the generation

#### Scenario: Unauthorized source reference

- **WHEN** the request references a project, knowledge item, or generation owned by another user
- **THEN** the server rejects or ignores that source without exposing its content

### Requirement: Generation context distinguishes evidence

Facts from project records, knowledge, topics, and upstream generations SHALL retain source metadata. User-entered additions SHALL be marked as user input, and model inference MUST NOT be represented as verified fact.

### Requirement: Content versions are persisted and editable

Each successful generation SHALL create a persistent version. A user may create a new version, edit the current version, rewrite from a reference, or split the current version for multiple platforms.

#### Scenario: User performs a scoped edit

- **WHEN** the request identifies an edit scope
- **THEN** the new version changes only that scope and retains the prior version in history

#### Scenario: User restores history

- **WHEN** the user explicitly restores a historical version
- **THEN** it becomes the current version without deleting intervening history

### Requirement: Content flows to publishing

The current content version SHALL be reusable by pre-publish review, publication planning, publication records, and outcome review without starting a media-generation subsystem.
