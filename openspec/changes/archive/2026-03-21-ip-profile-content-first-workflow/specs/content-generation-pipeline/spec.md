## ADDED Requirements

### Requirement: Template-guided script generation
The system SHALL generate scripts from published content templates, not from freeform mock helpers. Script generation SHALL accept a selected template, structured brief inputs, and optional hot-topic context.

#### Scenario: Generate scripts from a selected template
- **WHEN** an authenticated user calls `POST /api/scripts/generate` with `{ templateId, inputs }`
- **THEN** the system validates the published template, validates required brief fields, generates script candidates through the server-side pipeline, and returns persisted candidates

#### Scenario: Generate scripts with hot-topic context
- **WHEN** an authenticated user calls `POST /api/scripts/generate` with `{ templateId, inputs, hotTopic }`
- **THEN** the system incorporates the hot-topic context into the prompt composition and returns script candidates tied to the same generation run

#### Scenario: Missing required brief field
- **WHEN** the request omits a template-required field declared by the template's variable schema
- **THEN** the system returns 400 and lists the missing fields

### Requirement: Prompt composition uses profile, template, and brief together
The system SHALL compose LLM prompts from three required layers: the user's IP profile snapshot, the selected content template blueprint, and the current brief inputs. The backend MUST own this composition and MUST NOT trust the client to send final prompt text.

#### Scenario: Server-side prompt assembly
- **WHEN** a valid script generation request is received
- **THEN** the backend loads the IP profile, loads the selected template blueprint, merges in the brief inputs, and builds the final prompt on the server before calling the LLM

### Requirement: Generation runs and script candidates are persisted
Each script generation request SHALL create a persistent generation run and persistent candidate scripts. Every candidate script MUST record its source template, source IP profile, and generation batch linkage.

#### Scenario: Persisted generation batch
- **WHEN** a generation request succeeds
- **THEN** the system creates one `ContentGenerationRun` record and multiple `Script` records with `status="candidate"`, each linked to the selected template and active IP profile

### Requirement: Candidate scripts can be edited and selected
The system SHALL allow the user to edit a candidate script and mark a single script as the selected script for downstream video generation.

#### Scenario: User edits a generated script
- **WHEN** the user updates a candidate through `PATCH /api/scripts/[id]`
- **THEN** the system saves the edited content to that script record instead of keeping the edit only in client memory

#### Scenario: User selects one candidate for video generation
- **WHEN** the user marks a script as selected
- **THEN** the system updates that script to `status="selected"` and ensures the create flow can use that saved script for the later video task
