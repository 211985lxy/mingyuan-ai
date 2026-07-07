# Test Engineer Analysis: Production Issues

**Date**: 2026-03-28
**Analyst**: Senior Test Engineer (Claude)
**System**: ClipFlow Video Generation Platform

---

## Executive Summary

Two critical production issues have been reported that impact core user workflows:
1. **Avatar Creation Failures** - Users cannot successfully create digital avatars
2. **Script Generation Button No Response** - Users click generate but see no feedback

**Root Cause Categories**:
- Silent failures due to incomplete error propagation
- Missing user feedback for asynchronous operations
- Insufficient input validation at multiple layers
- Inadequate error logging for production debugging
- Edge cases in external API integration (Shanjian, LLM providers)

**Impact**: High - Both issues block critical user journeys and create a poor user experience with no clear recovery path.

**Priority**: P0 - Immediate attention required for both issues.

---

## Issue 1: Avatar Creation Failures

### Error Surface Area

**File**: `/home/ubuntu/clipflow/apps/web/src/app/api/avatars/route.ts`

#### Failure Points Identified:

1. **Missing Authorization Video** (Line 67-72)
   - Returns 400 error with Chinese message: "请先录制授权视频"
   - **Test Gap**: No validation that user has recorded auth video before showing avatar creation UI
   - **User Impact**: User can navigate to creation form but cannot proceed

2. **URL Resolution Failures** (Line 78-101)
   - `resolveUpstreamReadableUrl()` can throw `AssetReadabilityError`
   - Handles OSS URL signing and upstream media resolution
   - **Test Gap**: No test coverage for expired URLs, invalid OSS paths, or network failures

3. **Shanjian API Failures** (Line 113-157)
   - Three clone methods: `cloneFastAvatar`, `cloneProfessionalAvatar`, `cloneImageAvatar`
   - **Critical**: If Shanjian call fails, avatar is marked as "failed" in database
   - Error message extracted from exception (Line 149-150)
   - **Test Gap**: No simulation of Shanjian rate limits, auth failures, or timeout scenarios

4. **Database Transaction Failures** (Line 104-111, 137-140)
   - Avatar record created before external API call
   - If Shanjian succeeds but database update fails, data inconsistency occurs
   - **Test Gap**: No testing of database constraint violations or transaction rollback

### Silent Failures Identified:

1. **Client-Side Error Handling** (`/home/ubuntu/clipflow/apps/web/src/app/(dashboard)/assets/page.tsx:546-572`)
   ```typescript
   catch (err) {
     const message = err instanceof Error ? err.message : "创建失败，请重试";
     setSubmitError(message);
   }
   ```
   - Error is set in state but UI rendering depends on `submitError` being displayed
   - **Issue**: If dialog closes prematurely or state is cleared, error is lost
   - **No toast notification** for success/failure after dialog closes

2. **Shanjian Error Mapping** (`/home/ubuntu/clipflow/apps/web/src/lib/shanjian.ts:36-58`)
   - Comprehensive error code mapping exists for known Shanjian errors
   - **Issue**: Unknown error codes fall through to generic message (Line 132-140)
   - **Test Gap**: No logging of unknown error codes for debugging

3. **Webhook Callback** (Line 146-153 in shanjian.ts)
   - Webhook URL is conditionally added if `SHANJIAN_WEBHOOK_URL` is set
   - **Silent Failure**: If webhook fails or is not configured, avatar status never updates from "cloning"
   - **Test Gap**: No webhook failure simulation or retry logic testing

### Error Recovery:

**Current State**: Limited recovery options
- User sees error message in dialog
- Can retry by clicking submit again
- **Issue**: If video upload succeeded but avatar creation failed, video is uploaded again (wasted bandwidth/cost)

**Missing**:
- No idempotency key to prevent duplicate avatars
- No resume functionality for partial failures
- No "pending" avatars list with retry button

### Logging Gaps:

1. **No request ID tracking** through avatar creation flow
2. **No structured logging** of:
   - Input parameters (name, cloneType, videoUrl)
   - User ID attempting creation
   - Shanjian taskId returned
   - Time spent in each step (upload → create → API call)
3. **Console logging**: Zero console.log/error statements in API route
4. **Shanjian library**: No logging of successful API calls, only errors in unknown code path

