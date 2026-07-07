## ADDED Requirements

### Requirement: `/create` is a stateful three-layer production workbench
The system SHALL treat `/create` as the dedicated production workbench for pre-video decisions, not as a disposable wizard. The workbench MUST explicitly separate director-layer, scriptwriter-layer, and packaging-layer responsibilities, and MUST show the current readiness of each layer before final video generation.

#### Scenario: User enters the workbench with a complete profile
- **WHEN** an authenticated user with a complete IP profile opens `/create`
- **THEN** the UI presents the director, scriptwriter, and packaging layers as distinct parts of one continuous creation workspace instead of collapsing them into a single generic form flow

#### Scenario: Workbench shows readiness by layer
- **WHEN** the user has partially completed the creation flow
- **THEN** the workbench shows which layers are complete, which are missing required inputs, and what remains before the user can submit the final video generation step

### Requirement: Workbench state is resumable and preserves expensive progress
The system SHALL preserve in-progress creation context so the user can leave and resume without losing completed decisions or expensive generated artifacts such as selected structures, selected templates, generated scripts, or completed packaging choices.

#### Scenario: User resumes an incomplete creation session
- **WHEN** the user returns to `/create` after leaving with an unfinished draft
- **THEN** the workbench restores the saved structure, selected template, generated or selected script, and completed packaging choices that are still valid

#### Scenario: Saved server-owned artifacts are reused instead of regenerated
- **WHEN** the user revisits `/create` and previously generated scripts or saved packaging selections already exist for the current draft
- **THEN** the workbench reuses those persisted artifacts instead of silently generating fresh placeholder content

### Requirement: Upstream changes explicitly invalidate dependent downstream work
The system SHALL detect when a user changes an upstream decision and MUST explicitly invalidate, clear, or mark stale any dependent downstream decisions that are no longer trustworthy.

#### Scenario: Changing structure invalidates downstream script and packaging state
- **WHEN** the user changes the selected video structure after scripts have already been generated
- **THEN** the workbench marks the existing script and packaging state as stale or clears it, and explains that the upstream director-layer choice changed

#### Scenario: Changing the selected script invalidates packaging review state
- **WHEN** the user switches to a different selected script after completing packaging selections
- **THEN** the workbench marks the packaging plan for review before final generation, because the packaging decision was based on a different spoken script

### Requirement: Final submission requires a visible production summary
The system SHALL present a final production summary before the user triggers cost-incurring video generation. The summary MUST identify the selected structure, content template, final script, packaging template, materials, soundtrack choice, avatar, and voice.

#### Scenario: User reviews the final production plan before submission
- **WHEN** the user reaches the final submit stage
- **THEN** the workbench displays a clear production summary so the user can verify what will actually be sent to video generation

#### Scenario: Missing prerequisite blocks final submission with a concrete reason
- **WHEN** any required layer or asset is incomplete at the final stage
- **THEN** the workbench blocks submission and explains exactly which prerequisite is missing instead of allowing a fake or partial success path
