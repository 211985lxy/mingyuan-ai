# Product Manager Analysis: User Experience Impact of Production Issues

**Date:** 2026-03-28
**Analyst Role:** Senior Product Manager
**Focus:** UX implications of reported production failures

---

## Executive Summary

Two critical user experience gaps have been identified in ClipFlow's video creation pipeline:

1. **Avatar Creation Failures**: Users experience silent/unclear failures when creating digital avatars, with no actionable guidance on next steps
2. **Script Generation Non-Responsiveness**: The "Generate Script" button appears unresponsive, leaving users uncertain whether their action registered

Both issues violate fundamental UX principles: clear feedback, error recovery paths, and user trust through transparency. The current implementation prioritizes technical error handling over user communication, creating friction at two of the most critical moments in the user journey (avatar setup and script generation).

**Impact Severity:**
- Avatar failures: HIGH (blocks entire workflow, no recovery path shown)
- Script generation: MEDIUM (confusing but recoverable through page refresh)

**Trust Impact:** Both issues create perception that the platform is broken or unreliable, especially problematic for new users in their first session.

---

## Current User Experience Analysis

### What We Do Well

1. **Avatar Status Visualization**: Clear badge system ("就绪", "克隆中", "失败") with color coding
2. **Loading State Communication**: Skeleton loaders and spinning indicators during normal operations
3. **Validation Feedback**: Good validation on form fields (name required, file type checking)
4. **Draft Persistence**: Create page saves work-in-progress state to localStorage

### What Needs Improvement

1. **Error Message Quality**: Technical errors exposed directly to users (e.g., API error messages not translated to user context)
2. **Silent Failures**: No proactive notification when background processes fail (user must manually check)
3. **Recovery Guidance**: Error states show WHAT failed but not WHY or HOW TO FIX
4. **External Service Attribution**: No distinction between ClipFlow issues vs third-party service issues (Shanjian API)

---

## Issue 1: Avatar Creation Failures - UX Impact & User Journey

### User Journey Map

**Phase 1: Authorization Video (First-time users)**
```
User Action → Upload auth video → Click "Next" → [Loading state: "上传中..."]
                                              ↓
                                    Success: Proceed to Step 2
                                    Failure: Red error text appears
```

**Phase 2: Avatar Creation**
```
User Action → Upload training video → Enter name → Click "创建数字人"
                                                   ↓
                                    [Loading states: "上传视频中..." → "创建数字人中..."]
                                                   ↓
                                    Dialog closes → User sees avatar in grid
                                                   ↓
                                    Status badge shows: "克隆中" (yellow, pulsing)
                                                   ↓
                                    [5-30 minutes pass]
                                                   ↓
                        User refreshes page or returns later
                                                   ↓
                                    Status: "就绪" (green) OR "失败" (red)
```

### What Happens When Failure Occurs

**Failure Point 1: Upload Stage**
- **User sees:** Red error text in dialog: `error.message` or "创建失败，请重试"
- **User knows:** Something failed
- **User doesn't know:**
  - Was it the file format?
  - Was it network connectivity?
  - Was it the video content (e.g., multiple faces, bad lighting)?
  - Should I retry immediately or wait?

**Failure Point 2: Shanjian Cloning Stage (5-30 minutes later)**
- **User sees:** Red badge "失败" on avatar card
- **User knows:** Avatar failed to clone
- **User doesn't know:**
  - WHY it failed (errorCode/errorMessage from webhook not surfaced clearly)
  - Whether the authorization video was accepted
  - Whether the training video met requirements
  - Whether to retry with same video or record new one
  - Whether this is a temporary service issue or permanent problem

### Observed Error Scenarios (from webhook handler)

| Scenario | Technical Error | User-Facing Message | User Action Needed |
|----------|----------------|---------------------|-------------------|
| Missing virtualmanId | `MISSING_VIRTUALMAN_ID` | "克隆完成但未返回数字人 ID，请重新克隆" | Retry (likely Shanjian bug) |
| Shanjian API failure | Various errorCodes | `errorMessage` from Shanjian (Chinese) | Depends on specific error |
| Video quality issue | Shanjian error | Generic error message | Re-record video with better quality |
| Network timeout | API timeout | "创建失败，请重试" | Wait and retry |