### Validation Issues:

1. **Frontend Validation** (`assets/page.tsx:547`)
   ```typescript
   if (!name.trim() || !videoFile) return;
   ```
   - Only checks presence, not format/length
   - **Missing**: File size validation, duration validation, format validation

2. **API Route Validation** (Line 22-55)
   - Validates required fields per clone type
   - **Missing**:
     - Video URL format validation
     - Image URL format validation
     - Name length limits
     - File size/duration checks before costly upload

3. **No Pre-flight Checks**:
   - Doesn't verify Shanjian API is reachable before starting
   - Doesn't check user quota/limits before creating avatar
   - Doesn't validate auth video exists before allowing creation UI

### Edge Cases:

1. **Race Condition**: User creates multiple avatars rapidly
   - No rate limiting or debounce
   - Could exceed Shanjian concurrency limits

2. **Expired Auth Video**: Auth video URL may expire between recording and avatar creation
   - No freshness check on `authVideoUrl`

3. **Partial Shanjian Failure**:
   - Shanjian returns taskId but task immediately fails
   - Webhook never fires or arrives late
   - Avatar stuck in "cloning" status

4. **Network Timeout**:
   - No explicit timeout on Shanjian clone API calls
   - Could hang indefinitely (though fetch has default timeout)

5. **Invalid File Content**:
   - Video file meets size requirements but:
     - No face detected
     - Face incomplete (side profile)
     - Audio quality too low
     - Resolution/FPS mismatch
   - These fail at Shanjian level with specific error codes

### Test Scenarios Required:

#### Happy Path:
1. ✓ User with auth video creates fast clone with valid video
2. ✓ User creates professional clone
3. ✓ User creates image clone with valid image
4. ✓ Webhook callback successfully updates avatar status to "ready"

#### Error Paths:
1. **Validation Errors**:
   - [ ] Create avatar without auth video → 400 with clear message
   - [ ] Create avatar with invalid clone type → 400
   - [ ] Create fast clone without videoUrl → 400
   - [ ] Create image clone without imageUrl → 400

2. **URL Resolution Errors**:
   - [ ] Video URL is expired OSS URL → 422 with AssetReadabilityError
   - [ ] Auth video URL is invalid → 422
   - [ ] Video URL points to non-existent file → 422

3. **Shanjian API Errors**:
   - [ ] Shanjian returns "Invalid.Authorization" → 401 with mapped message
   - [ ] Shanjian returns "Request.Limit" (rate limit) → 429
   - [ ] Shanjian returns "Invalid.Face.Detection" → 422
   - [ ] Shanjian returns unknown error code → 500 with upstream message
   - [ ] Shanjian timeout → 500

4. **Database Errors**:
   - [ ] Avatar creation succeeds but taskId update fails → inconsistent state
   - [ ] Duplicate avatar name (if unique constraint exists) → 409

5. **Edge Cases**:
   - [ ] User creates 10 avatars in 1 second → rate limit or queue
   - [ ] User's auth video is 6 months old → still works or expires?
   - [ ] Avatar cloning takes 2 hours → timeout or wait?
   - [ ] Webhook arrives before avatar record is committed → 404

### Recommendations (Priority Order):

#### P0 - Critical:
1. **Add comprehensive logging**:
   ```typescript
   console.log(`[avatars] Creating avatar for user ${user.id}`, {
     name, cloneType, videoUrl: videoUrl?.slice(0, 50)
   });
   ```
   - Log every step: start, URL resolution, Shanjian call, success/failure
   - Include request ID for tracing

2. **Add user feedback for async operations**:
   - Show "Cloning in progress" state after successful submission
   - Add polling or webhook listener to show progress
   - Send email/notification when avatar is ready or failed

3. **Improve error messages**:
   - Add error codes to all responses
   - Include actionable next steps: "Please record authorization video in Settings"
   - Show estimated time for cloning: "Avatar cloning takes 5-10 minutes"

#### P1 - High:
4. **Add pre-flight validation**:
   - Check auth video exists before showing create form
   - Validate file format/size on frontend before upload
   - Check user quota before allowing creation

5. **Implement retry logic**:
   - Store upload URL to avoid re-uploading on retry
   - Add "Retry" button for failed avatars
   - Implement exponential backoff for transient failures

