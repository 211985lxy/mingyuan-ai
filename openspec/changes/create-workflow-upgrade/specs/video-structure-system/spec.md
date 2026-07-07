## ADDED Requirements

### Requirement: Generic video structures are first-class product assets
The system SHALL provide curated generic video structures as first-class assets for the create flow. Structures MUST describe reusable short-video speaking and shooting patterns, and MUST NOT be framed as single-industry playbooks.

#### Scenario: User browses generic structures
- **WHEN** an authenticated user opens the structure step in `/create`
- **THEN** the system returns a curated structure library with generic names, guidance copy, and blueprint metadata that can be reused across industries

### Requirement: Each structure includes both script blueprint and packaging intent
Each structure SHALL include machine-readable script blueprint fields and machine-readable packaging-intent fields so that the same structure can shape both script generation and downstream packaging adaptation.

#### Scenario: Script generation reads the script blueprint
- **WHEN** the backend generates scripts from a selected structure
- **THEN** it can load the structure's script blueprint fields such as opening pattern, narrative beats, pace, evidence density, and CTA style instead of relying on a frontend label

#### Scenario: Packaging recommendation reads the packaging intent
- **WHEN** the backend recommends packaging templates or presets for a selected structure
- **THEN** it can load packaging-intent fields such as subtitle emphasis, visual priority, recommended material roles, template capability preferences, and BGM style guidance

### Requirement: Structure selection drives downstream adaptation and lineage
The system SHALL require a selected structure before script generation begins, SHALL use that same structure to drive downstream packaging adaptation, and SHALL preserve structure lineage in downstream assets.

#### Scenario: Structure selection unlocks script generation and packaging adaptation
- **WHEN** the user selects a structure in the create flow
- **THEN** the system persists that choice in the current creation context, uses it for script generation, and later uses it to compute packaging recommendations and material suggestions

#### Scenario: Structure lineage remains traceable
- **WHEN** the system creates a generation run, production plan, or video task from a selected structure
- **THEN** each downstream record preserves enough structure linkage or snapshot data to trace the final video back to the selected structure
