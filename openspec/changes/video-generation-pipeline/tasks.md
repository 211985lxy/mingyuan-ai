## 0. Schema & Infrastructure

- [x] 0.1 Update Asset model in Prisma schema (add status, externalTaskId, externalSpeakerId, voiceModel, demoAudioUrl, errorCode, errorMessage, updatedAt fields + indexes)
- [x] 0.2 Run `prisma db push` to sync test DB, regenerate Prisma client
- [x] 0.3 Install `ali-oss` package

## 1. User Authentication

- [x] 1.1 Create `lib/user-auth.ts` with hashPassword, verifyPassword, signUserToken (7d expiry), verifyUserToken, withUserAuth middleware (mirroring admin-auth pattern)
- [x] 1.2 Create POST /api/auth/register route (email + password + name → JWT + user)
- [x] 1.3 Create POST /api/auth/login route (email + password → JWT + user)
- [x] 1.4 Create GET /api/auth/me route (protected, returns user profile)
- [x] 1.5 Write E2E tests for auth endpoints (register, login, me, duplicate email, invalid credentials)

## 2. File Validation Library

- [x] 2.1 Create `lib/validation.ts` with validateTrainingVideo(cloneType, metadata), validateMaterial(type, metadata), validateVoiceAudio(model, metadata)
- [x] 2.2 Define validation rule constants (TRAINING_VIDEO_RULES, MATERIAL_RULES, VOICE_CLONE_RULES) per spec
- [x] 2.3 Write unit tests for all validation functions and edge cases

## 3. Credits Calculation Library

- [x] 3.1 Create `lib/credits.ts` with calculateCreditsCost(durationSeconds, videoType), estimateCreditsCost(textLength, videoType) — rates: virtualman_broadcast=70, realman_broadcast=10, broadcast_mixcut=10, news_mixcut=4, virtualman_video=50, ai_cover=5(flat), professional_clone=500(flat)
- [x] 3.2 Add credits pre-check (checkBalance), deduction (deductCredits), and refund (refundCredits) helper functions operating on User.credits
- [x] 3.3 Write unit tests for cost calculation, estimation, and deduction/refund

## 4. Shanjian Client (Full Implementation)

- [x] 4.1 Add complete TypeScript types in `types/shanjian.ts` (all request/response/callback types from backend service spec sections 3.1-3.6)
- [x] 4.2 Add full ERROR_MAP constant with all Shanjian error codes → ClipFlow error codes (spec section 3.7)
- [x] 4.3 Add APP_KEY existence check to request() — throw SHANJIAN_NOT_CONFIGURED if missing
- [x] 4.4 Implement asset query methods: getPublicVoices, getPublicVirtualmen, getTemplates, getTemplateDetail, getCoverTemplates (with Redis caching: voices/virtualmen 24h, templates 6h)
- [x] 4.5 Implement clone methods: cloneProfessionalAvatar, cloneFastAvatar, cloneImageAvatar, cloneVoice, deleteAsset (all append callbackUrl from env)
- [x] 4.6 Implement effect methods: textToSpeech, audioToText
- [x] 4.7 Implement video generation methods: generateRawVideo, generateVirtualmanBroadcast, generateRealmanBroadcast, generateCustomRealmanBroadcast, generateMaterialMixcut, generateNewsMixcut, generateCustomVirtualmanBroadcast, generateCustomMaterialMixcut
- [x] 4.8 Implement generateAICover
- [x] 4.9 Update getTaskInfo to return full TaskResult type (with videoUrl, audioUrl, imageUrl, virtualmanId, speakerId, etc.)
- [x] 4.10 Write unit tests for error mapping and request layer (mock fetch)

## 5. OSS Integration

- [x] 5.1 Create `lib/oss.ts` with generateUploadUrl(fileName, contentType) → { uploadUrl, assetUrl, expiresAt }
- [x] 5.2 Implement transferFromUrl(sourceUrl, destKey) for stream download→upload to OSS
- [x] 5.3 Add graceful degradation: if OSS env vars missing, log warning and return original URL

## 6. Avatar Management API

