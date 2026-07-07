# Purpose
Define the dashboard and `/create` flow behavior for the product's content-first journey, where profile completion and script quality precede avatar and video production.

## Requirements

### Requirement: Dashboard prioritizes profile completion and content creation
The console home page SHALL prioritize the actions that match the new product core: complete personal IP profile first, then create content, then create video.

#### Scenario: Incomplete user sees profile-first CTA
- **WHEN** the user opens the dashboard without a complete IP profile
- **THEN** the primary CTA and first guidance module direct the user to complete the IP profile

#### Scenario: Complete user sees content-first CTA
- **WHEN** the user opens the dashboard with a complete IP profile
- **THEN** the primary CTA directs the user into the content creation workflow rather than avatar selection

### Requirement: Create flow enforces content-first order
The `/create` experience SHALL follow this sequence: select content template, fill brief and generate scripts, choose or edit one script, choose a digital human, then confirm and submit video generation. The user MUST NOT be asked to choose a digital human before a script has been selected.

#### Scenario: Normal content-first progression
- **WHEN** the user enters `/create` with a complete IP profile
- **THEN** the flow starts from template selection and does not show avatar selection as the first step

#### Scenario: Avatar step requires selected script
- **WHEN** the user has not yet selected a saved script
- **THEN** the avatar step remains unavailable and the user is kept in the script-generation portion of the flow

### Requirement: Create flow uses real templates, scripts, avatars, and tasks
The content-first journey SHALL orchestrate the real backend entities already defined by the system: published content templates, persisted scripts, ready avatars, and video tasks.

#### Scenario: User creates a video from a selected script
- **WHEN** the user selects a saved script and a ready avatar, then submits the final step
- **THEN** the frontend calls the real video task API and the backend creates a `VideoTask` linked to the selected `Script`

#### Scenario: Selected script is snapshotted into the task
- **WHEN** the backend creates a `VideoTask` from a selected script
- **THEN** the task stores both the `scriptId` relation and the current `scriptContent` snapshot so later edits do not rewrite historical task content

### Requirement: Step-specific expert guidance remains part of the workflow
The content-first journey SHALL preserve the product's “marketing expert guiding the user” experience by showing contextual guidance at each stage of onboarding and creation.

#### Scenario: Profile page explains why the profile matters
- **WHEN** the user is filling the IP profile
- **THEN** the UI explains that the saved profile will shape later AI script generation

#### Scenario: Template step explains why template choice matters
- **WHEN** the user is selecting a content template
- **THEN** the UI explains what kind of opening structure or conversion goal the template is designed to serve
