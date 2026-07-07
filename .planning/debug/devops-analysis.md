# DevOps/SRE Analysis: Production Issues

**Date**: 2026-03-28
**Analyzer**: Senior DevOps/SRE Engineer
**Scope**: Digital human creation failures + Script generation button non-responsive

---

## Executive Summary

ClipFlow is experiencing two critical production issues that stem from **severe observability gaps** and **inadequate error surface area**. The system lacks structured logging, distributed tracing, metrics collection, and real-time monitoring. When failures occur, they are silent to operators and barely visible to users.

**Key Findings**:
1. No structured logging framework - only console.log/console.warn scattered across 24 files
2. No APM/tracing integration (Sentry, Datadog, New Relic, etc.)
3. No real-time alerting for external service failures (Shanjian API, LLM providers)
4. Healthcheck endpoint is trivial and doesn't validate critical dependencies
5. Timeout configurations are inconsistent and potentially too aggressive
6. External API errors are swallowed by try-catch blocks without adequate context
7. No circuit breakers or rate limiting visibility for Shanjian API
8. Frontend error handling is minimal - ApiError class exists but no retry logic or user feedback mechanisms

**Impact**: When Shanjian API degrades or LLM providers fail, operators have no visibility until users report issues. Recovery is reactive rather than proactive.

---

## Observability Assessment

### Current State: CRITICAL DEFICIENCIES

#### 1. Logging Infrastructure
**Status**: Ad-hoc console logging only

**Evidence**:
- 57 console.error/console.warn calls across 24 files
- No structured logging library (winston, pino, or similar)
- No log aggregation (CloudWatch, ELK, Loki)
- No correlation IDs for request tracing
- Log messages are inconsistent (some with prefixes like `[webhook]`, most without)

**Example of good pattern** (webhook handler):
```typescript
console.error(`[webhook] Error processing taskId ${taskId}:`, error)
```

**Example of poor pattern** (most API routes):
```typescript
// No logging at all in /api/avatars/route.ts line 143-157
catch (error) {
  await prisma.avatar.update({ /* ... */ })
  return NextResponse.json({ error: ... }, { status: 500 })
}
```

#### 2. Metrics & Monitoring
**Status**: NONE

- No Prometheus/OpenTelemetry instrumentation
- No custom metrics for:
  - Avatar creation success/failure rates
  - Script generation latency
  - Shanjian API response times
  - LLM API response times and token usage
  - Database query performance
  - Redis connection pool health

#### 3. Distributed Tracing
**Status**: NONE

- No trace context propagation
- Cannot correlate webhook callbacks to original requests
- Cannot measure end-to-end latency from user click to webhook completion

#### 4. Alerting
**Status**: NONE

- No PagerDuty/Opsgenie integration
- No alerts for:
  - Shanjian API 5xx errors
  - LLM provider failures
  - Database connection exhaustion
  - Redis connection failures
  - Webhook delivery failures

#### 5. Healthcheck
**Status**: INADEQUATE

Current healthcheck (`/api/healthz`):
```typescript
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "clipflow-web",
    timestamp: new Date().toISOString(),
  });
}
```

**Issues**:
- Does not check database connectivity
- Does not check Redis connectivity
- Does not check OSS (Aliyun) connectivity
- Does not check external APIs (Shanjian, LLM providers)
- Kubernetes probes will pass even when critical dependencies are down

---

## Issue 1: Avatar Creation Failures - Operational Analysis

### Architecture Flow
```
User → POST /api/avatars → Shanjian API (clone request) → Webhook callback → Avatar status update
```

### Failure Modes & Detection Gaps

#### A. Shanjian API Submission Failures (Line 113-157)
**Code**: `/apps/web/src/app/api/avatars/route.ts`

```typescript
try {
  let taskId: string
  if (cloneType === "fast") {
    taskId = await cloneFastAvatar({ ... })
  }
  // Store externalTaskId
  await prisma.avatar.update({ where: { id: avatar.id }, data: { externalTaskId: taskId } })
  return NextResponse.json({ data: updatedAvatar }, { status: 201 })
} catch (error) {
  // Mark as failed
  await prisma.avatar.update({ where: { id: avatar.id }, data: { status: "failed", errorMessage: ... } })
  return NextResponse.json({ error: ... }, { status: 500 })
}
```

