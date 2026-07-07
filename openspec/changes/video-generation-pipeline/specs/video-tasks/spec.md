## ADDED Requirements

### Requirement: Create video task with type routing
The system SHALL accept video task creation via POST /api/tasks with a `type` field that routes to the corresponding Shanjian API. Supported types: `virtualman_broadcast`, `realman_broadcast`, `broadcast_mixcut`, `news_mixcut`, `virtualman_video`, `custom_virtualman_broadcast`, `custom_realman_broadcast`, `custom_broadcast_mixcut`, `ai_cover`. The system MUST perform credits pre-check and concurrency check before submitting.

#### Scenario: Virtualman broadcast task
- **WHEN** POST /api/tasks with `{ type: "virtualman_broadcast", avatarId, scriptContent, ... }`
- **THEN** validates avatar is ready, estimates credits, checks balance, checks concurrency, calls generateVirtualmanBroadcast, creates VideoTask record, returns `{ data: task }` with status 201

#### Scenario: AI cover task
- **WHEN** POST /api/tasks with `{ type: "ai_cover", imageUrl, templateId, coverMainTitle }`
- **THEN** calls generateAICover, creates VideoTask record (videoType="ai_cover"), returns `{ data: task }` with status 201

#### Scenario: Insufficient credits
- **WHEN** user's credits < estimated cost
- **THEN** returns 402 with `{ error: "Insufficient credits" }`

#### Scenario: Concurrent limit exceeded
- **WHEN** user has >= plan limit processing tasks (free=1, basic=3, pro=5)
- **THEN** returns 429 with `{ error: "Concurrent task limit reached" }`

#### Scenario: Avatar not ready
- **WHEN** task references an avatar with status != "ready"
- **THEN** returns 422 with `{ error: "Avatar is not ready" }`

#### Scenario: Invalid type
- **WHEN** POST /api/tasks with unknown type
- **THEN** returns 400 with `{ error: "Invalid video type" }`

### Requirement: Script record creation
The system SHALL create a Script record when a video task is submitted with scriptContent. The Script record MUST be linked to the VideoTask via scriptId, and include sourceTemplateId if the script was generated from a template.

#### Scenario: Task with script content
- **WHEN** creating task with scriptContent and optional sourceTemplateId
- **THEN** creates Script record, sets VideoTask.scriptId to the new Script.id

### Requirement: List video tasks
The system SHALL return the authenticated user's video tasks, paginated, ordered by createdAt desc. MUST support filtering by status.

#### Scenario: List tasks with pagination
- **WHEN** GET /api/tasks?page=1&pageSize=10
- **THEN** returns `{ data: { results: VideoTask[], total, page, pageSize } }`

#### Scenario: Filter by status
- **WHEN** GET /api/tasks?status=completed
- **THEN** returns only completed tasks

### Requirement: Get task detail
The system SHALL return a single video task by ID, only if owned by the authenticated user.

#### Scenario: Own task detail
- **WHEN** GET /api/tasks/[id] where task belongs to user
- **THEN** returns `{ data: task }` including videoUrl, coverUrl, duration if completed

#### Scenario: Other user's task
- **WHEN** GET /api/tasks/[id] where task belongs to another user
- **THEN** returns 404

### Requirement: Credits calculation
The system SHALL calculate credits cost based on video type and duration: `ceil(durationSeconds / 60 * ratePerMinute)`. Rates: virtualman_broadcast=70, realman_broadcast=10, broadcast_mixcut=10, news_mixcut=4, virtualman_video=50, ai_cover=flat 5. Pre-submission estimation uses text length / 300 chars per minute. Clone costs: professional=500 (flat), fast=0, image=0.

#### Scenario: Credits estimation for virtualman_broadcast
- **WHEN** submitting 600 chars of virtualman_broadcast
- **THEN** estimated cost = ceil(2 * 70) = 140 credits

#### Scenario: Actual settlement after completion
- **WHEN** video completes with duration=90s, type=virtualman_broadcast
- **THEN** actual cost = ceil(1.5 * 70) = 105 credits; difference refunded to user

#### Scenario: AI cover flat cost
- **WHEN** submitting ai_cover task
- **THEN** estimated cost = 5 credits (flat)