- [x] 6.1 Create POST /api/avatars route (withUserAuth, validate clone type + required fields per type, run file validation, call Shanjian clone, create DB record with status="cloning")
- [x] 6.2 Create GET /api/avatars route (withUserAuth, list with status filter, pagination, ordered by createdAt desc)
- [x] 6.3 Create GET /api/avatars/[id] route (withUserAuth, ownership check)
- [x] 6.4 Create DELETE /api/avatars/[id] route (withUserAuth, delete DB + call Shanjian deleteAsset for virtualmanId and speakerId if present)
- [x] 6.5 Write E2E tests for avatar CRUD

## 7. Voice Cloning API

- [x] 7.1 Create POST /api/voices route (withUserAuth, validate model+audioUrl, run audio validation, call cloneVoice, create Asset with assetType="voice" status="processing")
- [x] 7.2 Create GET /api/voices route (withUserAuth, returns user voice Assets + public voices from Shanjian)
- [x] 7.3 Create DELETE /api/voices/[id] route (withUserAuth, delete DB + call Shanjian deleteAsset for externalSpeakerId if present)
- [x] 7.4 Write E2E tests for voice endpoints

## 8. Effect Services API

- [x] 8.1 Create POST /api/effects/tts route (withUserAuth, validate text+speakerId, call textToSpeech, return taskId)
- [x] 8.2 Create POST /api/effects/asr route (withUserAuth, validate audioUrl+language, call audioToText, return taskId)
- [x] 8.3 Write E2E tests for effect endpoints

## 9. Asset Management API

- [x] 9.1 Create POST /api/assets/upload-url route (withUserAuth, call generateUploadUrl, return 503 if OSS not configured)
- [x] 9.2 Create POST /api/assets route (withUserAuth, register asset record with name, assetType, url, size)
- [x] 9.3 Create GET /api/assets route (withUserAuth, list with assetType filter, pagination)
- [x] 9.4 Create DELETE /api/assets/[id] route (withUserAuth, ownership check, delete record)
- [x] 9.5 Write E2E tests for asset endpoints

## 10. Video Tasks API

- [x] 10.1 Create POST /api/tasks route (withUserAuth, validate type field, type-based routing to 9 Shanjian methods, credits estimation + pre-deduction, concurrency check per plan, create Script record + VideoTask record)
- [x] 10.2 Create GET /api/tasks route (withUserAuth, list with status filter, pagination, ordered by createdAt desc)
- [x] 10.3 Create GET /api/tasks/[id] route (withUserAuth, ownership check, include videoUrl/coverUrl/duration if completed)
- [x] 10.4 Write E2E tests for task creation (credits check, concurrency check, type routing, avatar readiness check)

## 11. Webhook Handler

- [x] 11.1 Create POST /api/webhook/shanjian route (fast ACK — return 200 immediately, parse payload)
- [x] 11.2 Implement idempotency check (Redis SET NX `webhook:{taskId}`, TTL 24h)
- [x] 11.3 Implement task type dispatch: query avatar.externalTaskId → videoTask.externalTaskId → asset.externalTaskId (voice clone); log unknown taskIds
- [x] 11.4 Implement avatar callback handler (success: status=ready + store virtualmanId/speakerId, failure: status=failed + errors)
- [x] 11.5 Implement video callback handler (success: OSS transfer video+cover → status=completed + settle actual credits + refund difference, failure: status=failed + refund pre-deducted credits)
- [x] 11.6 Implement voice clone callback handler (success: Asset status=ready + store externalSpeakerId/demoAudioUrl, failure: status=failed + errors)
- [x] 11.7 Implement DB-level state machine guard (only allow processing→completed/failed transitions, silently ignore terminal→terminal)
- [x] 11.8 Write E2E tests for webhook processing (avatar success/fail, video success/fail, voice success/fail, duplicate callback, unknown taskId)

## 12. Task Polling Cron

- [x] 12.1 Create GET /api/cron/poll-tasks route (CRON_SECRET protected)
- [x] 12.2 Implement stale task detection: avatar cloning >15min, video processing >5min, voice processing >10min (professional avatar uses 7h threshold)
- [x] 12.3 Implement polling lock (Redis SET NX `poll:{taskId}`, TTL 60s)
- [x] 12.4 Reuse webhook handler logic for processing poll results from getTaskInfo
- [x] 12.5 Write E2E tests for polling endpoint
