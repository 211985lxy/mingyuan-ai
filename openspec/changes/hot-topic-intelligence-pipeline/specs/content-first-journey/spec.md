## MODIFIED Requirements

### Requirement: Create flow enforces content-first order
The `/create` experience SHALL follow this sequence: select content template, fill brief and generate scripts, choose or edit one script, choose a digital human, then confirm and submit video generation. The user MUST NOT be asked to choose a digital human before a script has been selected.

#### Scenario: Normal content-first progression
- **WHEN** the user enters `/create` with a complete IP profile
- **THEN** the flow starts from template selection and does not show avatar selection as the first step

#### Scenario: Avatar step requires selected script
- **WHEN** the user has not yet selected a saved script
- **THEN** the avatar step remains unavailable and the user is kept in the script-generation portion of the flow

#### Scenario: Hot topic requires insight before trusted guidance is shown
- **WHEN** the user selects a hot topic in the script-generation portion of the flow
- **THEN** the UI loads and displays topic insight and fit guidance before presenting the system as having understood the topic

### Requirement: Step-specific expert guidance remains part of the workflow
The content-first journey SHALL preserve the product's “marketing expert guiding the user” experience by showing contextual guidance at each stage of onboarding and creation.

#### Scenario: Profile page explains why the profile matters
- **WHEN** the user is filling the IP profile
- **THEN** the UI explains that the saved profile will shape later AI script generation

#### Scenario: Template step explains why template choice matters
- **WHEN** the user is selecting a content template
- **THEN** the UI explains what kind of opening structure or conversion goal the template is designed to serve

#### Scenario: Hot topic step explains fit and caution
- **WHEN** the user has selected a hot topic
- **THEN** the UI explains what the event is about, why it is trending, how it can relate to the current marketing goal, and when the user should avoid forcing the topic into the script
