## MODIFIED Requirements

### Requirement: Template-guided script generation
The system SHALL generate scripts from a selected generic video structure and a published generic expression template, not from freeform mock helpers, industry-locked structure labels, or industry-locked content cards. Script generation SHALL accept a selected structure, a selected template, structured brief inputs, and optional hot-topic context.

#### Scenario: Generate scripts from a selected structure and template
- **WHEN** an authenticated user calls `POST /api/scripts/generate` with `{ structureId, templateId, inputs }`
- **THEN** the system validates the selected published structure, validates the selected published template, validates required brief fields, generates script candidates through the server-side pipeline, and returns persisted candidates

#### Scenario: Missing structure blocks generation
- **WHEN** a script generation request omits `structureId`
- **THEN** the system returns 400 and instructs the client to select a video structure before generating scripts

#### Scenario: Industry identity comes from IP, not template taxonomy
- **WHEN** a user generates scripts for different industries using the same expression template
- **THEN** the backend treats the template as a reusable expression blueprint, derives industry identity from the active IP profile, and derives only per-video facts from the submitted brief inputs rather than requiring separate industry-specific template cards

### Requirement: Prompt composition uses profile, structure, template, and brief together
The system SHALL compose LLM prompts from four required layers: the user's IP profile snapshot, the selected video structure blueprint, the selected generic expression template blueprint, and the current brief inputs. The backend MUST own this composition and MUST NOT trust the client to send final prompt text.

#### Scenario: Server-side prompt assembly uses structure blueprint fields
- **WHEN** a valid script generation request is received
- **THEN** the backend loads the selected structure blueprint, including its opening pattern, narrative beats, pace, evidence density, and CTA style, and merges those fields with the selected template and brief before calling the LLM

#### Scenario: Server-side prompt assembly uses expression blueprint fields
- **WHEN** a valid script generation request is received
- **THEN** the backend loads the selected expression blueprint, including its argument pattern, evidence mode, CTA style, and required brief slots, and merges those fields with the selected structure and brief before calling the LLM

### Requirement: Generation runs and script candidates are persisted
Each script generation request SHALL create a persistent generation run and persistent candidate scripts. Every candidate script MUST record its source structure, source template, source IP profile, generation batch linkage, and enough structure lineage to reproduce or audit the script later.

#### Scenario: Persisted generation batch keeps structure lineage
- **WHEN** a generation request succeeds
- **THEN** the system creates one `ContentGenerationRun` record and multiple `Script` records, each linked to the selected structure, selected template, and active IP profile, and each run stores the effective structure snapshot used for generation

## ADDED Requirements

### Requirement: Candidate quality floor is enforced before normal success
The system SHALL enforce a quality floor for generated candidate scripts before presenting them as normal success. Candidate scripts MUST be complete enough for short-form marketing video production, and the system SHALL score and rank them on structural compliance, viewpoint clarity, evidence strength, CTA clarity, and fit to the user's IP voice.

#### Scenario: Weak under-structured output is not treated as normal success
- **WHEN** the underlying generation pipeline produces incomplete, obviously under-length, or structurally weak candidate text
- **THEN** the system retries, filters, or marks the run as degraded instead of presenting that output as a normal successful candidate set

#### Scenario: Differentiated candidates preserve scoring metadata
- **WHEN** the system returns candidate scripts to the create flow
- **THEN** the response includes multiple differentiated candidates with enough quality metadata for the UI to explain why each script is viable and how it fits the selected structure
