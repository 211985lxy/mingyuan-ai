## ADDED Requirements

### Requirement: Home dashboard summary
The home page SHALL provide a primary create-video entry point, remaining credits visibility, and a recent videos summary.

#### Scenario: User lands on the dashboard home page
- **WHEN** a signed-in user opens the home dashboard
- **THEN** the page highlights the create-video action and displays current credits plus the user's recent video tasks

### Requirement: Video library listing
The my-videos page SHALL list the user's video tasks with statuses including `completed`, `processing`, and `failed`.

#### Scenario: User opens the video library
- **WHEN** a signed-in user navigates to my videos
- **THEN** the page shows the user's generated video tasks and their latest task status

### Requirement: Stable completed-video access
Completed videos SHALL remain previewable and downloadable from the product's managed storage instead of depending on an expiring vendor URL.

#### Scenario: User revisits an older completed video
- **WHEN** a user opens a previously completed video from the home page or my-videos page
- **THEN** the product can still preview or download the video using the system-managed canonical URL