**Observability Gaps**:
1. No logging of the Shanjian API request payload
2. No logging of Shanjian API response times
3. No metrics on failure rates by clone type (fast/professional/image)
4. Error message from Shanjian is logged to DB but not to centralized logging
5. No alerting when Shanjian API returns errors

**Shanjian Library** (`/apps/web/src/lib/shanjian.ts`):
- Has comprehensive error mapping (line 36-58)
- Throws `ShanjianError` with structured fields (code, message, requestId)
- **BUT**: No logging before throwing - when errors bubble up, we lose request context

**Recommended Instrumentation**:
```typescript
// Add before Shanjian call
logger.info('Avatar clone request started', {
  avatarId: avatar.id,
  userId: user.id,
  cloneType,
  videoUrlProvided: !!videoUrl,
  imageUrlProvided: !!imageUrl,
  authVideoUrlProvided: !!authVideoUrl
})

// Wrap Shanjian call with timing
const startTime = Date.now()
try {
  taskId = await cloneFastAvatar({ ... })
  logger.info('Shanjian API success', {
    avatarId: avatar.id,
    externalTaskId: taskId,
    durationMs: Date.now() - startTime
  })
} catch (error) {
  logger.error('Shanjian API failure', {
    avatarId: avatar.id,
    cloneType,
    durationMs: Date.now() - startTime,
    errorCode: error instanceof ShanjianError ? error.code : 'UNKNOWN',
    errorMessage: error.message,
    requestId: error instanceof ShanjianError ? error.requestId : undefined
  })
  // Increment failure metric by clone type
  metrics.increment('avatar.creation.failed', { cloneType, errorCode })
}
```

#### B. Webhook Processing Failures (Line 46-214)
**Code**: `/apps/web/src/app/api/webhook/shanjian/route.ts`

**Current Good Practices**:
- Redis deduplication (line 36-44)
- Conditional DB updates using `updateMany` with `where: { status: "cloning" }`
- Error handling with console.error

**Observability Gaps**:
1. No correlation ID linking webhook to original request
2. No metrics on webhook latency
3. No alerting when webhook processing fails
4. OSS transfer failures (`transferFromUrl`) are logged but not alerted
5. Voice asset creation failures in background tasks are logged but not tracked

**Example Silent Failure**:
```typescript
// Line 190-202: Demo video trigger is best-effort with catch
triggerAvatarDemoVideo({ ... }).catch((err) =>
  console.error(`[webhook] Demo video trigger failed for avatar ${avatarId}:`, err)
)
```
If this fails repeatedly, no one knows until users complain about missing demo videos.

#### C. Recovery Mechanism (Task Recovery)
**Code**: `/apps/web/src/lib/task-recovery.ts`

**Current Good Practices**:
- Polls stale avatars (status=cloning, updatedAt > 2min ago)
- Uses Redis locks to prevent duplicate polling
- Comprehensive retry logic for voice assets and demo videos

**Observability Gaps**:
1. Recovery run summaries are returned but not logged centrally
2. No metrics on recovery success rates
3. No alerting when recovery consistently fails
4. No visibility into why avatars get stuck in "cloning" state

**Recommended**:
```typescript
// After recovery run completes
logger.info('Task recovery completed', {
  trigger: input.trigger,
  avatarsPolled,
  videosPolled,
  voicesPolled,
  voiceRepairs,
  demoRepairs,
  demosPolled,
  orphanedPendingExpired,
  durationMs: Date.now() - startTime
})

// Alert if recovery finds many stuck tasks
if (avatarsPolled > 10) {
  alerting.warn('High number of stuck avatar tasks', { count: avatarsPolled })
}
```

#### D. Timeout Configuration
**Shanjian API Timeout**: 8000ms (8 seconds) for getTaskInfo, no explicit timeout for clone requests

**Issues**:
- Clone operations can take minutes but have no timeout
- If Shanjian API hangs, Next.js route will timeout based on `maxDuration`
- Webhook has `maxDuration = 60` (line 18), but individual operations (OSS transfer, voice cloning) have no timeouts
- Could cause cascading failures if Shanjian is slow

---

## Issue 2: Script Generation Button Click - Operational Analysis

### Architecture Flow
```
User clicks "Generate" → POST /api/scripts/generate → LLM multi-step pipeline → Return 3 scripts
```

