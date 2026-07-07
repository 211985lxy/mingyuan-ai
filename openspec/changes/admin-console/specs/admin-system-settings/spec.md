## ADDED Requirements

### Requirement: Admin can view system settings
The system SHALL display all system settings grouped by category. Each setting SHALL show: key name, current value, type, description, and last updated timestamp. Categories SHALL include: general, plans, features, limits.

#### Scenario: View settings page
- **WHEN** admin navigates to the Settings page
- **THEN** system displays all settings grouped by category with their current values

#### Scenario: Empty category
- **WHEN** a category has no settings configured
- **THEN** system displays "No settings in this category" with an option to add one

### Requirement: Admin can edit system settings
The system SHALL allow admins with `admin` role to edit setting values. The input control SHALL match the setting type: text input for strings, number input for numbers, toggle for booleans, JSON editor for json type. Changes SHALL be saved immediately on confirmation.

#### Scenario: Edit a string setting
- **WHEN** admin clicks edit on a string-type setting, modifies the value, and confirms
- **THEN** system saves the new value and displays a success notification

#### Scenario: Edit a boolean setting
- **WHEN** admin toggles a boolean-type setting
- **THEN** system saves the new value immediately

#### Scenario: Invalid value
- **WHEN** admin enters a non-numeric value for a number-type setting
- **THEN** system shows a validation error and does not save

### Requirement: Admin can add new settings
The system SHALL allow admins to create new settings by specifying: key (unique, kebab-case), value, type (string/number/boolean/json), category, and description.

#### Scenario: Add new setting
- **WHEN** admin fills in the new setting form and submits
- **THEN** system creates the setting and displays it in the appropriate category

#### Scenario: Duplicate key
- **WHEN** admin attempts to create a setting with an existing key
- **THEN** system shows error "Setting with this key already exists"

### Requirement: Settings changes are auditable
The system SHALL record which admin last modified each setting via the `updatedBy` field.

#### Scenario: Track last editor
- **WHEN** admin edits a setting value
- **THEN** system updates the `updatedBy` field with the admin's ID and `updatedAt` with current timestamp
