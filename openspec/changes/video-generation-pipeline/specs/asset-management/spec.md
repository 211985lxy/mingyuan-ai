## ADDED Requirements

### Requirement: Get OSS upload signature
The system SHALL generate a presigned OSS upload URL for client-side direct upload. Accepts file name and content type. Returns signed URL + final asset URL.

#### Scenario: Request upload URL
- **WHEN** POST /api/assets/upload-url with `{ fileName, contentType }` and valid auth
- **THEN** returns `{ data: { uploadUrl, assetUrl, expiresAt } }`

#### Scenario: OSS not configured
- **WHEN** OSS env vars are missing
- **THEN** returns 503 with `{ error: "File upload not configured" }`

### Requirement: Register asset
The system SHALL register an uploaded asset in the database after client-side upload completes. Accepts name, assetType (image|video|music), url, and optional size.

#### Scenario: Register image asset
- **WHEN** POST /api/assets with `{ name, assetType: "image", url, size }`
- **THEN** creates Asset record, returns `{ data: asset }` with status 201

### Requirement: List assets
The system SHALL return the authenticated user's assets, supporting filter by assetType.

#### Scenario: List all assets
- **WHEN** GET /api/assets with valid auth
- **THEN** returns `{ data: { results: Asset[], total } }`

#### Scenario: Filter by type
- **WHEN** GET /api/assets?assetType=video
- **THEN** returns only video assets

### Requirement: Delete asset
The system SHALL delete an asset record and optionally remove the file from OSS.

#### Scenario: Delete asset
- **WHEN** DELETE /api/assets/[id] where asset belongs to user
- **THEN** deletes DB record, returns 200
