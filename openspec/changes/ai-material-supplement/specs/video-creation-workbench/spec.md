## ADDED Requirements

### Requirement: Packaging workbench exposes dual-mode material input with honest states
The `/create` packaging step SHALL surface both AI-assisted evidence supplement and direct upload/select flows for packaging assets. The workbench MUST show when AI suggestions are loading, ready for review, still transferring, or failed, and it MUST NOT reduce the normal user path to raw URL text inputs.

#### Scenario: Packaging step offers AI and upload/select entry points
- **WHEN** the user enters the packaging step with a selected script and selected packaging template
- **THEN** the workbench offers AI assistance in that template context and also lets the user upload or select their own image, video, and music assets without requiring URL entry

#### Scenario: Suggestion cards expose transparent source information
- **WHEN** AI suggestions are returned to the packaging step
- **THEN** the workbench displays those items with preview imagery, role labels, search-query provenance, and transfer status so the user can review them before final submission

#### Scenario: Manual packaging upload becomes usable in the same session
- **WHEN** the user uploads a new image, video, or music asset from the packaging step
- **THEN** the workbench registers that asset through the real asset APIs and makes it immediately selectable in the current packaging draft

### Requirement: AI packaging suggestions participate in workbench invalidation and draft restore
The workbench SHALL preserve AI/manual packaging draft items across resume flows and SHALL invalidate AI suggestions when upstream context changes make them untrustworthy.

#### Scenario: Script change invalidates AI suggestions but preserves manual materials
- **WHEN** the user changes the selected script or materially edits the script text after AI packaging suggestions already exist
- **THEN** the workbench clears or marks the AI suggestions stale, preserves manual materials, and explains that the packaging evidence must be reviewed again

#### Scenario: Draft restore brings back AI suggestion state
- **WHEN** the user resumes an unfinished create draft that already contains AI packaging suggestions
- **THEN** the workbench restores the AI/manual distinction, asset selections, per-item transfer state, and any pending review state instead of only restoring the selected packaging template

### Requirement: Final generation blocks on non-durable AI packaging items
The workbench SHALL block final production submission while any selected AI packaging item is not yet durably mirrored into managed storage.

#### Scenario: Pending transfer blocks final submit
- **WHEN** one or more selected AI packaging items are still `pending` or `transferring`
- **THEN** the final submit action remains blocked and the workbench tells the user which items are still waiting for durable transfer

#### Scenario: Failed transfer requires user action
- **WHEN** an AI packaging item enters a failed transfer state
- **THEN** the workbench requires the user to remove or regenerate that item before submitting the final video generation step