### Failure Modes & Detection Gaps

#### A. Frontend Error Handling
**Code**: `/apps/web/src/lib/api/client.ts`

```typescript
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(path, { ... })
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    if (response.status === 401) {
      useAuthStore.getState().clearSession()
    }
    throw new ApiError(
      typeof payload?.error === "string" ? payload.error : `Request failed: ${response.status}`,
      response.status,
      payload
    )
  }
  return payload as T
}
```

**Observability Gaps**:
1. No logging of API errors to external service (e.g., Sentry)
2. No retry logic for transient failures (network issues, 5xx errors)
3. No timeout on fetch() call - could hang indefinitely
4. No user-visible loading states with timeout warnings

**Button Click Non-Response Scenarios**:
1. **Network timeout**: Fetch hangs, no error thrown, button never re-enables
2. **LLM provider failure**: API returns 500, error is shown but not logged
3. **Validation failure**: Returns 400, user sees error but no telemetry
4. **Browser console errors**: Could be JavaScript errors in React components (not in backend)

**Recommended Frontend Instrumentation**:
```typescript
// Add AbortController with timeout
const controller = new AbortController()
const timeout = setTimeout(() => controller.abort(), 60000) // 60s

try {
  const response = await fetch(path, {
    ...init,
    signal: controller.signal
  })
  // Log success
  logger.info('API request succeeded', { path, status: response.status, durationMs })
} catch (error) {
  if (error.name === 'AbortError') {
    logger.error('API request timeout', { path, timeoutMs: 60000 })
    // Show user-friendly timeout message
  } else {
    logger.error('API request failed', { path, error: error.message })
  }
  throw error
} finally {
  clearTimeout(timeout)
}
```

#### B. Backend Script Generation Pipeline
**Code**: `/apps/web/src/lib/script-generator.ts`

**3-Step Pipeline**:
1. Generate meta-prompt (Sonnet 4.6)
2. Generate scripts (GPT-5.4)
3. Score scripts (Sonnet 4.6)

**Current Good Practices**:
- Fallback to direct generation if meta-prompt fails (line 121-136)
- Fallback to keyword scoring if AI scoring fails (line 407-410)
- Fallback to rule-based generation if LLM unavailable (line 104-106)

**Observability Gaps**:
1. No logging of LLM API latencies for each step
2. No metrics on fallback frequency (indicates provider issues)
3. No alerting when LLM providers are down
4. console.warn used but no centralized log aggregation

**Example**:
```typescript
// Line 121
console.warn("[script-generator] Structured pipeline failed, trying direct recovery:", error)
```
This is good for debugging but invisible in production without log aggregation.

**LLM Client** (`/apps/web/src/lib/llm/client.ts`):
```typescript
async complete(options: CompletionOptions): Promise<CompletionResult> {
  let lastError: Error | undefined
  for (const provider of this.providers) {
    try {
      return await provider.complete(options)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      console.warn(`[llm] Provider "${provider.name}" failed, trying next:`, lastError.message)
    }
  }
  throw lastError ?? new Error("[llm] All providers failed")
}
```

**Observability Gaps**:
1. No metrics on provider success rates
2. No alerting when all providers fail
3. No logging of which provider succeeded (for cost tracking)
4. No timeout configuration per provider

#### C. API Route Timeout
**Code**: `/apps/web/src/app/api/scripts/generate/route.ts`

**No explicit timeout** - relies on Next.js default (10s on Vercel, longer on self-hosted)

**Issues**:
- LLM calls can take 10-30 seconds
- If LLM provider is slow, route might timeout
- User sees generic timeout error with no context
- No retry mechanism

**Recommended**:
```typescript
export const maxDuration = 120 // 2 minutes for script generation
```

#### D. Database Query Performance
**Query**: Fetches template, ipProfile, videoStructure in parallel (line 35-59)

**Potential Issue**: If database is slow or connection pool exhausted, this could hang.

**No Instrumentation**:
- No query timing logs
- No slow query alerts
- No connection pool metrics

---

## Resource Constraints Analysis

### Kubernetes Configuration

#### Web Deployment
**File**: `/home/ubuntu/clipflow/k8s/clipflow-web.yaml`

```yaml
resources:
  requests:
    cpu: 250m
    memory: 512Mi
  limits:
    cpu: "1"
    memory: 1Gi
```

