## MODIFIED Requirements

### Requirement: Create flow enforces content-first order
The `/create` experience SHALL follow four visible stages: structure, expression, packaging, and video generation. Internally, the flow SHALL require this sequence: select a video structure, select a generic expression template, fill the brief and generate scripts, choose or edit one script, review packaging recommendations, choose a packaging template and packaging assets, then choose a digital human and confirm video generation. The user MUST NOT be asked to choose a digital human before a script has been selected, and MUST NOT bypass packaging decisions if a production plan is required.

#### Scenario: Normal four-stage progression
- **WHEN** the user enters `/create` with a complete IP profile
- **THEN** the flow starts from structure selection, guides the user through expression and packaging, and only unlocks final video generation after a valid script and production plan exist

#### Scenario: Unsupported out-of-domain path is blocked early
- **WHEN** a content template or packaging path belongs to a non-virtualman video type outside the current create domain
- **THEN** the user is blocked or the option is hidden before entering that unsupported path instead of discovering the incompatibility at final submission time

### Requirement: Create flow uses real templates, scripts, avatars, and tasks
The content-first journey SHALL orchestrate real backend entities for published structures, content templates, persisted scripts, recommendation-backed packaging templates or packaging plans, ready avatars, and video tasks.

#### Scenario: User creates a video from a selected script and production plan
- **WHEN** the user selects a saved script, completes the packaging step, selects a ready avatar, and submits the final step
- **THEN** the frontend calls the real production-plan and video-task APIs and the backend creates a `VideoTask` linked to the selected `Script` and selected production plan

#### Scenario: Selected script and production plan are snapshotted into the task
- **WHEN** the backend creates a `VideoTask` from the final creation flow
- **THEN** the task stores both the chosen script lineage and the packaging lineage so later edits do not rewrite historical task context

### Requirement: Step-specific expert guidance remains part of the workflow
The content-first journey SHALL preserve the product's “marketing expert guiding the user” experience by explaining why each stage matters, why certain templates are recommended, and why certain support materials are being requested.

#### Scenario: Structure step explains generic creative intent
- **WHEN** the user is selecting a video structure
- **THEN** the UI explains what kind of hook rhythm, speaking pattern, and viewing experience that structure is designed to create without tying that structure to one specific industry

#### Scenario: Expression step explains generic persuasion logic
- **WHEN** the user is selecting an expression template
- **THEN** the UI explains what kind of message logic the template uses, what proof burden it expects, and what business goal it is best suited for without tying the card to one specific industry

#### Scenario: Packaging step explains recommendation reasons
- **WHEN** the user is reviewing packaging templates in the packaging stage
- **THEN** the UI explains why a template is recommended or weak-fit, what material roles are suggested, and what still needs user-supplied proof assets