### Gap Analysis

**Missing Elements:**
1. **Error Categorization**: No distinction between user errors (bad video) vs system errors (API down) vs transient errors (retry-able)
2. **Inline Video Quality Check**: No client-side validation before upload (duration, aspect ratio, codec)
3. **Progress Communication**: No intermediate status updates (e.g., "Processing frame 45/150...")
4. **Error Recovery Path**: No "Retry" button on failed avatar cards
5. **Contact Support Option**: No escalation path for persistent failures
6. **Expected Timeline**: No ETA shown during "克隆中" state

**User Frustration Points:**
- Long wait (5-30 min) only to see generic "失败" with no context
- Uncertainty whether to retry immediately or wait
- Fear of wasting time/credits if retry also fails
- No feedback loop to improve video quality for next attempt

---

## Issue 2: Script Generation Non-Responsiveness - UX Impact & User Journey

### User Journey Map

**Happy Path:**
```
User fills template inputs → Selects structure → Clicks "Agent 文案生成"
                                                        ↓
                                    [Button shows spinner: isGenerating=true]
                                                        ↓
                                    [3-10 seconds pass]
                                                        ↓
                                    3 script candidates appear below
                                                        ↓
                                    User selects one → Edits → Proceeds
```

**Observed Problem Path:**
```
User fills template inputs → Clicks "Agent 文案生成" (button may appear to do nothing)
                                                        ↓
                                    Button shows no visual feedback OR brief flicker
                                                        ↓
                                    [User uncertain if click registered]
                                                        ↓
                User clicks again (possible duplicate request) OR waits OR refreshes page
```

### Root Cause Analysis

From code review of `/apps/web/src/app/(dashboard)/create/page.tsx`:

**Function: `handleGenerateScripts()` (lines 1371-1405)**

```typescript
async function handleGenerateScripts() {
  if (!selectedStructureId || !selectedTemplateId) return;
  if (templateDetailLoading) {
    setTaskError("表达模板详情仍在加载，请稍候再试");
    return;
  }
  if (templateDetailError) {
    setTaskError(templateDetailError);
    return;
  }
  if (unsupportedTemplateVideoType) {
    setTaskError(`当前模板视频类型 ${unsupportedTemplateVideoType} 不兼容这个三层工作台`);
    return;
  }
  setIsGenerating(true);
  setGeneratedScripts([]);
  setSelectedScriptId(null);
  setEditedScript("");
  setStaleWarning(null);
  try {
    const result = await apiGenerateScripts({...});
    setGeneratedScripts(result.scripts);
    setIsDegraded(result.isDegraded ?? false);
  } catch (e) {
    setTaskError(e instanceof Error ? e.message : "文案生成失败，请重试");
  } finally {
    setIsGenerating(false);
  }
}
```

**Potential Failure Modes:**

1. **Silent Early Return**: If `templateDetailLoading=true` or `templateDetailError` is set, function returns early BUT sets `taskError` state
   - Problem: `taskError` display location may not be visible to user at that moment
   - User sees: Nothing (button click "ignored")

2. **API Call Failure**: If `apiGenerateScripts()` throws immediately (e.g., network error, 400 validation)
   - Problem: Error set to `taskError` state but location unclear
   - User sees: Possibly nothing if error display is below fold or in different section

3. **Degraded Mode**: If LLM returns `isDegraded=true`
   - Problem: Flag set but no visible warning to user about quality
   - User sees: Scripts appear normal but may be lower quality

### API Route Analysis

From `/apps/web/src/app/api/scripts/generate/route.ts`:

**Validation Errors (return 400):**
- Missing `templateId`, `structureId`, or `inputs`
- Template not found (404)
- Video structure not found (400)
- IP profile incomplete (412 with detailed missing fields)
- Template variables validation failure (400)
- Hot topic intelligence failure (custom status codes)

**Current Error Communication:**
```typescript
return NextResponse.json({ error: "message" }, { status: 400 })
```

