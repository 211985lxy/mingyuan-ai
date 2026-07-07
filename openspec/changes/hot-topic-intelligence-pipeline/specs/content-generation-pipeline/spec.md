## MODIFIED Requirements

### Requirement: Template-guided script generation
The system SHALL generate scripts from published content templates, not from freeform mock helpers. Script generation SHALL accept a selected template, structured brief inputs, and optional structured hot-topic context.

#### Scenario: Generate scripts from a selected template
- **WHEN** an authenticated user calls `POST /api/scripts/generate` with `{ templateId, structureId, inputs }`
- **THEN** the system validates the published template, validates required brief fields, generates script candidates through the server-side pipeline, and returns persisted candidates

#### Scenario: Generate scripts with hot-topic context
- **WHEN** an authenticated user calls `POST /api/scripts/generate` with `{ templateId, structureId, inputs, hotTopicId }`
- **THEN** the system loads the persisted topic insight and evaluates the topic fit for the current creation context before generating script candidates tied to the same generation run

#### Scenario: Hot topic parameter is omitted
- **WHEN** a user submits a script generation request without a hot topic
- **THEN** the system generates scripts identically to the baseline behavior without hot topic integration

### Requirement: Prompt composition uses profile, template, and brief together
The system SHALL compose LLM prompts from three required layers: the user's IP profile snapshot, the selected content template blueprint, and the current brief inputs. The backend MUST own this composition and MUST NOT trust the client to send final prompt text.

#### Scenario: Server-side prompt assembly
- **WHEN** a valid script generation request is received
- **THEN** the backend loads the IP profile, loads the selected template blueprint, merges in the brief inputs, and builds the final prompt on the server before calling the LLM

#### Scenario: Prompt assembly includes structured hot-topic guidance
- **WHEN** a valid request includes a selected hot topic
- **THEN** the backend uses structured topic insight and topic-fit guidance in prompt composition instead of injecting only the hot-topic title

### Requirement: Generation runs and script candidates are persisted
Each script generation request SHALL create a persistent generation run and persistent candidate scripts. Every candidate script MUST record its source template, source IP profile, and generation batch linkage.

#### Scenario: Persisted generation batch
- **WHEN** a generation request succeeds
- **THEN** the system creates one `ContentGenerationRun` record and multiple `Script` records with `status="candidate"`, each linked to the selected template and active IP profile

#### Scenario: Generation run stores topic insight and fit snapshot
- **WHEN** the generation request includes a selected hot topic
- **THEN** the `ContentGenerationRun` record persists the exact topic insight snapshot and topic-fit evaluation used during prompt assembly

### Requirement: Hot-topic-assisted generation MUST avoid forced hard association
The system SHALL avoid blindly forcing topic-title references into the generated scripts when fit is weak or unsafe.

#### Scenario: Topic fit is weak
- **WHEN** the evaluated topic fit is caution or avoid
- **THEN** the generation pipeline downgrades to soft-association guidance and MUST NOT require the script generator to force the hot-topic title into the final scripts
