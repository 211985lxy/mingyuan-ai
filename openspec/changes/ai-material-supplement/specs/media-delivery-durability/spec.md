## ADDED Requirements

### Requirement: Third-party stock suggestions must be mirrored before production use
The system SHALL treat third-party stock suggestions as pre-production draft inputs until they have been durably mirrored into managed storage. Production plans and video task submissions MUST NOT rely on raw Pexels URLs as final material URLs.

#### Scenario: Durable mirror completion unlocks production use
- **WHEN** an AI-suggested Pexels item finishes OSS transfer successfully
- **THEN** the system exposes the managed durable URL for that item and allows it to be used in a saved production plan or final video task submission

#### Scenario: Pending or transferring stock item is rejected for production
- **WHEN** a client attempts to save a production plan or submit a video task using an AI-suggested item whose mirror state is `pending` or `transferring`
- **THEN** the backend rejects that request instead of silently accepting the upstream stock URL

#### Scenario: User-uploaded packaging asset is already managed for production
- **WHEN** a user uploads an image, video, or music asset through the managed asset flow from the packaging step
- **THEN** the resulting packaging draft item can enter downstream production as a managed asset-backed input without requiring an additional third-party mirror step

### Requirement: Stock mirror failures are surfaced honestly and remain repairable
The system SHALL surface stock mirror failures as explicit, user-actionable states. It MUST NOT silently degrade an AI-suggested packaging item back to an expiring third-party URL.

#### Scenario: Mirror failure returns actionable error metadata
- **WHEN** mirroring an AI-suggested stock item into managed storage fails
- **THEN** the system records a failed transfer state and returns enough metadata for the workbench to ask the user to retry, regenerate, or remove that item

#### Scenario: Failed item cannot masquerade as usable material
- **WHEN** an AI-suggested stock item is in a failed mirror state
- **THEN** downstream production-plan and task APIs treat that item as unusable until the user resolves it through a new durable suggestion or manual replacement