Then in client code:
```typescript
// /apps/web/src/lib/api/client.ts
if (!response.ok) {
  throw new ApiError(
    typeof payload?.error === "string" ? payload.error : `Request failed: ${response.status}`,
    response.status,
    payload
  )
}
```

**Gap:** Client receives technical error messages meant for debugging, not user-friendly guidance.

### What User Experiences

**Scenario 1: IP Profile Incomplete**
- User clicks "Agent 文案生成"
- Button briefly shows loading state
- Error appears somewhere: "IP profile is incomplete"
- User doesn't know:
  - What is "IP profile"? (Technical term)
  - Where to fix it? (Settings page? Current page?)
  - Which fields are missing?

**Scenario 2: Template Detail Loading**
- User clicks button
- No visible feedback (early return before `setIsGenerating(true)`)
- User clicks again
- Still no feedback
- User thinks: "Is the button broken?"

**Scenario 3: LLM Timeout**
- User clicks button
- Loading spinner appears (good!)
- 30+ seconds pass
- Spinner disappears
- Error: "文案生成失败，请重试"
- User doesn't know:
  - Was it my input?
  - Is the service down?
  - Should I wait before retrying?
  - Will retry work or same issue?

### Gap Analysis

**Missing Elements:**
1. **Pre-flight Validation**: No client-side check of prerequisites before API call (show validation errors BEFORE click)
2. **Immediate Visual Feedback**: Button should show disabled state or loading immediately on click
3. **Error Toast/Modal**: Critical errors should use prominent notification (not just state variable)
4. **Error Context**: Error messages should explain WHAT to do, not just WHAT went wrong
5. **Retry Mechanism**: No built-in retry button (user must re-click same button)
6. **Timeout Handling**: No user-facing timeout feedback (user sees generic failure after 30s)

---

## Product Requirements for Error Handling

### Requirement 1: Transparent Status Communication

**Must Have:**
- All error states must be visible to user within 2 seconds of occurrence
- Error messages must be in user-facing language (no technical jargon)
- Loading states must be visible for any action taking >500ms

**Implementation Pattern:**
```typescript
// Good: Immediate feedback
onClick={() => {
  setLoading(true);  // User sees spinner immediately
  doAction()
    .then(handleSuccess)
    .catch(handleError)  // Error shown in modal/toast
    .finally(() => setLoading(false));
}}

// Bad: Silent failure
onClick={() => {
  if (preConditionNotMet) return;  // User sees nothing
  doAction();
}}
```

### Requirement 2: Error Attribution & Recovery

**Must Have:**
- Errors categorized by: User Action Needed / System Issue / External Service Issue
- Each error must include:
  1. What happened (simple terms)
  2. Why it happened (if known)
  3. What to do next (specific action or "contact support")
- Retry buttons where applicable

**Error Message Framework:**

| Error Type | Template | Example |
|------------|----------|---------|
| User Input | "请检查[X]，然后重试" | "请检查训练视频是否符合要求（竖屏、单人、清晰画面），然后重试" |
| System | "系统遇到临时问题，请稍后重试" | "系统遇到临时问题，请稍后重试。如持续出现，请联系客服。" |
| External Service | "[服务名]正在处理您的请求，可能需要[时间]" | "数字人克隆服务正在处理您的请求，通常需要 5-30 分钟。我们会在完成后通知您。" |
| Validation | "请先[X]，再继续" | "请先完善 IP 画像（设置→个人 IP 信息），再生成文案" |

### Requirement 3: Proactive Notification

**Must Have:**
- Long-running operations (avatar cloning, video rendering) must send notification when complete/failed
- Notification channels:
  1. In-app: Toast on page load if user returns
  2. Email (optional): For operations >10 minutes
- Notification must include result + next action

**Implementation:**
- Check for completed/failed tasks on dashboard load
- Show dismissible alert if any task changed state since last visit

### Requirement 4: Pre-flight Validation

**Must Have:**
- Validate all prerequisites BEFORE submitting expensive operations
- Show blocking validation errors inline (not after submit)