**Analysis**:
- **CPU**: 250m request is reasonable for web app, 1 core limit allows bursting
- **Memory**: 512Mi request, 1Gi limit
  - Node.js default heap is ~1.4GB, but containerized apps should stay under limit
  - Could cause OOMKill if LLM responses are large or many concurrent requests
  - No memory profiling or leak detection

**Probes**:
```yaml
readinessProbe:
  initialDelaySeconds: 10
  periodSeconds: 10
  timeoutSeconds: 3
  failureThreshold: 3
livenessProbe:
  initialDelaySeconds: 30
  periodSeconds: 20
  timeoutSeconds: 3
  failureThreshold: 3
```

**Issues**:
- Healthcheck doesn't validate DB/Redis, so probes pass even when dependencies are down
- `timeoutSeconds: 3` is very aggressive for liveness - if app is under load, could cause restart loops

#### Worker Deployment
**File**: `/home/ubuntu/clipflow/k8s/clipflow-worker.yaml`

**Same resource limits as web** - appropriate since it's the same codebase running task recovery.

**Liveness Probe**:
```yaml
livenessProbe:
  exec:
    command:
      - /bin/sh
      - -c
      - test -f /tmp/clipflow-task-recovery-heartbeat.json && find /tmp/clipflow-task-recovery-heartbeat.json -mmin -2 | grep -q .
  initialDelaySeconds: 90
  periodSeconds: 30
  failureThreshold: 2
```

**Good**: Custom heartbeat file-based liveness check.
**Issue**: If worker is stuck polling Shanjian API (no timeout), heartbeat won't update, and pod will restart. This is correct behavior but lacks observability into why it stuck.

---

## External Service Monitoring

### Shanjian API Resilience

**Current State**:
- Error mapping is comprehensive (36 error codes mapped)
- ShanjianError is thrown with structured data
- No circuit breaker or rate limit detection
- No retry logic (relies on webhook + task recovery for eventual consistency)

**Missing**:
1. **Health monitoring**: No periodic check of Shanjian API availability
2. **Rate limit tracking**: Shanjian has `Request.Limit` and `Concurrency.Limit` errors but no tracking of how close we are to limits
3. **Degraded mode detection**: When Shanjian is slow (not failing), no alerting
4. **Webhook delivery reliability**: No tracking of webhook delivery success rate

**Recommended**:
- Implement synthetic monitoring: Periodically call Shanjian getTaskInfo with a known taskId
- Track rate limit headers if Shanjian provides them
- Implement exponential backoff for task recovery when Shanjian is returning 429s
- Alert when webhook callbacks are delayed > 5 minutes

### LLM Provider Resilience

**Current State**:
- Multi-provider fallback (TheRouter → OpenAI)
- Fallback to rule-based generation if all providers fail
- No provider health tracking

**Missing**:
1. **Provider selection telemetry**: No logging of which provider was used
2. **Cost tracking**: No logging of token usage per model
3. **Latency SLOs**: No alerting when LLM latency > threshold
4. **Quota monitoring**: No tracking of API quotas (could hit rate limits without warning)

**Recommended**:
```typescript
// After successful LLM call
logger.info('LLM completion succeeded', {
  provider: provider.name,
  model: options.model,
  promptTokens: result.usage.promptTokens,
  completionTokens: result.usage.completionTokens,
  totalTokens: result.usage.totalTokens,
  durationMs: result.latencyMs,
  temperature: options.temperature
})

// Track metrics
metrics.histogram('llm.latency', result.latencyMs, { provider: provider.name, model: options.model })
metrics.increment('llm.tokens.used', result.usage.totalTokens, { provider: provider.name })
```

### Database & Redis

**Database** (MariaDB via Prisma):
- No connection pool monitoring
- No slow query logging
- No replication lag monitoring (if using replicas)

**Redis**:
- Configured with `maxRetriesPerRequest: 3` (good)
- `lazyConnect: true` (good for startup)
- No connection health checks
- No metrics on cache hit rates

---

## Deployment Issues

### Recent Deployments
**Last 2 weeks** (from git log):
- No obvious breaking changes in avatar or script generation flows
- Recent fixes: OSS transfer retry logic, mobile responsiveness, BigInt migration
- Model changes: `gpt-5.4-mini` fallback corrected to `gpt-5-mini`

