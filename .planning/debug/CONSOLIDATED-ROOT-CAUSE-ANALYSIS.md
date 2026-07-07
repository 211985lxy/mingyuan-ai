# Consolidated Root Cause Analysis
**Date**: 2026-03-28
**Incident**: Production Issues - Avatar Creation Failures + Script Generation Non-Response

---

## Executive Summary

After comprehensive analysis by 4 expert agents (Test Engineer, System Architect, DevOps/SRE, Product Manager), we have identified the **root causes** for both production issues. The problems stem from **architectural gaps** in async operation handling, **observability deficiencies**, and **UX communication failures**.

**Severity**: HIGH - Both issues block critical user workflows
**Impact**: Users cannot create avatars or generate scripts reliably, severely degrading platform value

---

## Issue 1: Digital Human Creation Failures (数字人创建失败)

### Root Causes (Consensus from All Agents)

#### 1. **No Timeout Enforcement**
- **File**: `apps/web/src/lib/shanjian.ts`
- **Problem**: Shanjian API calls have NO timeout on submission (only 8s timeout on polling in `getTaskInfo`)
- **Impact**: If Shanjian API hangs, avatar creation hangs indefinitely
- **Evidence**: Test Engineer identified this, Architect confirmed architectural flaw, DevOps noted no timeout monitoring

#### 2. **Silent Webhook Failures**
- **Files**: `apps/web/src/app/api/webhook/shanjian/route.ts`, `apps/web/src/lib/task-recovery.ts`
- **Problem**: When webhook delivery fails, avatars stay stuck in "cloning" status for 2 minutes until cron recovery runs
- **Impact**: User sees "克隆中" indefinitely with no progress indication
- **Evidence**: All 4 agents identified this as critical gap

#### 3. **No User-Friendly Error Messages**
- **File**: `apps/web/src/app/api/avatars/route.ts` (line 149-150)
- **Problem**: Technical errors from Shanjian (errorCode, errorMessage) are stored in DB but not clearly displayed to users
- **Impact**: Users see "失败" badge but don't know WHY or HOW TO FIX
- **Evidence**: Product Manager identified 10+ error scenarios with unclear user guidance

#### 4. **No Retry Mechanism**
- **Files**: Frontend avatar management UI
- **Problem**: When avatar fails, no retry button provided. User must create entirely new avatar
- **Impact**: Wasted time, duplicate uploads, poor UX
- **Evidence**: Test Engineer noted missing recovery paths, Product Manager identified trust issues

#### 5. **Insufficient Logging**
- **File**: `apps/web/src/app/api/avatars/route.ts`
- **Problem**: ZERO console.log statements in avatar creation API route
- **Impact**: Cannot debug production issues, no observability
- **Evidence**: DevOps identified 57 scattered console.log across 24 files, none in critical paths

---

## Issue 2: Script Generation Button No Response (Agent 文案生成点击没反应)

### Root Causes (Consensus from All Agents)

#### 1. **No Frontend Timeout**
- **File**: `apps/web/src/lib/api/client.ts` (request function, line 51-83)
- **Problem**: fetch() has NO timeout, can hang indefinitely when LLM providers are slow/down
- **Impact**: UI appears frozen, user thinks button didn't work
- **Evidence**: Architect identified as architectural flaw, DevOps confirmed no timeout enforcement

#### 2. **Synchronous LLM Chain (15-60+ seconds)**
- **File**: `apps/web/src/lib/script-generator.ts` (generateScriptCandidates function)
- **Problem**: 3 sequential LLM calls (meta-prompt → script generation → scoring) with no timeout per step
- **Impact**: Total duration can exceed 60 seconds, Vercel function timeout
- **Evidence**: Architect measured typical duration, Test Engineer identified edge cases

#### 3. **Silent Degradation Mode**
- **File**: `apps/web/src/lib/script-generator.ts` (line 104-136)
- **Problem**: Falls back silently from AI → Direct → Rule-based when LLM unavailable
- **Impact**: Users get low-quality scripts without knowing why
- **Evidence**: Test Engineer identified 3-layer fallback, Product Manager noted trust impact

#### 4. **No Progress Indicators**
- **File**: `apps/web/src/app/(dashboard)/create/page.tsx` (handleGenerateScripts)
- **Problem**: Only initial spinner shown, no indication of "Step 1/3" progress during long generation
- **Impact**: User uncertain if operation is progressing or stuck
- **Evidence**: All 4 agents identified as UX gap

#### 5. **Pre-Flight Validation Errors Not Prominent**
- **File**: `apps/web/src/app/(dashboard)/create/page.tsx` (line 1372-1384)
- **Problem**: Function returns early with setTaskError() but error may not be visible in UI
- **Impact**: Button appears unresponsive when validation fails
- **Evidence**: Product Manager identified 6 early-return scenarios, Test Engineer confirmed missing toast notifications

---

## Cross-Cutting Root Causes

### 1. **No Observability Stack**
- No structured logging (winston/pino)
- No metrics collection (Prometheus/OpenTelemetry)
- No distributed tracing (correlation IDs)
- No real-time alerting (when Shanjian/LLM providers degrade)
- **Impact**: Cannot diagnose production issues proactively