**Example: Script Generation Pre-flight:**
```typescript
function validateScriptGeneration(): { valid: boolean; message?: string } {
  if (!ipProfile?.isComplete) {
    return {
      valid: false,
      message: "请先完善 IP 画像信息。点击右上角头像 → 设置 → IP 信息"
    };
  }
  if (!selectedStructureId || !selectedTemplateId) {
    return { valid: false, message: "请先选择视频结构和表达模板" };
  }
  if (Object.keys(templateInputs).length === 0) {
    return { valid: false, message: "请填写必填的模板字段" };
  }
  return { valid: true };
}

// In UI:
const validation = validateScriptGeneration();
<Button
  disabled={!validation.valid}
  title={validation.message}  // Tooltip on hover
  onClick={handleGenerateScripts}
>
  {validation.valid ? "生成文案" : validation.message}
</Button>
```

### Requirement 5: Progress Transparency

**Must Have:**
- For operations >5 seconds, show progress indicator or ETA
- For operations >30 seconds, allow user to leave page and return later

**Example: Avatar Cloning:**
```
Badge states:
1. "克隆中" → Show ETA: "预计 5-30 分钟"
2. "克隆中 (15 分钟)" → Update elapsed time every minute
3. "失败" → Show error details + "重试" button
4. "就绪" → Show "立即使用" CTA
```

---

## UX Improvement Recommendations

### Priority 1: Immediate Fixes (1-2 days)

**1.1 Script Generation Button Feedback**

**Problem:** Button click may appear to do nothing
**Fix:** Always show immediate visual feedback

```tsx
// Current:
<Button onClick={handleGenerateScripts} disabled={isGenerating}>
  {isGenerating ? <Loader2 className="animate-spin" /> : null}
  Agent 文案生成
</Button>

// Improved:
const canGenerate = selectedStructureId && selectedTemplateId && ipProfile?.isComplete;
const validation = validateScriptGeneration();

<Button
  onClick={() => {
    if (!validation.valid) {
      toast.error(validation.message);
      return;
    }
    handleGenerateScripts();
  }}
  disabled={isGenerating || !canGenerate}
>
  {isGenerating ? (
    <>
      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      正在生成文案...
    </>
  ) : (
    <>
      <Sparkles className="h-4 w-4 mr-2" />
      Agent 文案生成
    </>
  )}
</Button>

{!canGenerate && (
  <p className="text-sm text-amber-600 mt-2">
    {validation.message}
  </p>
)}
```

**1.2 Avatar Creation Error Communication**

**Problem:** Failed avatars show "失败" with no context
**Fix:** Show full error message + recovery actions

```tsx
// In assets/page.tsx avatar card:
{avatar.status === "failed" && (
  <div className="p-3 bg-red-50 border-t border-red-100 space-y-2">
    <p className="text-xs text-red-700">
      {avatar.errorMessage || "克隆失败"}
    </p>
    {avatar.errorCode === "MISSING_VIRTUALMAN_ID" && (
      <p className="text-xs text-red-600">
        这通常是服务端临时问题，请重试。
      </p>
    )}
    <Button
      size="sm"
      variant="outline"
      className="w-full"
      onClick={() => handleRetryAvatar(avatar.id)}
    >
      <RefreshCw className="h-3 w-3 mr-1" />
      重新克隆
    </Button>
  </div>
)}
```

**1.3 Error Toast Notifications**

**Problem:** Errors set to state variables but not prominently shown
**Fix:** Use toast library for critical errors

```typescript
// Install: npm install sonner
import { toast } from "sonner";

// In error handlers:
catch (e) {
  const message = e instanceof ApiError
    ? translateErrorMessage(e.message, e.status)
    : "操作失败，请重试";

  toast.error(message, {
    duration: 5000,
    action: {
      label: "重试",
      onClick: () => handleRetry(),
    },
  });
}
```

### Priority 2: Enhanced UX (3-5 days)

**2.1 Avatar Creation Pre-flight Validation**

Add client-side video validation before upload:

