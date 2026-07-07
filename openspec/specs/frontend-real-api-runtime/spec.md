# Purpose
Define the production runtime contract for the authenticated frontend so console pages use real backend APIs, persisted auth state, and only backend-supported fields.

## Requirements

### Requirement: Authentication pages use real user APIs
The system SHALL submit login and registration forms to the real user auth endpoints. The frontend MUST persist the returned JWT and authenticated user state, and MUST restore authenticated state from the stored token on refresh.

#### Scenario: Successful registration continues into onboarding
- **WHEN** a user submits valid data on `/register`
- **THEN** the frontend calls `POST /api/auth/register`, persists the returned token and user, and routes the user to `/ip-profile` without using mock services

#### Scenario: Successful login restores dashboard access
- **WHEN** a user submits valid credentials on `/login`
- **THEN** the frontend calls `POST /api/auth/login`, persists the returned token and user, and routes the user into the authenticated console

#### Scenario: Refresh with stored token
- **WHEN** an authenticated user refreshes a dashboard page
- **THEN** the frontend rehydrates the stored token, calls `GET /api/auth/me` with `Authorization: Bearer <token>`, and keeps the user logged in if the token is valid

#### Scenario: Invalid token is cleared
- **WHEN** any protected API call returns 401 because the stored token is invalid or expired
- **THEN** the frontend clears persisted auth state and redirects the user to `/login`

### Requirement: Core console pages use real backend data only
The authenticated console SHALL fetch and mutate runtime data only through real `/api/*` endpoints. App routes MUST NOT depend on `@/lib/mock/*` during runtime.

#### Scenario: Dashboard loads from real APIs
- **WHEN** the user opens `/`
- **THEN** the frontend loads recent video tasks, current user state, and hot topics from real API endpoints instead of mock services

#### Scenario: Videos pages load from real APIs
- **WHEN** the user opens `/videos` or `/videos/[id]`
- **THEN** the frontend reads task data from `GET /api/tasks` and `GET /api/tasks/[id]` instead of mock services

#### Scenario: Assets page loads from real APIs
- **WHEN** the user opens `/assets`
- **THEN** the frontend reads avatars from `GET /api/avatars` and assets from `GET /api/assets` instead of mock services

### Requirement: Frontend displays only backend-supported runtime states
The frontend SHALL render only states and fields that exist in real backend contracts. Mock-only runtime fields and fabricated success states MUST NOT drive user-facing decisions.

#### Scenario: Dashboard and account use real user metrics
- **WHEN** the frontend receives the authenticated user profile and task list from real APIs
- **THEN** it displays backend-supported metrics such as `plan`, `credits`, current processing task count, and recent videos instead of `dailyLimit` or `videosCreatedToday`

#### Scenario: Video cards use real cover field
- **WHEN** a video task returned by the backend includes `coverUrl`
- **THEN** the frontend uses `coverUrl` as the preview image source instead of a mock-only `thumbnailUrl`

#### Scenario: Missing backend capability does not fabricate output
- **WHEN** a page needs a feature that has no backend API yet, such as marketing analysis or publish suggestions
- **THEN** the frontend shows an honest unavailable state or `Coming Soon`, and does not synthesize fake runtime data from mock services

### Requirement: Asset and avatar mutations follow real backend contracts
The frontend SHALL collect the real inputs required by backend asset and avatar endpoints, including clone type, uploaded file URLs, authorization materials, and asset registration steps.

#### Scenario: User creates an avatar through the assets page
- **WHEN** the user submits a digital human creation form
- **THEN** the frontend collects the required fields for the selected clone type and calls `POST /api/avatars` with the real payload instead of simulating success locally

#### Scenario: User uploads an asset
- **WHEN** the user uploads an image, video, or music file
- **THEN** the frontend first requests `POST /api/assets/upload-url`, performs the actual upload, and then calls `POST /api/assets` to register the stored asset