6. **Add monitoring & alerts**:
   - Track avatar creation success rate
   - Alert if >10% failures in 5 minutes
   - Dashboard showing stuck "cloning" avatars

#### P2 - Medium:
7. **Handle webhook failures**:
   - Implement polling fallback if webhook doesn't arrive in 30 minutes
   - Add webhook retry queue
   - Log webhook delivery status

8. **Add idempotency**:
   - Generate unique idempotency key per creation attempt
   - Prevent duplicate avatars if user clicks submit twice

---

## Issue 2: Script Generation No Response

### Error Surface Area

**Files**:
- `/home/ubuntu/clipflow/apps/web/src/app/api/scripts/generate/route.ts`
- `/home/ubuntu/clipflow/apps/web/src/lib/script-generator.ts`

#### Failure Points Identified:

1. **Missing Template** (Line 61-63 in route.ts)
   - Returns 404 if template not found or not published
   - **User Impact**: Button click results in error, but was template selectable in UI?

2. **Missing Video Structure** (Line 65-70)
   - Returns 400 if structure not found
   - **Test Gap**: Should structure be validated before showing generate button?

3. **Incomplete IP Profile** (Line 72-85)
   - Returns 412 (Precondition Failed) with detailed profile status
   - **Critical**: Provides `missingFields` array for debugging
   - **Test Gap**: Should UI disable generate button if profile incomplete?

4. **Missing Required Variables** (Line 87-96)
   - Validates template variables against inputs
   - Returns 400 with list of missing variables
   - **User Impact**: Good error message but should be caught client-side

5. **Hot Topic Intelligence Errors** (Line 104-138)
   - Complex flow involving topic insight generation and fit evaluation
   - Can throw `HotTopicIntelligenceError` with custom status codes
   - **Test Gap**: No simulation of LLM failures during insight generation

6. **Script Generation Pipeline Failures** (Line 141-162)
   - Three-step pipeline: meta-prompt → script creation → AI scoring
   - Multiple fallback layers (structured → direct → rule-based)
   - **Silent Failure Risk**: Fallback to rule-based returns `isDegraded: true` but may not be obvious to user

7. **Database Transaction Failures** (Line 172-214)
   - Creates generation run and multiple script records
   - **Issue**: If transaction fails after LLM calls, LLM tokens are wasted

### Silent Failures Identified:

1. **LLM Unavailability** (`script-generator.ts:104-106`)
   ```typescript
   if (!llm.available) {
     return fallbackResult(params)
   }
   ```
   - **Silent Degradation**: Falls back to rule-based without user notification
   - **Issue**: User expects AI-generated scripts but gets template-based ones
   - **No Error**: Returns 200 with `isDegraded: true` flag

2. **Pipeline Step Failures** (Line 110-136)
   - Three nested try-catch blocks
   - First failure: tries direct recovery
   - Second failure: falls back to rule-based
   - **Issue**: Only logs to console with `console.warn`
   - **User Impact**: User has no idea generation quality is degraded

3. **Meta-Prompt Generation Failure** (Line 205-252)
   - Expects JSON response with 3 directions
   - If LLM returns invalid JSON or <3 directions, throws error
   - **Test Gap**: No handling of malformed JSON or hallucinated responses

4. **Script Parsing Failures** (Line 548-604)
   - Complex JSON parsing with multiple fallback strategies
   - Tries to extract scripts from various response formats
   - **Silent Failure**: Returns partial results if some scripts are invalid
   - **Issue**: User might get 1-2 scripts instead of promised 3

5. **AI Scoring Fallback** (Line 391-410)
   ```typescript
   try {
     return parseAIScores(result.content, candidates.length)
   } catch {
     return candidates.map((c) => scoreWithKeywords(c, params))
   }
   ```
   - Falls back to keyword-based scoring silently
   - User has no indication scores are less reliable

6. **Client-Side Error Handling** (`create/page.tsx:1400-1404`)
   ```typescript
   catch (e) {
     setTaskError(e instanceof Error ? e.message : "文案生成失败，请重试");
   } finally {
     setIsGenerating(false);
   }
   ```
   - Generic error message shown
   - No differentiation between network error, validation error, or LLM failure

### Error Recovery:

**Current State**: Minimal recovery
- User sees error in `taskError` state
- Can click generate button again
- **Issue**: No indication of what went wrong or how to fix it

