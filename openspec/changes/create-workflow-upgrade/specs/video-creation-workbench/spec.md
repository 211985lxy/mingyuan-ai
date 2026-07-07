## ADDED Requirements

### Requirement: `/create` is a stateful four-stage virtualman workbench
The system SHALL treat `/create` as the dedicated pre-production workbench for the current virtualman domain. The workbench MUST expose four visible stages, MUST preserve work-in-progress state, and MUST NOT pretend to support out-of-domain video types inside the same path.

#### Scenario: User enters the virtualman workbench
- **WHEN** an authenticated user with a complete IP profile opens `/create`
- **THEN** the UI presents structure, expression, packaging, and video stages as one continuous virtualman workbench instead of a disposable wizard or a mixed-domain template browser

#### Scenario: Out-of-domain options are hidden or blocked before selection
- **WHEN** a content template or packaging template belongs to a video type outside the current virtualman create domain
- **THEN** the workbench hides that option or marks it unavailable before the user can rely on it in the flow

### Requirement: Workbench state is resumable and keeps honest stale-state semantics
The workbench SHALL preserve resumable draft state for selected structures, templates, scripts, packaging choices, and manual assets, and SHALL honestly invalidate or recompute downstream state when upstream decisions change.

#### Scenario: User resumes an incomplete creation draft
- **WHEN** the user returns to `/create` after leaving with an unfinished draft
- **THEN** the workbench restores still-valid structure, template, script, packaging, and avatar choices instead of silently generating placeholder state

#### Scenario: Structure change invalidates downstream recommendations
- **WHEN** the user changes the selected structure after scripts or packaging recommendations already exist
- **THEN** the workbench clears or marks stale the existing script, packaging recommendation, and AI-suggested material state, and explains that the upstream structure changed

#### Scenario: Script or template changes require packaging review
- **WHEN** the user changes the selected script or selected packaging template after packaging work has begun
- **THEN** the workbench marks packaging presets and AI material suggestions for review while preserving compatible manual assets when possible

### Requirement: Workbench shows recommendation reasons and final production summary
The workbench SHALL explain recommendation output at the packaging stage and SHALL show a final production summary before the user triggers cost-incurring generation.

#### Scenario: Packaging stage explains why templates are recommended
- **WHEN** the user reviews packaging templates in the workbench
- **THEN** the UI shows why the current structure and script favor certain templates, what material roles are recommended, and what remains missing for a convincing marketing video

#### Scenario: Final submission requires a complete summary
- **WHEN** the user reaches the final video generation stage
- **THEN** the workbench displays the selected structure, content template, final script, packaging template, materials, BGM status, avatar, and any blocking gaps before submission
