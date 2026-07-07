## ADDED Requirements

### Requirement: Curated video structures are first-class product assets
The system SHALL provide curated video structure templates as first-class assets for the create flow. Each structure MUST include both user-facing guidance and machine-readable blueprint metadata such as opening pattern, narrative beats, evidence slot expectations, CTA slot, and recommended duration range.

#### Scenario: User browses available structures
- **WHEN** an authenticated user opens the structure step in `/create`
- **THEN** the system returns curated structure templates with names, guidance copy, and blueprint metadata needed for downstream generation

#### Scenario: Structure blueprint is available for downstream services
- **WHEN** the backend needs to generate scripts or create a production plan from a selected structure
- **THEN** it can load a machine-readable blueprint for that structure instead of relying on a frontend-only label

### Requirement: Structure selection gates downstream creation
The system SHALL require a selected video structure before script generation can begin.

#### Scenario: Missing structure blocks script generation
- **WHEN** a script generation request is submitted without a selected structure
- **THEN** the system rejects the request and instructs the user to choose a video structure first

#### Scenario: Selected structure unlocks script generation
- **WHEN** the user selects a structure in the create flow
- **THEN** the system persists that structure choice in the current creation context and allows the user to continue into script generation

### Requirement: Structure lineage is preserved through generation and video tasks
The system SHALL persist the selected structure and its effective blueprint snapshot in downstream generation records and video production records.

#### Scenario: Generation run records structure lineage
- **WHEN** the system creates a script generation run
- **THEN** the run stores the selected `structureId` and a snapshot of the structure blueprint used for that run

#### Scenario: Video production retains structure lineage
- **WHEN** the user creates a video task from a selected script
- **THEN** the system preserves the originating structure linkage so the final video can be traced back to the director-layer decision