**Missing**:
- No "retry" button that preserves form state
- No explanation of validation errors with links to fix (e.g., "Complete your IP profile")
- No partial success handling (e.g., "Generated 2 of 3 scripts, retry for more?")
- No option to skip hot topic and retry with simpler flow

### Logging Gaps:

1. **Script Generator Logging** (Only 2 console.warn statements):
   ```typescript
   Line 121: console.warn("[script-generator] Structured pipeline failed, trying direct recovery:", error)
   Line 133: console.warn("[script-generator] Direct recovery failed, falling back:", recoveryError)
   ```
   - **Missing**: Success logging
   - **Missing**: LLM request/response logging
   - **Missing**: Timing metrics (how long each step takes)
   - **Missing**: Token usage tracking

2. **No Request Correlation**:
   - Each API call to LLM is independent
   - Cannot trace a generation run through logs
   - Cannot measure end-to-end latency

3. **No Structured Logging**:
   - Using console.warn with string interpolation
   - Should use structured logger with fields: `userId`, `templateId`, `runId`, `step`, `duration`, `error`

4. **No LLM Response Logging**:
   - Cannot debug why meta-prompt generation failed
   - Cannot see what malformed JSON LLM returned
   - Cannot analyze script quality issues

### Validation Issues:

1. **Frontend Pre-validation** (`create/page.tsx`):
   - No visible pre-validation before API call
   - Should check:
     - All required inputs are filled
     - IP profile is complete
     - Template and structure are selected
   - Currently relies on API to reject

2. **API Route Validation** (Line 17-33):
   - Good validation of required fields
   - **Missing**: Input value validation (length, format)
   - **Missing**: Rate limiting (user could spam generate)

3. **Template Variable Validation** (Line 87-96):
   - Good use of `validateVariables()` helper
   - **Issue**: Error message lists missing variables but doesn't explain what they are

4. **No Model Availability Check**:
   - Doesn't verify LLM models (Sonnet 4.6, GPT-5.4) are reachable
   - Silently falls back if unavailable

### Edge Cases:

1. **"No Response" Scenarios**:

   a) **Frontend Button State Bug**:
   - `isGenerating` flag set to true but never cleared
   - Button becomes disabled permanently
   - **Root Cause**: Exception thrown before `finally` block or state update skipped

   b) **API Call Hangs**:
   - LLM request takes >2 minutes (default timeout)
   - User sees loading spinner indefinitely
   - No timeout on frontend fetch call

   c) **Network Failure**:
   - Request sent but no response received
   - Frontend has no timeout configured
   - **Issue**: User doesn't know if it's processing or failed

   d) **Silent 4xx/5xx Response**:
   - API returns error but response parsing fails
   - Error caught in client but not displayed
   - **Root Cause**: Error state variable not rendered in UI

2. **LLM Model Failures**:
   - Sonnet 4.6 returns non-JSON response
   - GPT-5.4 refuses to generate (content policy)
   - Rate limit on LLM provider
   - Model not found (wrong model ID in env var)

3. **Degraded Generation**:
   - All 3 scripts score <60
   - `isDegraded: true` returned
   - **Issue**: User doesn't know scripts are low quality

4. **Partial Success**:
   - LLM returns only 2 scripts instead of 3
   - Parser extracts 2, but UI expects 3
   - **Impact**: Confusing UX, fewer options for user

5. **Hot Topic Integration Failures**:
   - Topic insight generation fails
   - Fit evaluation fails
   - **Issue**: Should degrade gracefully to non-hot-topic generation

6. **Database Transaction Timeout**:
   - Scripts generated successfully
   - Database transaction takes >30s due to load
   - User sees error but scripts exist in database
   - **Issue**: User retries, creates duplicate runs

### Test Scenarios Required:

#### Happy Path:
1. ✓ Generate 3 scripts with complete profile, no hot topic
2. ✓ Generate 3 scripts with hot topic, strong fit
3. ✓ Generation completes in <10 seconds
4. ✓ All scripts score >60

#### Error Paths:
1. **Validation Errors**:
   - [ ] Generate without templateId → 400
   - [ ] Generate without structureId → 400
   - [ ] Generate without required inputs → 400 with missing list
   - [ ] Template not found → 404
   - [ ] Structure not found → 400
   - [ ] IP profile incomplete → 412 with missing fields

