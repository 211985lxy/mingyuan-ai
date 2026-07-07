## ADDED Requirements

### Requirement: Packaging template recommendation is score-based and explainable
The system SHALL score packaging templates against the selected structure, selected script, and template capability metadata. Recommendation output MUST classify templates as `recommended`, `acceptable`, or `weak-fit`, and MUST expose human-readable reasons for that classification.

#### Scenario: Packaging step shows ranked template recommendations
- **WHEN** the user enters the packaging step after selecting a script
- **THEN** the system returns a ranked packaging template list with recommendation states and concise reason text instead of presenting every template as an undifferentiated flat list

#### Scenario: User inspects recommendation rationale
- **WHEN** the user inspects a recommended or weak-fit template
- **THEN** the UI can explain which structure or script signals improved or reduced that template's fit

### Requirement: Recommendation outputs compatible parameter presets
The system SHALL derive compatible default `packRules` and `processRules` presets from the selected structure and selected packaging template, limited to fields that the current upstream providers can truly support.

#### Scenario: Recommended template receives structure-aware presets
- **WHEN** the user accepts a recommended packaging template
- **THEN** the system pre-fills supported subtitle, title, evidence-emphasis, and other compatible packaging parameters based on the selected structure and template capabilities

#### Scenario: Unsupported automatic BGM is not fabricated as a preset
- **WHEN** the current create flow has no real BGM provider integration
- **THEN** recommendation output may include BGM style guidance text but MUST NOT auto-apply a soundtrack or fabricate automatic BGM control fields as if that capability existed

### Requirement: Template choice is only hard-blocked on real capability mismatch
The system MUST NOT hard-filter templates by default just because their fit score is lower. A template may only be blocked when it lacks a required technical capability or falls outside the supported create-domain video types.

#### Scenario: Weak-fit template remains selectable
- **WHEN** a template is technically compatible but not the best match for the selected structure or script
- **THEN** the system keeps the template selectable, marks it as weak-fit, and explains the tradeoff instead of removing it from the list

#### Scenario: True mismatch blocks selection
- **WHEN** a template lacks a required capability for the chosen structure or belongs to an out-of-domain video type
- **THEN** the system blocks selection and explains the missing capability or unsupported domain honestly
