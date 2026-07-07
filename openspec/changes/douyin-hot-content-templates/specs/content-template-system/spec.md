## ADDED Requirements

### Requirement: Template data model with variable slots
The system SHALL persist content templates with a script framework containing named variable slots using `{{variableName}}` syntax, a list of variable definitions, and metadata for industry, content type, hook type, and video style binding.

#### Scenario: Template with variables is created
- **WHEN** an admin creates a template with script text containing `{{brand}}` and `{{painPoint}}` slots and corresponding variable definitions
- **THEN** the system stores the template with the script framework, variable definitions (key, label, placeholder, required flag, input type), and all classification metadata

### Requirement: Template variable rendering
The system SHALL render a complete script by replacing all `{{variableName}}` placeholders in the template script with user-provided values.

#### Scenario: User fills all required variables
- **WHEN** a user submits values for all required variables defined in a published template
- **THEN** the system returns the fully rendered script text with all placeholders replaced by the corresponding user values

#### Scenario: User omits optional variables
- **WHEN** a user submits values for required variables but omits optional ones
- **THEN** the system renders the script with filled variables replaced and unfilled optional placeholders left as-is or removed gracefully

### Requirement: Template browsing and filtering
The system SHALL allow authenticated users to browse published templates filtered by industry, content type, featured status, and keyword search.

#### Scenario: User filters templates by industry
- **WHEN** an authenticated user requests templates with industry filter set to "房产"
- **THEN** the system returns only published templates that include "房产" in their industry tags, ordered by sort weight descending

#### Scenario: User views template detail
- **WHEN** an authenticated user requests a specific published template by ID
- **THEN** the system returns the template with its display name, description, script framework, variable definitions, industry tags, content type, and hook type

### Requirement: Template classification taxonomy
The system SHALL support multi-dimensional template classification covering industry verticals, content types, and opening hook types.

#### Scenario: Template is tagged with multiple industries
- **WHEN** an admin creates a template applicable to both "房产" and "教育" industries
- **THEN** the template appears in filtered results for either industry

#### Scenario: Template uses a specific hook type
- **WHEN** an admin assigns hook type "pain" (痛点直击) to a template
- **THEN** the template is filterable by hook type and displays the hook type label to users

### Requirement: Hot topic to template matching via dedicated keywords
The system SHALL match published templates to current hot topics using a dedicated `hotTopicKeywords` field (separate from display tags) and seasonal event declarations with explicit date ranges.

#### Scenario: Hot topic matches template keywords
- **WHEN** the current hot list contains a topic whose word includes a keyword from a template's hotTopicKeywords array
- **THEN** the system recommends that template as relevant to the hot topic

#### Scenario: Seasonal event template surfacing with date range
- **WHEN** the current date falls within a template's seasonal event date range (e.g., seasonalEvents: [{ id: "618", startDate: "06-01", endDate: "06-18" }])
- **THEN** the system surfaces that template in recommendations regardless of current hot topic keywords

#### Scenario: No keyword overlap exists
- **WHEN** no published template's hotTopicKeywords match any current hot topic word
- **THEN** the hot topics API returns topics without template recommendations, and the AI script integration (LLM prompt) remains the primary mechanism for hot topic utilization

### Requirement: Video style binding
The system SHALL allow templates to optionally bind a Shanjian video template ID (styleId), video generation type, and preset packaging/processing rules.

#### Scenario: User generates video from a style-bound template
- **WHEN** a user selects a content template that has a bound shanjianStyleId and preset packRules
- **THEN** the video generation request uses the template's bound styleId and preset packaging rules as defaults