2. **LLM Failures**:
   - [ ] LLM unavailable → fallback to rule-based, isDegraded=true
   - [ ] Meta-prompt returns invalid JSON → direct recovery
   - [ ] Direct generation returns invalid JSON → fallback
   - [ ] AI scoring fails → keyword-based scoring

3. **Network/Timeout**:
   - [ ] LLM request times out → error message
   - [ ] Database transaction times out → error message
   - [ ] Multiple parallel requests → queue or fail gracefully

4. **Edge Cases**:
   - [ ] Generate with caution-level hot topic → scripts respect caution
   - [ ] Generate with avoid-level hot topic → scripts don't force topic
   - [ ] User clicks generate 10 times rapidly → debounce or rate limit
   - [ ] LLM returns 1 script instead of 3 → handle gracefully
   - [ ] All scripts score <60 → warn user

5. **Frontend Hang Scenarios**:
   - [ ] API returns 500 → loading spinner stops, error shown
   - [ ] API never responds → timeout after 30s, error shown
   - [ ] Network disconnects mid-request → error shown
   - [ ] Response JSON malformed → error shown

### Recommendations (Priority Order):

#### P0 - Critical:
1. **Add frontend timeout**:
   ```typescript
   const controller = new AbortController();
   const timeout = setTimeout(() => controller.abort(), 30000);
   try {
     const result = await apiGenerateScripts({...}, { signal: controller.signal });
   } catch (e) {
     if (e.name === 'AbortError') {
       setTaskError('生成超时，请重试');
     }
   } finally {
     clearTimeout(timeout);
   }
   ```

2. **Add progress indicator**:
   - Show steps: "Analyzing profile → Generating meta-prompt → Creating scripts → Scoring"
   - User knows system is working, not hung

3. **Improve error messages**:
   - IP profile incomplete: "Your profile is missing: [field1, field2]. Complete profile →"
   - LLM unavailable: "AI service temporarily unavailable, using fallback. Quality may vary."
   - Validation error: "Missing required inputs: [input1]. Please fill in all fields."

4. **Add comprehensive logging**:
   ```typescript
   console.log('[scripts/generate] Starting generation', {
     userId: user.id,
     templateId,
     structureId,
     hasHotTopic: !!hotTopicId,
     timestamp: Date.now()
   });
   ```

#### P1 - High:
5. **Add pre-flight validation**:
   - Disable generate button if profile incomplete
   - Show validation errors before API call
   - Check all required inputs filled

6. **Handle degraded generation transparently**:
   - Show warning badge: "Generated using fallback mode"
   - Explain: "AI service unavailable, scripts created from template"
   - Offer: "Try again" button

7. **Add retry with context**:
   - "Generation failed. [Retry] [Skip hot topic and retry] [Report issue]"
   - Preserve form state on retry
   - Don't clear inputs on error

8. **Implement request deduplication**:
   - Disable button while generating
   - Add debounce (500ms) to prevent double-clicks
   - Show "Generating..." state clearly

#### P2 - Medium:
9. **Add telemetry & monitoring**:
   - Track generation success rate by template
   - Track average generation time
   - Track degraded generation percentage
   - Alert if >20% degraded or >10% failures

10. **Improve fallback quality**:
    - Test rule-based fallback outputs
    - Show examples of fallback vs AI quality
    - Collect user feedback on degraded scripts

11. **Add partial success handling**:
    - If 2/3 scripts generated, show them with option to "Generate 1 more"
    - Don't treat partial success as complete failure

---

## Cross-Cutting Concerns

### 1. Observability

**Current State**: Minimal
- Sparse console.warn logging
- No structured logging
- No request correlation IDs
- No performance metrics

**Required**:
- Centralized logging (Winston, Pino, or cloud logging)
- Distributed tracing (request IDs across API → Shanjian → webhook)
- Metrics dashboard (Prometheus/Grafana or cloud monitoring)
- Error tracking (Sentry, Rollbar, or similar)

### 2. Error Classification

**Current State**: Binary success/failure
- Errors are either 2xx (success) or 4xx/5xx (failure)
- No error codes for programmatic handling

