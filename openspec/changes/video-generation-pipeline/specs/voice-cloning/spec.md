## ADDED Requirements

### Requirement: Clone voice
The system SHALL allow authenticated users to clone a voice by providing audio URL, model type (v1|v2|v3|s1|s3), and language. The system MUST create an Asset record with `assetType="voice"`, `status="processing"`, call Shanjian `cloneVoice`, and store the returned taskId in `externalTaskId`.

#### Scenario: Voice clone submission
- **WHEN** POST /api/voices with `{ name, audioUrl, model, language }` and valid auth
- **THEN** creates Asset record (assetType="voice", status="processing", voiceModel=model), calls cloneVoice, stores externalTaskId, returns record with status 201

#### Scenario: Invalid model
- **WHEN** POST /api/voices with `{ model: "x99" }`
- **THEN** returns 400 with `{ error: "Invalid voice model" }`

### Requirement: List voices
The system SHALL return the user's cloned voices (from Asset where assetType="voice" and status="ready") combined with public voices from Shanjian. User voices first, then public voices.

#### Scenario: List all voices
- **WHEN** GET /api/voices with valid auth
- **THEN** returns `{ data: { userVoices: Asset[], publicVoices: ShanjianVoice[] } }`

#### Scenario: Include processing voices
- **WHEN** GET /api/voices?includeProcessing=true
- **THEN** returns user voices with all statuses (processing, ready, failed)

### Requirement: Delete voice
The system SHALL delete a cloned voice Asset record and call Shanjian `deleteAsset(externalSpeakerId)` if the voice is ready.

#### Scenario: Delete ready voice
- **WHEN** DELETE /api/voices/[id] where asset has externalSpeakerId
- **THEN** calls deleteAsset(externalSpeakerId), removes DB record, returns 200

#### Scenario: Delete processing voice
- **WHEN** DELETE /api/voices/[id] where status="processing"
- **THEN** removes DB record only (no Shanjian call), returns 200
