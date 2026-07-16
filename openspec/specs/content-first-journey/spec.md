# Purpose

Define the default AIM journey as one continuous content workflow while preserving expert deep links.

## Requirements

### Requirement: AIM exposes four user stages

The default AIM page SHALL present `定方向`, `做内容`, `去发布`, and `看结果` as the primary workflow. Internal agents, routes, knowledge strategies, and model selection SHALL remain implementation details.

#### Scenario: User enters AIM without a deep link

- **WHEN** an authenticated user opens `/aim`
- **THEN** the page offers the four workflow stages and project-relevant recent work

#### Scenario: Expert deep link remains compatible

- **WHEN** a user opens a supported `/aim?agent=...` deep link
- **THEN** the requested expert capability remains available without forcing the default stage selector

### Requirement: Direction hands off through an editable brief

Cross-stage handoff from `定方向` to `做内容` SHALL use a user-reviewable task brief stored with the generation context. Facts inherited from project or knowledge sources MUST be authorization-checked by the server.

#### Scenario: User confirms a direction brief

- **WHEN** the user reviews and confirms the brief
- **THEN** the confirmed snapshot becomes the content-generation constraint set

#### Scenario: Direct writing does not require a brief

- **WHEN** the user requests low-risk direct copy or a scoped edit
- **THEN** the user can enter `做内容` without completing a direction brief

### Requirement: Content versions move into publishing and review

The selected content version SHALL be the handoff object for pre-publish checks, publication recording, and outcome review.

#### Scenario: Scoped edit preserves unselected content

- **WHEN** the user requests a title, opening, ending, or selection-only edit
- **THEN** content outside the selected scope remains unchanged

#### Scenario: Published content enters review

- **WHEN** a content version is recorded as published
- **THEN** the user can review outcomes and persist evidence-backed preferences for the next cycle
