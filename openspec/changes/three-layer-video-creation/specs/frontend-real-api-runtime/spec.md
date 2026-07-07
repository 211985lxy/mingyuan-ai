## MODIFIED Requirements

### Requirement: Core console pages use real backend data only
The authenticated console SHALL fetch and mutate runtime data only through real `/api/*` endpoints. App routes, including `/create`, MUST NOT depend on `@/lib/mock/*` during runtime.

#### Scenario: Dashboard loads from real APIs
- **WHEN** the user opens `/`
- **THEN** the frontend loads recent video tasks, current user state, and hot topics from real API endpoints instead of mock services

#### Scenario: Videos pages load from real APIs
- **WHEN** the user opens `/videos` or `/videos/[id]`
- **THEN** the frontend reads task data from `GET /api/tasks` and `GET /api/tasks/[id]` instead of mock services

#### Scenario: Assets page loads from real APIs
- **WHEN** the user opens `/assets`
- **THEN** the frontend reads avatars from `GET /api/avatars` and assets from `GET /api/assets` instead of mock services

#### Scenario: Create workbench loads from real APIs
- **WHEN** the user opens `/create`
- **THEN** the frontend loads structures, content templates, generated scripts, packaging options, avatars, and task submission behavior from real APIs instead of `@/lib/mock/services`

### Requirement: Frontend displays only backend-supported runtime states
The frontend SHALL render only states and fields that exist in real backend contracts. Mock-only runtime fields and fabricated success states MUST NOT drive user-facing decisions.

#### Scenario: Dashboard and account use real user metrics
- **WHEN** the frontend receives the authenticated user profile and task list from real APIs
- **THEN** it displays backend-supported metrics such as `plan`, `credits`, current processing task count, and recent videos instead of `dailyLimit` or `videosCreatedToday`

#### Scenario: Video cards use real cover field
- **WHEN** a video task returned by the backend includes `coverUrl`
- **THEN** the frontend uses `coverUrl` as the preview image source instead of a mock-only `thumbnailUrl`

#### Scenario: Create workbench does not fabricate candidate scripts
- **WHEN** `/create` cannot reach the real script generation or packaging APIs
- **THEN** the frontend shows an honest unavailable or degraded state instead of synthesizing fake scripts, fake templates, or fake task success from mock services
