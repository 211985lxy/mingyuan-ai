## MODIFIED Requirements

### Requirement: AI script generation
The system SHALL generate exactly three candidate marketing scripts from the user's industry, selling points, and city inputs, and SHALL incorporate an optional hot topic parameter into the LLM prompt so that at least one generated script naturally references the trending topic when provided.

#### Scenario: User requests AI-generated scripts
- **WHEN** a user submits industry, selling points, and city to the script generator
- **THEN** the system returns three distinct candidate scripts for selection in the create-video flow

#### Scenario: User requests scripts with a hot topic
- **WHEN** a user submits industry, selling points, city, and a selected hot topic to the script generator
- **THEN** the system returns three candidate scripts where at least one naturally incorporates the hot topic into the marketing narrative

#### Scenario: Hot topic parameter is omitted
- **WHEN** a user submits a script generation request without a hot topic
- **THEN** the system generates scripts identically to the baseline behavior without hot topic integration

## ADDED Requirements

### Requirement: Template-based script generation
The system SHALL support a second script creation path where users select a published content template, fill in the declared variable values, and receive a rendered script without invoking the LLM.

#### Scenario: User generates script from a content template
- **WHEN** a user selects a published content template and submits values for all required variables
- **THEN** the system renders the template by replacing variable placeholders with the submitted values and returns the completed script text

#### Scenario: User saves a template-rendered script
- **WHEN** a user receives a template-rendered script and chooses to save it
- **THEN** the system persists the rendered script as a user-owned script available for editing and reuse in the create-video flow

### Requirement: Script creation flow supports both AI and template paths
The create-video experience SHALL offer users a choice between AI-generated scripts and template-based scripts as two distinct entry points in step 1 of the creation flow.

#### Scenario: User chooses template path in creation flow
- **WHEN** a user enters the create-video flow and selects the template path
- **THEN** the system presents the template browsing and variable input experience instead of the AI generation form