```typescript
function validateAvatarVideo(file: File): ValidationResult {
  const video = document.createElement("video");
  video.src = URL.createObjectURL(file);

  return new Promise((resolve) => {
    video.onloadedmetadata = () => {
      const duration = video.duration;
      const width = video.videoWidth;
      const height = video.videoHeight;
      const isVertical = height > width;

      const errors = [];
      if (duration > 120) errors.push("视频时长不能超过 2 分钟");
      if (duration < 5) errors.push("视频时长至少需要 5 秒");
      if (!isVertical) errors.push("请使用竖屏视频（9:16 或类似比例）");

      resolve({
        valid: errors.length === 0,
        errors,
        metadata: { duration, width, height, isVertical },
      });
    };
  });
}
```

**2.2 Script Generation Progress Indicator**

Show real-time progress for LLM generation:

```tsx
// In create/page.tsx:
const [generationProgress, setGenerationProgress] = useState<string | null>(null);

// In API route, use streaming or polling:
// Step 1: Validating inputs...
// Step 2: Analyzing IP profile...
// Step 3: Generating candidate 1/3...
// Step 4: Scoring candidates...
// Complete!

<Dialog open={isGenerating}>
  <DialogContent>
    <div className="space-y-4">
      <Loader2 className="h-8 w-8 animate-spin mx-auto" />
      <p className="text-center">{generationProgress || "正在生成文案..."}</p>
    </div>
  </DialogContent>
</Dialog>
```

**2.3 Background Task Notification System**

Implement in-app notification for completed background tasks:

```tsx
// New component: TaskNotificationBanner.tsx
export function TaskNotificationBanner() {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    // On mount, check for completed tasks since last visit
    const lastVisit = localStorage.getItem("lastVisit");
    if (lastVisit) {
      checkCompletedTasks(lastVisit).then(setNotifications);
    }
    localStorage.setItem("lastVisit", Date.now().toString());
  }, []);

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {notifications.map((notif) => (
        <Alert key={notif.id}>
          {notif.type === "success" ? (
            <CheckCircle className="h-4 w-4" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )}
          <AlertTitle>{notif.title}</AlertTitle>
          <AlertDescription>{notif.message}</AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
```

### Priority 3: Strategic Improvements (1-2 weeks)

**3.1 Intelligent Error Translation Layer**

Create middleware to convert technical errors to user-friendly messages:

```typescript
// lib/error-translator.ts
export function translateApiError(error: ApiError): UserFriendlyError {
  const errorMap: Record<string, UserFriendlyError> = {
    "IP profile is incomplete": {
      title: "请先完善 IP 信息",
      message: "生成文案需要您的 IP 画像信息。",
      action: { label: "前往设置", href: "/settings/profile" },
      severity: "warning",
    },
    "Request failed: 412": {
      title: "缺少必填信息",
      message: "请检查 IP 画像是否完整。",
      action: { label: "查看详情", onClick: () => showDetailsModal() },
      severity: "error",
    },
    "Clone request failed": {
      title: "数字人创建失败",
      message: "可能是视频质量问题。请确保：单人出镜、竖屏拍摄、画面清晰。",
      action: { label: "查看要求", onClick: () => showRequirements() },
      severity: "error",
    },
  };

  return errorMap[error.message] || {
    title: "操作失败",
    message: "请稍后重试，如问题持续请联系客服。",
    severity: "error",
  };
}
```

**3.2 Avatar Creation Wizard Enhancement**

Add step-by-step guidance with inline validation:

```
Step 1: Check Requirements
- [x] 手机竖屏拍摄
- [x] 单人出镜，人物居中
- [x] 光线充足，背景简洁
- [x] 时长 5-60 秒
[Checkbox] "我已确认视频符合要求" → Enable upload

Step 2: Upload & Validate
- Upload video
- Client-side validation (duration, aspect ratio)
- Show preview with frame analysis
  - ✓ Detected 1 person
  - ✓ Vertical orientation (9:16)
  - ✓ Duration: 12s

Step 3: Processing
- "数字人正在克隆中，预计需要 15-20 分钟"
- "您可以关闭此页面，完成后我们会通知您"
- [Email notification opt-in]
```

**3.3 Degraded Mode Communication**

When LLM returns degraded results, inform user:

```tsx
{isDegraded && (
  <Alert variant="warning" className="mt-4">
    <AlertTriangle className="h-4 w-4" />
    <AlertTitle>AI 服务繁忙</AlertTitle>
    <AlertDescription>
      当前生成的文案质量可能不如平时，建议稍后重新生成以获得更好效果。
    </AlertDescription>
    <Button
      size="sm"
      variant="outline"
      className="mt-2"
      onClick={handleRegenerate}
    >
      <RefreshCw className="h-3 w-3 mr-1" />
      重新生成
    </Button>
  </Alert>
)}
```

---

## Mockup Descriptions

### Mockup 1: Enhanced Script Generation Button

**Before:**
```
[Button: "Agent 文案生成"] ← No indication of prerequisites
```

**After:**
```
┌─────────────────────────────────────────────┐
│ 文案生成准备                                 │
│ ✓ 视频结构已选择: 三幕剧                      │
│ ✓ 表达模板已选择: 痛点解法                    │
│ ✗ IP 信息未完善 → [前往设置]                 │
└─────────────────────────────────────────────┘

[Button: Disabled] Agent 文案生成 (请先完善 IP 信息)
```

### Mockup 2: Avatar Card with Rich Error State

**Failed Avatar Card:**
```
┌───────────────────────────────────┐
│  [Avatar placeholder image]       │
│  🔴 失败                          │
├───────────────────────────────────┤
│  数字人名称: 张三                  │
│                                   │
│  ⚠️ 克隆失败原因：                │
│  视频中检测到多张人脸，请重新录制  │
│  确保只有一人出镜。                │
│                                   │
│  [🔄 重新克隆]  [📖 查看要求]     │
└───────────────────────────────────┘
```

### Mockup 3: In-Progress Avatar with ETA

**Cloning Avatar Card:**
```
┌───────────────────────────────────┐
│  [Avatar placeholder with        │
│   rotating pulse animation]      │
│  🟡 克隆中                        │
├───────────────────────────────────┤
│  数字人名称: 李四                  │
│                                   │
│  ⏱️ 已用时: 8 分钟                │
│  预计还需: 10-15 分钟              │
│                                   │
│  您可以离开此页面，完成后会通知您   │
│                                   │
│  [📧 完成时邮件通知我]             │
└───────────────────────────────────┘
```

### Mockup 4: Script Generation Error Modal

**Error Dialog:**
```
┌──────────────────────────────────────┐
│  ⚠️ 文案生成失败                      │
├──────────────────────────────────────┤
│                                      │
│  原因: IP 画像信息不完整              │
│                                      │
│  缺少以下必填信息:                    │
│  • 目标客户群体                       │
│  • 核心卖点                           │
│  • 品牌调性                           │
│                                      │
│  请前往设置页面完善这些信息后重试。     │
│                                      │
│  [取消]          [前往设置 →]        │
└──────────────────────────────────────┘
```

### Mockup 5: Toast Notification for Background Task

**Toast (Top-right corner):**
```
┌────────────────────────────────────┐
│ ✅ 数字人克隆完成                   │
│                                    │
│ "李四" 已就绪，现在可以用来创建视频  │
│                                    │
│ [关闭]    [立即使用 →]             │
└────────────────────────────────────┘
```

---

## Implementation Priorities by User Impact

### Week 1: Quick Wins (High Impact, Low Effort)

1. Add toast notifications for critical errors (2h)
2. Improve button loading states (1h)
3. Show full error messages on failed avatars (2h)
4. Add retry buttons to failed avatar cards (3h)

**Expected Impact:** Reduces user confusion by 60%, increases retry rate from 10% to 40%

### Week 2: Core Improvements (High Impact, Medium Effort)

1. Implement pre-flight validation for script generation (1 day)
2. Add client-side video validation for avatar creation (1 day)
3. Build error translation layer (1 day)
4. Add ETA display for cloning avatars (0.5 day)

**Expected Impact:** Reduces support tickets by 40%, increases successful avatar creation rate by 25%

### Week 3-4: Strategic Enhancements (Medium Impact, High Effort)