### 2. **Inadequate Error Handling Philosophy**
- Errors are caught and stored but not **communicated** to users effectively
- No distinction between user errors, system issues, and third-party service failures
- No retry/recovery paths provided
- **Impact**: Poor UX, user frustration, loss of trust

### 3. **Missing Timeout Strategy**
- No consistent timeout policy across the stack
- Frontend: No timeouts
- API routes: Relies on Vercel defaults (60s for hobby, 120s for pro)
- External APIs: Inconsistent (Shanjian 0s submission/8s polling, LLM unknown)
- **Impact**: Operations can hang indefinitely

---

## Prioritized Fix Roadmap

### P0 (Immediate - Complete in This Sprint)

**Priority 1: Frontend Timeouts** (2 hours)
- Add 30s timeout to script generation fetch
- Add 10s timeout to avatar creation fetch
- Display timeout errors with retry button

**Priority 2: Comprehensive Logging** (3 hours)
- Add console.error with context to all try-catch blocks
- Include: userId, requestId, operation type, external taskId, error details
- Add to: avatar creation, script generation, webhook processing

**Priority 3: Toast Notifications** (2 hours)
- Install toast library (sonner or shadcn toast)
- Show toast on avatar creation success/failure
- Show toast on script generation success/failure
- Include action buttons (Retry, View Details)

**Priority 4: Retry Buttons** (3 hours)
- Add retry button to failed avatar cards
- Add retry button to script generation error state
- Preserve form state when retrying

**Priority 5: User-Friendly Error Messages** (3 hours)
- Create error translation layer for Shanjian errors
- Map technical errors to actionable user guidance
- Display full error context in failed avatar details

**Total P0 effort**: ~13 hours (1.5 days)

### P1 (Next Sprint - Week 1)

**Priority 6: Progress Indicators** (4 hours)
- "生成中: 第 1/3 步 - 分析结构..." for script generation
- Avatar creation progress: "上传视频中..." → "提交任务中..." → "队列中..."

**Priority 7: Status Polling** (6 hours)
- Frontend polls avatar status every 5s when status="cloning"
- Frontend polls video task status when status="processing"
- Auto-refresh when status changes

**Priority 8: API Route Timeouts** (3 hours)
- Add `export const maxDuration = 120` to script generation route
- Add 30s timeout to Shanjian clone calls
- Add per-provider timeout to LLM client (25s each)

**Priority 9: Enhanced Healthcheck** (2 hours)
- Check database connectivity
- Check Redis connectivity
- Check OSS accessibility
- Return degraded status when dependencies unavailable

**Priority 10: Basic Metrics** (4 hours)
- Add custom Next.js middleware to track:
  - `avatar.creation.success/failed` with error code dimensions
  - `script.generation.duration` histogram
  - `external.shanjian.api.duration` histogram
  - `external.llm.api.duration` by provider

**Total P1 effort**: ~19 hours (2.5 days)

### P2 (Next Sprint - Week 2)

- Structured logging with correlation IDs
- Distributed tracing (OpenTelemetry)
- Real-time alerting (email/Slack when error rate > 10%)
- Circuit breaker for Shanjian API
- Retry logic with exponential backoff
- Operations dashboard (Grafana)

---

## Success Metrics

**Immediate (P0 Fixes)**:
- Avatar creation failure rate with clear error messages: 100% (up from ~30%)
- Script generation timeout errors visible to users: 100% (up from 0%)
- Users can retry failed operations: 100% (up from 0%)

**Short-term (P1 Fixes)**:
- Time to detect production issues: < 5 minutes (down from hours/days)
- Avatar creation success rate: > 95% (measure baseline first)
- Script generation success rate: > 98% (measure baseline first)
- User-reported "no response" issues: 0

**Long-term (P2 Fixes)**:
- Mean time to resolution (MTTR): < 30 minutes
- External service failure detection: < 1 minute
- Circuit breaker activation during Shanjian outages: automatic

---

## Agent Contributions Summary

| Agent | Key Contribution |
|-------|-----------------|
| **Test Engineer** | Identified 843 lines of test scenarios, edge cases, and validation gaps |
| **System Architect** | Mapped data flow, identified timeout enforcement gaps, webhook failure modes |
| **DevOps/SRE** | Documented observability deficiencies, healthcheck inadequacies, logging gaps |
| **Product Manager** | Analyzed UX impact, defined user-friendly error requirements, recovery paths |

All analyses saved to:
- `.planning/debug/test-engineer-analysis.md`
- `.planning/debug/architect-analysis.md`
- `.planning/debug/devops-analysis.md`
- `.planning/debug/product-manager-analysis.md`

---

## Next Steps

1. ✅ Complete consolidated root cause analysis (this document)
2. ⏳ Implement P0 fixes (estimated 13 hours)
3. ⏳ Test fixes in development environment
4. ⏳ Deploy to production with monitoring
5. ⏳ Measure impact on success rates
6. ⏳ Schedule P1 fixes for next sprint
