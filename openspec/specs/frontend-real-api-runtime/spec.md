# Purpose

Define the production runtime contract for authenticated pages so the UI uses persisted backend data and supported capabilities only.

## Requirements

### Requirement: Authentication uses real APIs

Login, registration, refresh, and logout SHALL use server-owned authentication endpoints and secure session state. Invalid or expired sessions SHALL be cleared without fabricating an authenticated state.

### Requirement: Console pages use real backend data

Authenticated pages SHALL fetch and mutate runtime data only through supported `/api/*` endpoints. Runtime code MUST NOT depend on mock services or fabricate successful output for unavailable capabilities.

#### Scenario: AIM loads current work

- **WHEN** an authenticated user opens `/aim`
- **THEN** the page loads accessible projects, recent generations, workflow state, and knowledge-backed context from real APIs

#### Scenario: Asset management loads ordinary assets

- **WHEN** the user opens the asset manager
- **THEN** the page reads and manages ordinary image, video, and music assets through the real asset APIs

#### Scenario: Voice input is transcribed

- **WHEN** a user submits supported recorded audio from an AIM input
- **THEN** the frontend calls `POST /api/aim/transcribe` and inserts the returned text without invoking a media-generation workflow

### Requirement: Frontend follows backend contracts

The frontend SHALL render only states and fields present in backend response contracts. Missing capabilities SHALL appear unavailable rather than being synthesized from mock data.