**Required Error Taxonomy**:
- `VALIDATION_ERROR`: Client input invalid (4xx)
- `PRECONDITION_FAILED`: System state invalid (412)
- `EXTERNAL_SERVICE_ERROR`: Shanjian/LLM failure (502/503)
- `RATE_LIMIT_EXCEEDED`: Too many requests (429)
- `TIMEOUT`: Operation took too long (504)
- `DEGRADED_SERVICE`: Fallback mode active (200 with warning)
- `INTERNAL_ERROR`: Unexpected exception (500)

### 3. User Experience

**Current Issues**:
- No loading states for multi-step operations
- No progress indicators
- Generic error messages
- No recovery guidance
- Async operations (avatar cloning) have no status tracking

**Required**:
- Skeleton loaders for all async operations
- Progress bars/steps for multi-stage flows
- Specific error messages with next steps
- Toast notifications for background tasks
- Status badges for long-running operations

### 4. Testing Strategy

**Current Coverage**: Unknown
- No visible unit tests for API routes in provided code
- E2E tests exist (`__tests__/e2e/`) but coverage level unknown

**Required Test Suite**:

#### Unit Tests:
- [ ] All validation functions (validateVariables, buildIpProfileView)
- [ ] Error mappers (Shanjian error codes)
- [ ] JSON parsers (parseScriptCandidates, parseAIScores)
- [ ] Scoring logic (scoreWithKeywords, parseAIScores)

#### Integration Tests:
- [ ] Avatar creation with mocked Shanjian (success, failure, timeout)
- [ ] Script generation with mocked LLM (success, invalid JSON, timeout)
- [ ] Hot topic integration with mocked insight API
- [ ] Webhook handlers with various payloads

#### E2E Tests:
- [ ] Complete avatar creation flow (record auth → create avatar → wait for ready)
- [ ] Complete script generation flow (select template → fill inputs → generate → select script)
- [ ] Error recovery flows (retry after failure, fix validation issues)

#### Load Tests:
- [ ] 100 concurrent avatar creations
- [ ] 100 concurrent script generations
- [ ] Burst traffic (1000 requests in 10 seconds)

### 5. Rate Limiting & Quotas

**Current State**: No visible rate limiting
- Users can spam generate/create buttons
- No protection against API abuse
- Could exhaust external API quotas

**Required**:
- Per-user rate limits (e.g., 10 generations per minute)
- Per-IP rate limits for unauthenticated endpoints
- Quota management (e.g., 100 avatars per user)
- Clear feedback when limits reached

### 6. Idempotency

**Current State**: No idempotency protection
- Duplicate requests create duplicate resources
- No deduplication logic

**Required**:
- Idempotency keys for POST operations
- Request deduplication within time window (5 minutes)
- Clear errors: "Duplicate request, original request ID: xyz"

### 7. Graceful Degradation

**Good Example**: Script generator has 3-layer fallback:
1. Structured pipeline (Sonnet 4.6 meta-prompt → GPT-5.4 scripts)
2. Direct generation (GPT-5.4 only)
3. Rule-based fallback (no LLM)

**Issue**: Degradation is silent, user doesn't know quality is reduced

**Required**:
- Explicit degradation notices
- User option to "wait for AI" vs "use fallback"
- Quality indicators (stars, badges) on degraded outputs

### 8. Async Operation Tracking

**Issue**: Avatar cloning is async but no user-facing status tracking

**Required**:
- Polling mechanism to check avatar status
- WebSocket or SSE for real-time updates
- Notification system (email, push) when complete
- Dashboard showing "in progress" operations

---

## Priority Recommendations (Consolidated)

### P0 - Immediate (Fix This Week):

1. **Add comprehensive logging to both flows**
   - Request start/end with IDs
   - All validation failures
   - External API calls (Shanjian, LLM)
   - Database operations
   - Timing metrics

2. **Add frontend timeouts**
   - 30 second timeout for script generation
   - 10 second timeout for avatar creation API call
   - Clear error message on timeout

3. **Improve error messages**
   - Include error codes
   - Add actionable next steps
   - Link to help docs or settings

4. **Add progress indicators**
   - Avatar creation: "Uploading → Creating → Cloning (5-10 min)"
   - Script generation: "Step 1/3: Analyzing profile..."