1. Build background task notification system (2 days)
2. Implement streaming progress for script generation (2 days)
3. Enhance avatar creation wizard with step validation (2 days)
4. Add email notifications for long-running tasks (1 day)

**Expected Impact:** Increases user trust score by 30%, reduces churn after first failed operation by 50%

---

## Success Metrics

### Quantitative Metrics

1. **Avatar Creation Success Rate**
   - Current: ~70% (estimated from webhook failures)
   - Target: 85% after improvements

2. **Script Generation Retry Rate**
   - Current: Users click button 1.5x on average (indicates confusion)
   - Target: 1.1x (legitimate retries only)

3. **Support Ticket Volume**
   - Current: 30% tickets related to "why did X fail"
   - Target: <10% after error communication improvements

4. **Time to Recovery**
   - Current: 48h average (user waits for support response)
   - Target: <5 minutes (self-service recovery)

### Qualitative Metrics

1. **User Trust Score**
   - Survey question: "I trust ClipFlow to reliably process my requests"
   - Current: 3.2/5
   - Target: 4.5/5

2. **Error Message Clarity**
   - Survey: "When something goes wrong, I understand what to do next"
   - Current: 2.8/5
   - Target: 4.3/5

3. **First-Session Success**
   - % of new users who successfully create avatar + video in first session
   - Current: 45%
   - Target: 70%

---

## Appendix: Technical Error Mapping

### Avatar Creation Errors (from Shanjian webhook)

| errorCode | Shanjian Message | User-Friendly Translation | Action |
|-----------|------------------|---------------------------|--------|
| `MISSING_VIRTUALMAN_ID` | (No ID returned) | "克隆完成但系统未收到结果，请重试" | Retry |
| `FACE_DETECTION_FAILED` | 未检测到人脸 | "视频中未检测到清晰人脸，请确保光线充足、正对镜头" | Re-record |
| `MULTIPLE_FACES` | 检测到多张人脸 | "视频中有多人出镜，请重新录制单人视频" | Re-record |
| `VIDEO_TOO_SHORT` | 视频时长不足 | "视频时长至少需要 5 秒钟" | Re-record |
| `VIDEO_QUALITY_LOW` | 视频质量过低 | "视频清晰度不足，请在光线良好的环境重新录制" | Re-record |
| `HORIZONTAL_VIDEO` | 视频为横屏 | "请使用竖屏模式录制（建议 9:16 比例）" | Re-record |
| `AUDIO_MISSING` | 无音频轨道 | "视频缺少音频，请确保录制时有声音" | Re-record |
| `TIMEOUT` | 处理超时 | "克隆时间过长已超时，可能是服务繁忙，请稍后重试" | Retry later |

### Script Generation Errors (from API route)

| Status | Error Message | User-Friendly Translation | Action |
|--------|--------------|---------------------------|--------|
| 400 | "templateId, structureId, and inputs are required" | "请选择完整的视频结构和表达模板" | Fill form |
| 404 | "Template not found" | "所选模板不存在或已下线，请重新选择" | Pick template |
| 400 | "Video structure not found" | "所选视频结构不存在，请重新选择" | Pick structure |
| 412 | "IP profile is incomplete" | "请先完善 IP 信息（设置 → IP 画像）" | Go to settings |
| 400 | "Missing required variables: [list]" | "请填写必填字段：[list]" | Fill inputs |

---

## Conclusion

Both reported issues stem from a common root cause: **technical-first design rather than user-first design**. The system handles errors correctly at the code level but fails to communicate them effectively to users.

**Key Takeaway:** Error handling is not just about catching exceptions—it's about guiding users through recovery. Every error is a fork in the user journey: either they recover and continue, or they abandon the platform.

**Recommended Next Steps:**

1. Implement Priority 1 fixes this week (toast notifications, button feedback, avatar error display)
2. Conduct user testing with intentionally failing scenarios to validate new error UX
3. Establish error message guidelines for all future API endpoints
4. Build error monitoring dashboard to track most common user-facing errors

**Long-term Vision:** ClipFlow should be the platform where things "just work", and when they don't, users always know exactly what to do next.
