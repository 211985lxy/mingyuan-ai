## MODIFIED Requirements

### Requirement: Template-guided script generation
The system SHALL generate scripts from a selected video structure and a published content template, not from freeform mock helpers. Script generation SHALL accept a selected structure, a selected template, structured brief inputs, and optional hot-topic context.

#### Scenario: Generate scripts from a selected structure and template
- **WHEN** an authenticated user calls `POST /api/scripts/generate` with `{ structureId, templateId, inputs }`
- **THEN** the system validates the selected structure, validates the published template, validates required brief fields, generates script candidates through the server-side pipeline, and returns persisted candidates

#### Scenario: Generate scripts with hot-topic context
- **WHEN** an authenticated user calls `POST /api/scripts/generate` with `{ structureId, templateId, inputs, hotTopic }`
- **THEN** the system incorporates both the selected structure and the hot-topic context into the prompt composition and returns persisted candidates tied to the same generation run

#### Scenario: Missing structure blocks generation
- **WHEN** a script generation request omits `structureId`
- **THEN** the system returns 400 and instructs the client to select a video structure before generating scripts

### Requirement: Prompt composition uses profile, template, and brief together
The system SHALL compose LLM prompts from four required layers: the user's IP profile snapshot, the selected video structure blueprint, the selected content template blueprint, and the current brief inputs. The backend MUST own this composition and MUST NOT trust the client to send final prompt text.

#### Scenario: Server-side prompt assembly
- **WHEN** a valid script generation request is received
- **THEN** the backend loads the IP profile, loads the selected structure blueprint, loads the selected content template blueprint, merges in the brief inputs, and builds the final prompt on the server before calling the LLM

### Requirement: Generation runs and script candidates are persisted
Each script generation request SHALL create a persistent generation run and persistent candidate scripts. Every candidate script MUST record its source structure, source template, source IP profile, generation batch linkage, and any evaluation metadata needed for downstream selection.

#### Scenario: Persisted generation batch
- **WHEN** a generation request succeeds
- **THEN** the system creates one `ContentGenerationRun` record and multiple `Script` records with `status="candidate"`, each linked to the selected structure, selected template, and active IP profile

#### Scenario: Candidate metadata preserves generation lineage
- **WHEN** the system persists generated script candidates
- **THEN** each candidate stores enough lineage to trace the script back to the exact structure, template, and generation run that produced it

### Requirement: Candidate scripts can be edited and selected
The system SHALL allow the user to edit a candidate script and mark a single script as the selected script for downstream packaging and video generation.

#### Scenario: User edits a generated script
- **WHEN** the user updates a candidate through `PATCH /api/scripts/[id]`
- **THEN** the system saves the edited content to that script record instead of keeping the edit only in client memory

#### Scenario: User selects one candidate for packaging and video generation
- **WHEN** the user marks a script as selected
- **THEN** the system updates that script to `status="selected"` and ensures the create flow can use that saved script for the later packaging and video task

## ADDED Requirements

### Requirement: Candidate quality floor is enforced before normal success
The system SHALL enforce a quality floor for generated candidate scripts before presenting them as normal success. Candidate scripts MUST be complete enough for short-form marketing video production, and the system SHALL score and rank them on structural compliance, viewpoint clarity, evidence strength, CTA clarity, and fit to the user's IP voice.

#### Scenario: Weak one-line output is not treated as a successful candidate set
- **WHEN** the underlying generation pipeline produces incomplete or obviously under-length candidate text
- **THEN** the system retries, filters, or marks the run as degraded instead of presenting that one-line output as normal success

#### Scenario: User receives differentiated scored candidates
- **WHEN** the system returns candidate scripts to the create flow
- **THEN** the response includes multiple differentiated candidates with enough quality metadata for the UI to explain why each script is a viable option
