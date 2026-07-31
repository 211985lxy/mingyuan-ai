# Purpose

Define a server-owned batch script replication capability that extracts reusable structure templates from multiple viral reference scripts and generates new scripts in batches by combining templates with project knowledge.

## Requirements

### Requirement: Batch input of reference scripts

The system SHALL accept multiple reference scripts in a single request. The client MUST allow the user to input scripts as multi-line text (one script per line, or multiple scripts separated by blank lines).

#### Scenario: Valid batch input

- **WHEN** the user submits 1 to N reference scripts (N ≤ max batch size)
- **THEN** the server accepts the input and starts extraction

#### Scenario: Empty input rejected

- **WHEN** the user submits empty or whitespace-only content
- **THEN** the server rejects with a clear error message

#### Scenario: Oversized batch rejected

- **WHEN** the user submits more than N scripts in a single request
- **THEN** the server rejects with a message indicating the maximum batch size

### Requirement: Structure template extraction

The system SHALL analyze the batch of reference scripts and extract a reusable structure template that identifies ordered segments (e.g., opening hook, core content, product introduction, call-to-action) and the purpose of each segment.

#### Scenario: Successful extraction

- **WHEN** the LLM returns a valid JSON structure
- **THEN** the system parses it into a structured template with ordered segments

#### Scenario: LLM returns malformed JSON

- **WHEN** the LLM response cannot be parsed as JSON
- **THEN** the system retries once, then fails with a clear error

### Requirement: Structure template persistence

Each extracted template SHALL be persisted with the following metadata: display name, description, ordered segments, source scripts count, source script text snapshot, owner user ID, and optional project ID.

#### Scenario: Template saved

- **WHEN** extraction succeeds
- **THEN** the template is saved to the database and a stable ID is returned

#### Scenario: User-scoped access

- **WHEN** a user requests a template
- **THEN** the system returns only templates owned by that user (or shared within their project)

### Requirement: Knowledge-base-aware batch generation

The system SHALL generate new scripts in batches by combining a structure template with project knowledge context (IP persona, product selling points, brand tone) retrieved via the existing knowledge context builder.

#### Scenario: Generation with knowledge context

- **WHEN** the user requests N scripts from a template with a selected project
- **THEN** the system loads authorized knowledge context and injects it into the generation prompt

#### Scenario: Generation without project

- **WHEN** the user requests generation without a selected project
- **THEN** the system rejects with a message explaining that project context is required

### Requirement: Quantity parameter controls batch size

The generation request SHALL accept a `count` parameter that controls how many scripts are produced in a single call. The system MUST clamp the count to a safe range (1 to max).

#### Scenario: Count within range

- **WHEN** the user requests 5 scripts and max is 10
- **THEN** the system generates exactly 5 scripts

#### Scenario: Count exceeds max

- **WHEN** the user requests 20 scripts and max is 10
- **THEN** the system clamps to 10 and proceeds

### Requirement: Two-phase execution with optional one-click pipeline

The system SHALL support both separate execution of the two phases (extract, generate) and a one-click pipeline that executes both phases sequentially in a single request.

#### Scenario: Separate extraction

- **WHEN** the user invokes the extract endpoint
- **THEN** only the structure template is created and returned

#### Scenario: Separate generation

- **WHEN** the user invokes the generate endpoint with an existing template ID
- **THEN** only the generation phase runs

#### Scenario: One-click pipeline

- **WHEN** the user invokes the pipeline endpoint with reference scripts and a count
- **THEN** the system extracts the structure and immediately generates the requested number of scripts

### Requirement: Generated scripts are persisted

Each generated script SHALL be persisted with a reference to the template used, the generation parameters, and the owner. The user SHALL be able to retrieve and manage generated scripts from the draft inbox.

#### Scenario: Scripts saved to draft

- **WHEN** generation completes
- **THEN** all N scripts are persisted and a success response lists them

### Requirement: Structural consistency with originality

Generated scripts MUST follow the segment order of the source template while varying expression. The system SHALL use a higher temperature for generation than for extraction to encourage diversity.

#### Scenario: Structure preserved

- **WHEN** the template has segments [hook, core, product, cta]
- **THEN** each generated script contains those segments in that order

### Requirement: Universality and extensibility of templates

Extracted templates SHALL use generic segment type names (not script-specific wording) so they can be reused across different topics and products within the same project.

#### Scenario: Generic segment types

- **WHEN** the template is extracted from baby-feeding scripts
- **THEN** the segment types are generic (e.g., "hook", "core_content", "product_intro", "cta") rather than topic-specific
