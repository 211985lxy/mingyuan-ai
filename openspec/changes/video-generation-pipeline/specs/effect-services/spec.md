## ADDED Requirements

### Requirement: Text-to-speech endpoint
The system SHALL provide a TTS endpoint that accepts text, speakerId, and optional params (language, speedRatio, volume, codec). Returns taskId for async result retrieval.

#### Scenario: TTS submission
- **WHEN** POST /api/effects/tts with `{ text, speakerId }` and valid auth
- **THEN** calls textToSpeech, returns `{ data: { taskId } }` with status 201

#### Scenario: Missing required fields
- **WHEN** POST /api/effects/tts without text or speakerId
- **THEN** returns 400

### Requirement: Speech-to-text endpoint
The system SHALL provide an ASR endpoint that accepts audioUrl and language. Returns taskId.

#### Scenario: ASR submission
- **WHEN** POST /api/effects/asr with `{ audioUrl, language }` and valid auth
- **THEN** calls audioToText, returns `{ data: { taskId } }` with status 201
