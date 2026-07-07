## ADDED Requirements

### Requirement: Unified request layer
The system SHALL provide a typed `request<T>(method, path, options)` function in `lib/shanjian.ts` that handles Authorization header, JSON serialization, response parsing, and error code mapping. All Shanjian errors MUST be mapped to ClipFlow business error codes per the ERROR_MAP in the backend service spec.

#### Scenario: Successful API call
- **WHEN** Shanjian returns `{ code: "Succeed", data: T }`
- **THEN** function returns `T`

#### Scenario: Known error code
- **WHEN** Shanjian returns `{ code: "Concurrency.Limit" }`
- **THEN** function throws ShanjianError with code "CONCURRENCY_EXCEEDED"

#### Scenario: APP_KEY not configured
- **WHEN** `SHANJIAN_APP_KEY` is empty
- **THEN** function throws with code "SHANJIAN_NOT_CONFIGURED"

### Requirement: Asset query methods
The system SHALL implement: `getPublicVoices()`, `getPublicVirtualmen()`, `getTemplates(scene)`, `getTemplateDetail(id)`, `getCoverTemplates()`. Results for voices, virtualmen, and templates MUST be cached in Redis (voices/virtualmen 24h, templates 6h).

#### Scenario: Get public voices with cache
- **WHEN** calling getPublicVoices() and cache is warm
- **THEN** returns cached voice list without hitting Shanjian API

#### Scenario: Get template detail
- **WHEN** calling getTemplateDetail(id)
- **THEN** returns template with videoStructInfo containing canvas dimensions and layer info

### Requirement: Clone methods
The system SHALL implement: `cloneProfessionalAvatar(req)`, `cloneFastAvatar(req)`, `cloneImageAvatar(req)`, `cloneVoice(req)`, `deleteAsset(id)`. All clone methods MUST append `callbackUrl` from env. All clone methods return `taskId`.

#### Scenario: Fast avatar clone
- **WHEN** calling cloneFastAvatar with videoUrl, authVideoUrl, authText
- **THEN** POSTs to /v1/virtualman/fast/train and returns taskId

#### Scenario: Delete asset
- **WHEN** calling deleteAsset(id)
- **THEN** DELETEs /v1/assets/{id}

### Requirement: Effect methods
The system SHALL implement: `textToSpeech(req)` → taskId, `audioToText(req)` → taskId.

#### Scenario: TTS request
- **WHEN** calling textToSpeech with text, speakerId, and optional params
- **THEN** POSTs to /v1/effect/tts and returns taskId

### Requirement: Video generation methods
The system SHALL implement all 8 video generation methods plus AI cover: `generateRawVideo`, `generateVirtualmanBroadcast`, `generateRealmanBroadcast`, `generateCustomRealmanBroadcast`, `generateMaterialMixcut`, `generateNewsMixcut`, `generateCustomVirtualmanBroadcast`, `generateCustomMaterialMixcut`, `generateAICover`. Each returns taskId.

#### Scenario: Virtualman broadcast generation
- **WHEN** calling generateVirtualmanBroadcast with styleId, virtualmanId, content, speakerId
- **THEN** POSTs to /v1/clip/video/virtualman_broadcast and returns taskId

#### Scenario: News mixcut generation
- **WHEN** calling generateNewsMixcut with styleId, title, materials
- **THEN** POSTs to /v1/clip/video/news_mixcut and returns taskId

### Requirement: Task query method
The system SHALL implement `getTaskInfo(taskId)` returning TaskResult with status, result data, and error info.

#### Scenario: Query completed task
- **WHEN** calling getTaskInfo for a completed video task
- **THEN** returns `{ taskId, status: "succeed", result: { videoUrl, coverUrl, duration } }`
