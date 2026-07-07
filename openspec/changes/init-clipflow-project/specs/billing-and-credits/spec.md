## ADDED Requirements

### Requirement: Credits preflight validation
The system SHALL check that a user has enough available credits before accepting a video generation request.

#### Scenario: User lacks sufficient credits
- **WHEN** a user attempts to create a video task with available credits below the estimated requirement
- **THEN** the system rejects task creation and prompts the user to upgrade or add credits

### Requirement: Success-based credit settlement
The system SHALL calculate and persist `credits_cost` for each completed video task and SHALL deduct credits only after successful generation.

#### Scenario: Video generation succeeds
- **WHEN** a video task finishes successfully
- **THEN** the system records the settled `credits_cost` on the task and decrements the user's remaining credits exactly once

### Requirement: Failed tasks are not billed
The system SHALL NOT deduct credits for failed or abandoned video generation attempts.

#### Scenario: Video generation fails
- **WHEN** a video task reaches `failed`
- **THEN** the task records the failure reason and the user's credit balance remains unchanged
