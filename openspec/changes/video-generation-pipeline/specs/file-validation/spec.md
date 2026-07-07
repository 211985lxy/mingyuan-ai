## ADDED Requirements

### Requirement: Training video validation
The system SHALL validate training video metadata before submitting clone requests. Rules per clone type: professional (30-120s, <=1GB, <=2000px, 10-60fps, mp4/mov, h264/hevc), fast (5-60s, <=500MB, same other rules), image (300-2000px, <=5MB, jpg/png/webp, aspect 0.4-2.5).

#### Scenario: Valid fast clone video
- **WHEN** validateTrainingVideo("fast", { duration: 30, size: 100MB, format: "mp4" })
- **THEN** returns `{ valid: true }`

#### Scenario: Duration too short
- **WHEN** validateTrainingVideo("fast", { duration: 3 })
- **THEN** returns `{ valid: false, errors: ["Duration must be 5-60 seconds"] }`

### Requirement: Material validation
The system SHALL validate material files: video (mp4/mov, h264/hevc, <60s per clip, <=500MB, <=2000px), image (jpg/png/webp, <=10MB, <=2000px), audio (mp3/wav/m4a, <=5min, <=120MB).

#### Scenario: Valid image material
- **WHEN** validateMaterial("image", { size: 2MB, format: "jpg" })
- **THEN** returns `{ valid: true }`

#### Scenario: Video too long
- **WHEN** validateMaterial("video", { duration: 90 })
- **THEN** returns `{ valid: false, errors: ["Video duration must be under 60 seconds"] }`

### Requirement: Voice clone audio validation
The system SHALL validate voice clone audio per model: v1/v2/v3 (5-120s, <=10MB), s1/s3 (10-120s, <=10MB). Formats: mp3/wav/m4a.

#### Scenario: Valid v1 audio
- **WHEN** validateVoiceAudio("v1", { duration: 60, size: 5MB, format: "mp3" })
- **THEN** returns `{ valid: true }`

#### Scenario: S1 audio too short
- **WHEN** validateVoiceAudio("s1", { duration: 5 })
- **THEN** returns `{ valid: false, errors: ["Audio must be 10-120 seconds for s1 model"] }`