5. **Fix "no response" bug**
   - Audit all state management in create form
   - Ensure `isGenerating` always resets in finally block
   - Add error boundary around generation flow

### P1 - This Sprint:

6. **Add pre-flight validation**
   - Check IP profile completeness before showing generate button
   - Validate file formats before upload
   - Show inline validation errors

7. **Implement retry logic**
   - Store intermediate state (uploaded video URL)
   - Add explicit "Retry" button on failures
   - Preserve form inputs on error

8. **Add monitoring & alerts**
   - Failure rate by endpoint
   - Response time p50/p95/p99
   - Alert if >10% failure rate or >30s p95 latency

9. **Handle degraded generation transparently**
   - Badge showing "AI" vs "Fallback" generation
   - Option to regenerate with AI when available

10. **Add async operation tracking**
    - Polling for avatar status
    - "My Avatars" page shows in-progress clones
    - Email notification when avatar ready

### P2 - Next Sprint:

11. **Implement rate limiting**
    - Per-user: 10 generations/minute, 5 avatar creations/hour
    - Per-IP for public endpoints
    - Clear rate limit errors

12. **Add idempotency**
    - Generate idempotency keys for all mutations
    - Deduplicate requests within 5-minute window

13. **Expand test coverage**
    - Unit tests for all validators
    - Integration tests for error paths
    - E2E tests for recovery flows

14. **Build operations dashboard**
    - Real-time view of success rates
    - List of stuck operations (avatars in "cloning" >1 hour)
    - Manual retry/cancel controls

---

## Appendix: Specific Files Requiring Changes

### Avatar Creation Flow:
1. `/home/ubuntu/clipflow/apps/web/src/app/api/avatars/route.ts`
   - Add logging (lines 18, 56, 103, 113, 143, 153)
   - Add idempotency check
   - Add rate limiting

2. `/home/ubuntu/clipflow/apps/web/src/lib/shanjian.ts`
   - Add success logging
   - Add request/response logging for debugging
   - Add timeout configuration

3. `/home/ubuntu/clipflow/apps/web/src/app/(dashboard)/assets/page.tsx`
   - Add timeout to API call (line 555)
   - Improve error display (line 566)
   - Add toast notification on success/failure
   - Add pre-flight validation (check auth video exists)

### Script Generation Flow:
1. `/home/ubuntu/clipflow/apps/web/src/app/api/scripts/generate/route.ts`
   - Add logging (lines 17, 141, 172, 216)
   - Add timeout configuration
   - Add rate limiting

2. `/home/ubuntu/clipflow/apps/web/src/lib/script-generator.ts`
   - Add structured logging (lines 99, 112, 125, 256, 294, 345)
   - Log LLM request/response for debugging
   - Add degradation notification
   - Add metrics (token usage, latency)

3. `/home/ubuntu/clipflow/apps/web/src/app/(dashboard)/create/page.tsx`
   - Add timeout to API call (line 1391)
   - Add progress indicator
   - Improve error display (line 1401)
   - Add pre-flight validation
   - Add retry button preserving state

### Shared Infrastructure:
1. Create `/home/ubuntu/clipflow/apps/web/src/lib/logger.ts`
   - Structured logger with request IDs
   - Log levels (debug, info, warn, error)
   - Integration with error tracking service

2. Create `/home/ubuntu/clipflow/apps/web/src/lib/monitoring.ts`
   - Metrics collection
   - Performance tracking
   - Error rate tracking

3. Create `/home/ubuntu/clipflow/apps/web/src/middleware.ts`
   - Rate limiting middleware
   - Request ID generation
   - Timeout enforcement

---

## Conclusion

Both production issues stem from a combination of:
1. **Silent failures** in error propagation
2. **Missing user feedback** for async operations
3. **Insufficient logging** for debugging
4. **Inadequate error handling** of external service failures

The script generation "no response" issue is likely caused by:
- Frontend timeout/hang without error display
- Uncaught exception leaving button in disabled state
- LLM service failure with silent fallback

The avatar creation failures are likely caused by:
- Missing authorization video (user education issue)
- Shanjian API errors (validation, rate limit, face detection)
- Webhook delivery failures leaving avatars stuck in "cloning"

Immediate priorities are logging, timeouts, and user feedback. Medium-term priorities are monitoring, retry logic, and test coverage.
