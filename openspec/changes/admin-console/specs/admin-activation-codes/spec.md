## ADDED Requirements

### Requirement: Admin can batch generate activation codes
The system SHALL allow admins with `admin` role to generate a batch of activation codes. Each code SHALL be 12 alphanumeric characters (uppercase letters + digits, excluding ambiguous characters 0, O, 1, I, L). The admin SHALL specify the quantity to generate (1-500 per batch). Each batch SHALL be assigned a unique batchId for grouping.

#### Scenario: Generate a batch of codes
- **WHEN** admin specifies quantity (e.g., 50) and clicks "Generate"
- **THEN** system creates 50 unique activation codes and displays them in the list with status "unused"

#### Scenario: Generate with note
- **WHEN** admin specifies quantity and an optional batch note (e.g., "March campaign")
- **THEN** system creates the codes and associates the note with the batchId for reference

#### Scenario: Exceeds maximum batch size
- **WHEN** admin attempts to generate more than 500 codes at once
- **THEN** system rejects the request with error "Maximum 500 codes per batch"

### Requirement: Activation codes are immutable after creation
The system SHALL NOT provide any mechanism to delete activation codes. Once created, a code can only transition from "unused" to "used" status. No API endpoint for deletion SHALL exist.

#### Scenario: No delete action available
- **WHEN** admin views the activation code list
- **THEN** no delete button or action is available for any code

#### Scenario: API rejects delete attempts
- **WHEN** any client sends a DELETE request to the activation codes API
- **THEN** system returns 405 Method Not Allowed

### Requirement: Admin can view activation code list
The system SHALL display a paginated list of all activation codes. Each row SHALL show: code (formatted as XXXX-XXXX-XXXX), status (unused/used), batch note, used by (user email), used at (datetime), and created at (datetime). The list SHALL support filtering by status and by batchId.

#### Scenario: View all codes
- **WHEN** admin navigates to the Activation Codes page
- **THEN** system displays a table of all codes sorted by creation date (newest first)

#### Scenario: Filter by status
- **WHEN** admin selects "Unused" filter
- **THEN** system shows only codes with status "unused"

#### Scenario: Filter by batch
- **WHEN** admin selects a specific batch from the batch dropdown
- **THEN** system shows only codes from that batch

### Requirement: Admin can export activation codes to CSV
The system SHALL allow admins to export activation codes to a CSV file. The export SHALL include all visible codes (respecting current filters). CSV columns SHALL be: Code, Status, Batch Note, Used By (email), Used At, Created At.

#### Scenario: Export all codes
- **WHEN** admin clicks "Export CSV" with no filters applied
- **THEN** browser downloads a CSV file containing all activation codes

#### Scenario: Export filtered codes
- **WHEN** admin clicks "Export CSV" with status filter "used"
- **THEN** browser downloads a CSV file containing only used activation codes

### Requirement: Activation code list shows summary statistics
The system SHALL display summary statistics above the code list: total codes, unused codes, used codes, and usage rate percentage.

#### Scenario: View code statistics
- **WHEN** admin navigates to the Activation Codes page
- **THEN** system displays stat cards showing total, unused, used counts and usage rate
