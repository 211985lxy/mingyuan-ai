## MODIFIED Requirements

### Requirement: Dashboard prioritizes profile completion and content creation
The console home page SHALL prioritize the actions that match the new product core: complete personal IP profile first, then enter the structured three-layer creation workflow, then create video.

#### Scenario: Incomplete user sees profile-first CTA
- **WHEN** the user opens the dashboard without a complete IP profile
- **THEN** the primary CTA and first guidance module direct the user to complete the IP profile

#### Scenario: Complete user sees three-layer creation CTA
- **WHEN** the user opens the dashboard with a complete IP profile
- **THEN** the primary CTA directs the user into the three-layer video creation workflow rather than avatar selection or immediate video submission

### Requirement: Create flow enforces content-first order
The `/create` experience SHALL follow this sequence: select a video structure, select a content template, fill the brief and generate scripts, choose or edit one script, choose a packaging template and packaging assets, then choose a digital human and confirm video generation. The user MUST NOT be asked to choose a digital human before a script has been selected, and MUST NOT bypass packaging decisions if a production plan is required.

#### Scenario: Normal three-layer progression
- **WHEN** the user enters `/create` with a complete IP profile
- **THEN** the flow starts from structure selection and guides the user through structure, expression, and packaging before final video generation

#### Scenario: Final generation requires both selected script and production plan
- **WHEN** the user has not yet selected a saved script or has not yet completed the required packaging step
- **THEN** the final avatar-and-submit step remains unavailable and the user is kept in the pre-production portion of the workflow

### Requirement: Create flow uses real templates, scripts, avatars, and tasks
The three-layer journey SHALL orchestrate real backend entities for structures, content templates, persisted scripts, packaging templates or packaging plans, ready avatars, and video tasks.

#### Scenario: User creates a video from a selected script and production plan
- **WHEN** the user selects a saved script, completes the packaging step, selects a ready avatar, and submits the final step
- **THEN** the frontend calls the real video task API and the backend creates a `VideoTask` linked to the selected `Script` and the selected production plan

#### Scenario: Selected script and production plan are snapshotted into the task
- **WHEN** the backend creates a `VideoTask` from the final creation flow
- **THEN** the task stores both the chosen script lineage and the packaging lineage so later edits do not rewrite historical task context

### Requirement: Step-specific expert guidance remains part of the workflow
The three-layer journey SHALL preserve the product's “marketing expert guiding the user” experience by showing contextual guidance at each stage and explaining why each layer matters.

#### Scenario: Structure step explains why the director-layer choice matters
- **WHEN** the user is selecting a video structure
- **THEN** the UI explains what kind of narrative rhythm, hook style, and conversion purpose that structure is designed to serve

#### Scenario: Packaging step explains why supporting materials matter
- **WHEN** the user is selecting a packaging template and adding materials
- **THEN** the UI explains that packaging and supporting materials are what turn a spoken script into a convincing mixed-edit marketing video
