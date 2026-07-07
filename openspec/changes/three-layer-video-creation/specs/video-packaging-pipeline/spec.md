## ADDED Requirements

### Requirement: Packaging template selection is a first-class creation step
The system SHALL provide a dedicated packaging step after script selection, and that step SHALL present curated video packaging templates backed by Shanjian template capabilities.

#### Scenario: Packaging step opens after script selection
- **WHEN** the user has selected a saved script in the create flow
- **THEN** the system unlocks a packaging step that presents curated packaging templates instead of immediately jumping to final video submission

#### Scenario: Packaging templates expose capability labels
- **WHEN** the system lists packaging templates
- **THEN** each template includes preview media and capability labels such as subtitle style, identity card, evidence insertions, or picture-in-picture-style layout support

### Requirement: Packaging step adapts structure intent without over-restricting template choice
The system SHALL translate the selected video structure into packaging intent that can guide template ranking, parameter presets, and material prompts. The system MUST NOT hard-limit template choice unless the selected template lacks a required capability for the chosen structure.

#### Scenario: Structure changes reorder packaging recommendations
- **WHEN** the user keeps the same content script but switches to a different video structure
- **THEN** the packaging step may change recommended template order, default parameter presets, and suggested material roles to match the new structure intent

#### Scenario: Structure does not hard-filter templates by default
- **WHEN** the selected structure expresses a different rhythm or evidence preference
- **THEN** the system still keeps technically compatible templates selectable and marks them as recommended, acceptable, or weak-fit instead of blocking them outright

#### Scenario: Only true capability mismatch blocks a template
- **WHEN** the selected structure requires packaging capabilities that a specific template fundamentally cannot support
- **THEN** the system blocks that template selection and explains the missing capability rather than pretending all templates are equally suitable

### Requirement: Packaging brief captures materials and soundtrack inputs
The system SHALL allow the user to attach optional or required packaging assets, including supporting image/video materials and background music, and SHALL preserve role metadata for those assets.

#### Scenario: Template requests supporting materials
- **WHEN** the selected packaging template requires evidence or supporting materials
- **THEN** the system prompts the user for the relevant material slots and preserves the intended role of each uploaded or selected asset

#### Scenario: User supplies custom background music
- **WHEN** the user chooses a custom music asset during packaging
- **THEN** the system stores that music choice as part of the packaging brief rather than dropping it at submission time

### Requirement: Packaging plans drive the final video task
The system SHALL persist a production plan that combines the selected script, packaging template, packaging rules, material assignments, and soundtrack inputs, and the final video task SHALL be created from that plan.

#### Scenario: Final generation uses a saved production plan
- **WHEN** the user submits the final video generation step
- **THEN** the backend creates a video task that links to a saved production plan instead of relying on a hardcoded `styleId` or ad hoc request body state

#### Scenario: Video task retains packaging lineage
- **WHEN** a video task is created from a production plan
- **THEN** the task retains linkage to the selected packaging template and the material assignments used for that task

### Requirement: Backend maps packaging plans to the proper Shanjian generation contract
The backend SHALL choose the Shanjian generation contract based on the saved production plan complexity rather than assuming a single packaging API for every request.

#### Scenario: Standard packaging plan uses the standard broadcast API
- **WHEN** the production plan uses one selected script, one selected digital human, and template-level material support without scene-by-scene overrides
- **THEN** the backend creates the upstream request through `POST /v1/clip/video/virtualman_broadcast`

#### Scenario: Scene-controlled packaging plan uses the custom broadcast API
- **WHEN** the production plan requires segment-specific material assignment or other scene-level controls
- **THEN** the backend creates the upstream request through `POST /v1/clip/video/custom_virtualman_broadcast`

### Requirement: Picture-in-picture is expressed as a template capability, not a global toggle
The system SHALL describe picture-in-picture-like layouts as capabilities of a packaging template and MUST NOT expose a universal boolean switch that implies every template can support the same layout.

#### Scenario: User inspects a template with picture-in-picture support
- **WHEN** a selected packaging template supports picture-in-picture-style composition
- **THEN** the UI describes that capability on the template and does not present it as a system-wide on/off switch
