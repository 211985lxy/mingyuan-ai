## ADDED Requirements

### Requirement: Three-step creation flow
The system SHALL provide a three-step create-video flow covering script selection, avatar selection, and generation confirmation.

#### Scenario: User moves through video creation
- **WHEN** a signed-in user creates a new video
- **THEN** the UI guides the user through step 1 script input or selection, step 2 avatar selection, and step 3 generation confirmation with an expected duration indicator

### Requirement: Publish-ready video output
The system SHALL generate a marketing video that includes digital avatar narration, subtitles, and basic packaging, and SHALL support attaching reusable material assets to the request.

#### Scenario: User submits a valid video request
- **WHEN** a user selects a ready avatar, a script, and optional material assets and starts generation
- **THEN** the system creates an asynchronous video task for a packaged marketing video instead of a raw avatar-only clip

### Requirement: Generation status feedback
The system SHALL surface asynchronous generation progress and terminal outcomes to the user while a task is pending or processing.

#### Scenario: User waits for generation
- **WHEN** a video task is still running
- **THEN** the create-video or result view shows the current task status and refreshes until the task becomes completed or failed

### Requirement: Completed video actions
The completed video experience SHALL provide preview, download, and copy-marketing-copy actions, and SHALL NOT require automated publishing in MVP.

#### Scenario: Video generation finishes successfully
- **WHEN** a user's video task reaches `completed`
- **THEN** the result view shows a playable preview, a download action, and a copy-marketing-copy action, while any publish action is omitted or clearly marked as unavailable
