## ADDED Requirements

### Requirement: Expression templates are generic message blueprints
The system SHALL present stage-2 content templates as generic expression blueprints rather than industry-first starter cards. Expression templates MUST describe reusable persuasion logic such as tutorial, testimonial, comparison, listicle, objection handling, or behind-the-scenes, and MUST NOT require a separate card per industry when the underlying message logic is the same.

#### Scenario: Same expression template is reusable across industries
- **WHEN** two users from different industries select the same expression template
- **THEN** the system reuses the same template blueprint and varies the generated script through brief inputs, IP profile, and offer facts rather than switching to separate industry-specific template identities

#### Scenario: Stage 2 explains message logic instead of industry identity
- **WHEN** the user browses expression templates in `/create`
- **THEN** each card explains the persuasion logic, proof burden, and typical use goal of the template instead of leading with one industry label

#### Scenario: Industry identity is sourced from IP layer
- **WHEN** the system needs to know what business domain or industry the current user belongs to
- **THEN** it reads that identity from the active IP profile instead of encoding it into the structure catalog or expression template catalog

### Requirement: Expression templates expose reusable brief schema
The system SHALL persist each expression template with a reusable brief schema and persuasion metadata sufficient for server-side generation. At minimum, a template MUST define its renderable script blueprint, brief field definitions, argument pattern, evidence mode, CTA style, and any hot-topic fit modes or recommended structures needed by the workflow.

#### Scenario: Template declares required brief fields
- **WHEN** the frontend loads a template detail
- **THEN** it receives the template's required and optional brief fields and renders the input form from that schema instead of hard-coding an industry form

#### Scenario: Template metadata supports downstream guidance
- **WHEN** the selected expression template is used in generation
- **THEN** the system can derive what kind of proof is expected, what CTA style fits, and what structural pairings are preferred from the template metadata itself
