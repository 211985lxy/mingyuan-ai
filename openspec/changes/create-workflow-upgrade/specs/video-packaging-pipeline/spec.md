## ADDED Requirements

### Requirement: Packaging supports dual-mode support material inputs
The packaging stage SHALL support both AI-assisted support materials and user-managed assets. AI-assisted materials SHALL come from real Pexels image/video search and transfer, while user-managed inputs SHALL support upload and managed-library selection for image, video, and music assets.

#### Scenario: AI fills support material slots with Pexels media
- **WHEN** the user asks the system to help complete packaging materials
- **THEN** the system may suggest Pexels-backed image or video materials for safe support roles and preserve those selections as AI-sourced materials with durable-transfer state

#### Scenario: User fills packaging materials manually
- **WHEN** the user uploads or selects a managed asset for packaging
- **THEN** the system stores that asset as a real managed image, video, or music input instead of requiring the user to paste a raw URL

### Requirement: AI material assistance is limited to safe support roles
The system SHALL restrict AI-assisted material fill to support-role assets that do not imply real-world proof claims, and SHALL reserve sensitive proof roles for manual real-user assets.

#### Scenario: Sensitive proof roles remain manual-only
- **WHEN** the current packaging plan includes roles such as `customer_case`, `qualification`, or `before_after`
- **THEN** the system requires user-supplied real assets for those roles and MUST NOT auto-fill them from Pexels

#### Scenario: Durable transfer gates AI material use
- **WHEN** an AI-suggested Pexels asset has not completed durable transfer into managed storage
- **THEN** the system keeps that material in a draft or pending state and blocks production-plan finalization or task submission until the asset is durable

### Requirement: Background music remains manual until a real provider exists
The system SHALL treat background music as a manual asset choice in this phase. The UI MAY show guidance about suggested mood or pacing, but the system MUST NOT claim automatic BGM search, automatic soundtrack generation, or automatic BGM control while no real provider integration exists.

#### Scenario: User selects or uploads manual BGM
- **WHEN** the user chooses background music during packaging
- **THEN** the system stores that music as a user-managed asset choice in the production plan

#### Scenario: No automatic BGM is fabricated
- **WHEN** the create flow builds packaging defaults or recommendations
- **THEN** it may include advisory BGM text but does not auto-attach a soundtrack or present a fake “AI BGM completed” state

### Requirement: Packaging plans preserve recommendation and asset lineage
The system SHALL persist a production plan that combines the selected script, selected packaging template, recommendation-derived presets, material assignments, and background music choice, and the final video task SHALL be created from that saved plan.

#### Scenario: Production plan stores packaging lineage
- **WHEN** the user completes the packaging step
- **THEN** the backend creates or updates a production plan that preserves template selection, material lineage, BGM lineage, and enough recommendation context to audit how the packaging decision was made

#### Scenario: Final video task reuses the saved production plan
- **WHEN** the user submits the final video generation step
- **THEN** the backend creates the video task from the saved production plan instead of rebuilding packaging state ad hoc from transient client fields
