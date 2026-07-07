## ADDED Requirements

### Requirement: AI script generation
The system SHALL generate exactly three candidate marketing scripts from the user's industry, selling points, and city inputs.

#### Scenario: User requests AI-generated scripts
- **WHEN** a user submits industry, selling points, and city to the script generator
- **THEN** the system returns three distinct candidate scripts for selection in the create-video flow

### Requirement: Script editing and persistence
The system SHALL let users select, edit, and save a generated or manually entered script for later reuse.

#### Scenario: User edits a generated script
- **WHEN** the user modifies a generated script and chooses to save it
- **THEN** the system persists the edited content as a user-owned script that can be used in future video tasks

### Requirement: Script reuse in creation flow
The create-video experience SHALL support both freshly generated scripts and previously saved scripts.

#### Scenario: User starts a new video with an existing script
- **WHEN** a returning user enters the create-video flow
- **THEN** the system allows the user to choose from saved scripts instead of requiring a new AI generation request