**Potential Regression**:
- Line 42109d6: "fix: use env vars for Pexels/Pixabay base URLs, remove unsupported temperature param"
  - Could indicate environment variable misconfiguration in production

**Deployment Verification Gap**:
- No post-deployment smoke tests
- No canary deployments
- No rollback automation
- No deployment tracking in logs (can't correlate issues to deployments)

---

## Monitoring & Alerting Recommendations

### Priority 1: Critical Alerts (Implement within 1 week)

1. **Shanjian API Failures**
   - Alert when avatar creation fails with Shanjian errors
   - Alert when webhook processing fails repeatedly
   - Metric: `avatar.creation.failed` (by error code)
   - Threshold: > 10 failures in 5 minutes

2. **LLM Provider Failures**
   - Alert when all LLM providers fail
   - Alert when LLM latency > 30 seconds (P95)
   - Metric: `llm.provider.failed`, `llm.latency`
   - Threshold: All providers down OR P95 > 30s

3. **Database Connection Issues**
   - Alert when Prisma connection pool exhausted
   - Alert when query latency > 1 second (P95)
   - Metric: `db.connection.errors`, `db.query.latency`
   - Threshold: > 5 connection errors in 1 minute

4. **Task Recovery Stuck**
   - Alert when task recovery finds > 20 stuck avatars
   - Alert when recovery pass takes > 2 minutes
   - Metric: `task_recovery.stuck_avatars`, `task_recovery.duration`
   - Threshold: > 20 stuck tasks OR duration > 120s

### Priority 2: Operational Visibility (Implement within 2 weeks)

1. **Structured Logging**
   - Replace console.log/warn/error with structured logger (pino)
   - Add correlation IDs to all requests (middleware)
   - Add user ID, request ID to all log entries
   - Ship logs to CloudWatch/Loki/ELK

2. **Metrics Collection**
   - Implement OpenTelemetry or Prometheus client
   - Add custom metrics:
     - `avatar.creation.started`, `avatar.creation.completed`, `avatar.creation.failed`
     - `script.generation.started`, `script.generation.completed`, `script.generation.failed`
     - `shanjian.api.latency`, `shanjian.api.errors`
     - `llm.api.latency`, `llm.api.tokens`, `llm.api.errors`
   - Export to Prometheus/CloudWatch

3. **Distributed Tracing**
   - Add OpenTelemetry tracing
   - Trace spans:
     - `POST /api/avatars` → `shanjian.cloneFastAvatar` → webhook callback
     - `POST /api/scripts/generate` → LLM meta-prompt → LLM script gen → LLM scoring
   - Export to Jaeger/Honeycomb/Datadog

4. **Enhanced Healthcheck**
   - Add `/api/healthz/ready` that validates:
     - Database connectivity (simple SELECT 1)
     - Redis connectivity (PING)
     - OSS connectivity (head bucket)
   - Keep `/api/healthz` as simple liveness check
   - Update K8s readiness probe to use `/api/healthz/ready`

### Priority 3: Proactive Monitoring (Implement within 1 month)

1. **Synthetic Monitoring**
   - Periodic avatar creation test (every 15 minutes)
   - Periodic script generation test (every 10 minutes)
   - Alert if synthetic tests fail

2. **User Journey Monitoring**
   - Track end-to-end success rates:
     - Avatar creation: request → ready
     - Script generation: click → 3 scripts displayed
   - Alert when success rate drops below 95%

3. **Capacity Monitoring**
   - Track Shanjian API concurrency usage (if exposed)
   - Track LLM token usage per day (for cost control)
   - Track database connection pool utilization
   - Alert when approaching limits

4. **Dashboard Creation**
   - Grafana dashboard with:
     - Avatar creation funnel (started → processing → completed/failed)
     - Script generation latency breakdown (meta-prompt, script gen, scoring)
     - External API health (Shanjian, LLM providers)
     - Resource utilization (CPU, memory, DB connections)

---

## Incident Response Improvements

### Current State: REACTIVE
- Issues are discovered by users reporting problems
- No on-call rotation
- No runbooks for common failures
- No incident tracking system

### Recommended: PROACTIVE

1. **On-Call Setup**
   - Designate on-call engineer (rotate weekly)
   - PagerDuty/Opsgenie integration for critical alerts
   - Define escalation paths

2. **Runbooks** (create in wiki/Notion):
   - "Avatar Creation Failures: Shanjian API Down"
     - Check Shanjian status page
     - Review recent webhook failures in logs
     - Manual retry failed avatars via task recovery
   - "Script Generation Timeouts"
     - Check LLM provider status
     - Review LLM API latency metrics
     - Switch to fallback provider or rule-based generation
   - "Database Connection Pool Exhausted"
     - Check active connections
     - Restart pods if needed
     - Scale up if persistent

3. **Incident Tracking**
   - Use GitHub Issues or Jira for incident tracking
   - Post-mortem template with:
     - Timeline of events
     - Root cause analysis
     - Action items to prevent recurrence
   - Review incidents monthly

4. **Automated Remediation**
   - Auto-restart pods on repeated healthcheck failures
   - Auto-scale when CPU/memory > 80%
   - Auto-retry failed avatars via task recovery cron

---

## Immediate Action Items (This Sprint)

### For Avatar Creation Failures:
1. Add structured logging to `/api/avatars/route.ts`:
   - Log Shanjian API request payload (sanitized)
   - Log Shanjian API response time
   - Log error details with avatar ID and user ID

2. Add metric: `avatar.creation.failed` (by cloneType and errorCode)

3. Add alert: Shanjian API failures > 10 in 5 minutes

4. Enhance healthcheck to validate database connectivity

5. Review Shanjian API rate limits and add tracking

### For Script Generation Non-Response:
1. Add frontend timeout to fetch() calls (60 seconds)

2. Add structured logging to `/api/scripts/generate/route.ts`:
   - Log start/end of each pipeline step
   - Log LLM provider used and latency
   - Log fallback usage

3. Add metric: `script.generation.failed` (by failure reason)

4. Add alert: LLM provider failures > 5 in 5 minutes

5. Set `maxDuration = 120` for `/api/scripts/generate/route.ts`

6. Add user-visible loading states with timeout warnings

### Infrastructure:
1. Deploy Prometheus or OpenTelemetry Collector

2. Create initial Grafana dashboard with:
   - Request rate (by endpoint)
   - Error rate (by endpoint)
   - P95/P99 latency (by endpoint)
   - External API health (Shanjian, LLM)

3. Set up PagerDuty for critical alerts

4. Create incident response runbook (Google Doc or Notion)

---

## Long-Term Recommendations (Next Quarter)

1. **Implement Circuit Breakers**
   - Use library like `opossum` to wrap Shanjian API calls
   - Prevent cascading failures when Shanjian is down

2. **Add Request Queuing**
   - Use Redis-backed queue for avatar creation
   - Rate limit submissions to respect Shanjian concurrency limits

3. **Improve Frontend Resilience**
   - Add exponential backoff retry for transient failures
   - Add offline detection and queue requests
   - Add optimistic UI updates with rollback on failure

4. **Cost Optimization**
   - Track LLM token usage per user
   - Implement caching for repeated script generations
   - Use cheaper models for non-critical operations

5. **Compliance & Audit**
   - Log all user actions for audit trail
   - Implement data retention policies
   - Add GDPR-compliant user data export

---

## Conclusion

ClipFlow's production issues stem primarily from **lack of observability** rather than bugs in business logic. The code has good error handling patterns (try-catch, fallbacks, conditional DB updates) but lacks the instrumentation needed to detect and diagnose failures in real-time.

**Critical Path**: Implement structured logging + basic metrics + critical alerts within 1 week. This will provide the visibility needed to diagnose current issues and prevent future outages.

**Success Metrics** (30 days after implementation):
- MTTD (Mean Time To Detect): < 5 minutes for critical failures
- MTTR (Mean Time To Resolve): < 30 minutes for known failure modes
- User-reported incidents: < 2 per week (down from current unknown baseline)
- Avatar creation success rate: > 95%
- Script generation success rate: > 98%

**Next Steps**:
1. Review this analysis with engineering team
2. Prioritize action items based on impact
3. Create sprint tickets for P1 items
4. Schedule incident response training session
5. Set up on-call rotation

---

**Document Version**: 1.0
**Last Updated**: 2026-03-28
**Owner**: DevOps/SRE Team
**Next Review**: 2026-04-11 (2 weeks)
