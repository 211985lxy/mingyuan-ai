## ADDED Requirements

### Requirement: Create avatar with clone type
The system SHALL allow authenticated users to create an avatar by specifying a clone type (`fast`, `professional`, `image`). The system MUST validate required fields per type, run file validation, create a DB record (status=cloning), call the corresponding Shanjian clone API, store the returned taskId, and return the avatar record.

#### Scenario: Fast clone creation
- **WHEN** POST /api/avatars with `{ name, cloneType: "fast", videoUrl, authVideoUrl, authText }`
- **THEN** validates videoUrl meets fast clone rules (5-60s, <=500MB), creates avatar record (status="cloning"), calls cloneFastAvatar, stores externalTaskId, returns avatar with status 201

#### Scenario: Image clone creation
- **WHEN** POST /api/avatars with `{ name, cloneType: "image", imageUrl, authVideoUrl, authText }`
- **THEN** validates imageUrl meets image clone rules (300-2000px, <=5MB), creates avatar record (status="cloning"), calls cloneImageAvatar, stores externalTaskId

#### Scenario: Professional clone creation
- **WHEN** POST /api/avatars with `{ name, cloneType: "professional", videoUrl, authVideoUrl, authText }`
- **THEN** validates videoUrl meets professional clone rules (30-120s, <=1GB), checks user has 500 credits, deducts credits, creates avatar record (status="cloning"), calls cloneProfessionalAvatar

#### Scenario: Missing required fields
- **WHEN** POST /api/avatars with cloneType="fast" but no videoUrl
- **THEN** returns 400 with `{ error: "videoUrl is required for fast clone" }`

#### Scenario: Invalid clone type
- **WHEN** POST /api/avatars with cloneType="unknown"
- **THEN** returns 400 with `{ error: "Invalid clone type" }`

### Requirement: List user avatars
The system SHALL return the authenticated user's avatars, ordered by createdAt desc. MUST support filtering by status.

#### Scenario: List all avatars
- **WHEN** GET /api/avatars with valid auth
- **THEN** returns `{ data: { results: Avatar[], total } }`

#### Scenario: Filter by status
- **WHEN** GET /api/avatars?status=ready
- **THEN** returns only avatars with status "ready"

### Requirement: Get avatar detail
The system SHALL return a single avatar by ID, only if owned by the authenticated user.

#### Scenario: Own avatar
- **WHEN** GET /api/avatars/[id] where avatar belongs to user
- **THEN** returns `{ data: avatar }`

#### Scenario: Other user's avatar
- **WHEN** GET /api/avatars/[id] where avatar belongs to another user
- **THEN** returns 404

### Requirement: Delete avatar
The system SHALL delete an avatar record and call Shanjian deleteAsset if externalVirtualmanId exists. MUST also delete associated externalSpeakerId if present.

#### Scenario: Delete ready avatar
- **WHEN** DELETE /api/avatars/[id] for a "ready" avatar with externalVirtualmanId
- **THEN** calls deleteAsset for virtualmanId (and speakerId if exists), deletes DB record, returns 200

#### Scenario: Delete cloning avatar
- **WHEN** DELETE /api/avatars/[id] for a "cloning" avatar
- **THEN** deletes DB record (no Shanjian call needed since clone isn't complete), returns 200
