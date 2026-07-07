# 闪剪 API 并发控制实施方案

**日期**: 2026-03-29
**背景**: 闪剪上游 API 并发限制 10 个。当前系统无全局并发控制，高峰期超出限制导致请求失败。

---

## 一、总体架构

```
用户请求 → API Route → 全局信号量检查 → [有槽位] → 闪剪 API → 回调/轮询
                                      → [无槽位] → DB 队列 (status=queued) → Cron 消费 → 闪剪 API
```

核心思路：**Redis 信号量 + DB 队列 + Cron 消费者**

- Redis 信号量：控制同时 in-flight 的闪剪请求不超过 8 个（留 2 buffer）
- DB 队列：超出时任务进 `queued` 状态，等待 Cron 消费
- Cron 消费者：每 10s 检查队列，有空位就提交

---

## 二、P0 变更清单（防止线上事故）

### 2.1 全局闪剪并发信号量

**新增文件**: `apps/web/src/lib/shanjian-semaphore.ts`

```typescript
import { redis } from "./redis"

const SEMAPHORE_KEY = "shanjian:inflight"
const MAX_CONCURRENT = 8  // 留 2 个 buffer

/**
 * 尝试获取一个闪剪提交槽位。
 * 成功返回 true，失败返回 false。
 * 使用 Redis INCR + TTL 实现。
 */
export async function acquireSlot(): Promise<boolean> {
  try {
    const current = await redis.incr(SEMAPHORE_KEY)
    // 首次设置 TTL（兜底：防止 Redis 挂掉后永久阻塞）
    if (current === 1) {
      await redis.expire(SEMAPHORE_KEY, 600) // 10 min TTL 兜底
    }
    if (current > MAX_CONCURRENT) {
      await redis.decr(SEMAPHORE_KEY)
      return false
    }
    return true
  } catch {
    // Redis 不可用时放行（降级为无控制）
    return true
  }
}

/**
 * 释放一个闪剪提交槽位。
 * 在闪剪返回结果（成功/失败）后调用。
 */
export async function releaseSlot(): Promise<void> {
  try {
    const val = await redis.decr(SEMAPHORE_KEY)
    if (val < 0) await redis.set(SEMAPHORE_KEY, "0")
  } catch {
    // ignore
  }
}

/**
 * 获取当前占用的槽位数。
 */
export async function getSlotUsage(): Promise<number> {
  try {
    const val = await redis.get(SEMAPHORE_KEY)
    return Math.max(0, parseInt(val ?? "0", 10))
  } catch {
    return 0
  }
}
```

**集成点**:

1. `shanjian.ts` 的 `submitTask()` 调用前 `acquireSlot()`
2. Webhook 处理完成后 `releaseSlot()`
3. Cron poll 发现任务完成后 `releaseSlot()`
4. 任务补偿失败路径 `releaseSlot()`

### 2.2 新增 `queued` 任务状态

**修改文件**: `apps/web/src/lib/video-task-domain.ts`

```typescript
// 新增 queued 到活跃状态列表
export const ACTIVE_VIDEO_TASK_STATUSES = ["queued", "pending", "processing"] as const;
// pending 保持原含义：已获取槽位，正在提交
// queued 新含义：等待槽位

// 新增常量
export const SUBMITTABLE_VIDEO_TASK_STATUSES = ["queued"] as const;
```

**修改文件**: `prisma/schema.prisma` — VideoTask.status 注释更新

```prisma
status String @default("pending") // queued | pending | processing | completed | failed
```

**DB 迁移**: 无实际 schema 变更（status 是 String），仅文档更新。

### 2.3 视频任务提交流程改造

**修改文件**: `apps/web/src/app/api/tasks/route.ts`

POST handler 核心逻辑变更：

```typescript
// 1. 保留现有事务逻辑（创建 VideoTask + reserve plan）
reservation = await prisma.$transaction(async (tx) => {
  // ... 现有代码不变 ...
  const videoTask = await tx.videoTask.create({
    data: {
      // ...
      status: "queued",  // ← 改为 queued（原来是 pending）
    },
  })
  return { taskId: videoTask.id, resolvedSourceTemplateId }
})

// 2. 尝试获取信号量槽位
const slotAcquired = await acquireSlot()

if (!slotAcquired) {
  // 无槽位：任务留在 queued 状态，返回 202 Accepted
  const task = await prisma.videoTask.findUnique({ where: { id: reservation.taskId } })
  return NextResponse.json(
    { data: { ...task, sourceTemplateId: reservation.resolvedSourceTemplateId } },
    { status: 202 }
  )
}

// 3. 获取到槽位：更新状态为 pending，提交到闪剪
await prisma.videoTask.update({
  where: { id: reservation.taskId },
  data: { status: "pending" },
})

// 4. 提交闪剪（现有 switch/case 逻辑不变）
try {
  switch (videoType) { /* ... 现有代码 ... */ }
  upstreamAccepted = true
  // ... finalize ...
} catch (error) {
  // 失败时释放槽位
  await releaseSlot()
  // ... 现有补偿逻辑 ...
}
```

### 2.4 队列消费 Cron

**新增文件**: `apps/web/src/app/api/cron/submit-queued/route.ts`

```typescript
// GET /api/cron/submit-queued
// 每 10s 由 K8s CronJob 调用，消费 queued 任务

export const maxDuration = 55 // 秒

export async function GET(request: Request) {
  // 1. 验证 cron secret
  // 2. 获取信号量可用槽位数
  const usage = await getSlotUsage()
  const available = MAX_CONCURRENT - usage
  if (available <= 0) return NextResponse.json({ submitted: 0 })

  // 3. 取出最多 available 条 queued 任务（按创建时间排序）
  const tasks = await prisma.videoTask.findMany({
    where: { status: "queued" },
    orderBy: { createdAt: "asc" },
    take: available,
  })

  // 4. 逐个提交
  let submitted = 0
  for (const task of tasks) {
    const slotAcquired = await acquireSlot()
    if (!slotAcquired) break

    try {
      await submitQueuedTask(task)
      submitted++
    } catch (error) {
      await releaseSlot()
      await compensateVideoTaskSubmissionFailure({
        taskId: task.id,
        errorMessage: error instanceof Error ? error.message : "队列提交失败",
      })
    }
  }

  return NextResponse.json({ submitted, total: tasks.length })
}
```

**辅助函数** `submitQueuedTask(task)`:
- 从 task.shanjianPayload 重建提交参数
- 调用对应的闪剪生成函数
- 成功后调用 `finalizeAcceptedVideoTaskSubmission()`

**问题**：queued 任务需要保存足够的上下文来重建闪剪请求。

**方案**：在 tasks/route.ts 创建任务时，将完整的闪剪提交参数保存到 `shanjianPayload` 字段：

```typescript
const videoTask = await tx.videoTask.create({
  data: {
    // ...现有字段...
    status: "queued",
    shanjianPayload: {
      // 保存重建提交所需的全部参数
      videoType,
      virtualmanId: avatar?.externalVirtualmanId,
      speakerId: avatar?.externalSpeakerId,
      styleId: resolvedStyleId,
      content: resolvedScriptContent,
      materials: planMaterials,
      packRules: planPackRules,
      processRules: effectiveProcessRules,
      speakerExtra: effectiveSpeakerExtra,
      // ... 其他 rest 参数
    } as Prisma.InputJsonValue,
  },
})
```

### 2.5 重试按钮幂等保护

**修改文件**: `apps/web/src/app/api/avatars/[id]/retry/route.ts`

```typescript
// 在 status check 之后，Shanjian 提交之前，加 Redis 去重锁
const lockKey = `avatar:retry:${avatar.id}`
const locked = await redis.set(lockKey, "1", "EX", 30, "NX")
if (!locked) {
  return NextResponse.json(
    { error: "重试请求正在处理中，请稍候" },
    { status: 429 }
  )
}

// ... 现有提交逻辑 ...

// finally 块中释放锁
await redis.del(lockKey)
```

**修改文件**: `apps/web/src/app/api/tasks/[id]/retry/route.ts`

同样加 Redis 去重锁。

### 2.6 processing 状态超时兜底

**修改文件**: `apps/web/src/lib/task-recovery.ts` (runTaskRecoveryPass)

```typescript
// 新增：超过 2 小时的 processing 任务自动标 failed
const PROCESSING_TIMEOUT_MS = 2 * 60 * 60 * 1000 // 2 hours

const zombieVideoTasks = await prisma.videoTask.findMany({
  where: {
    status: "processing",
    updatedAt: { lt: new Date(now.getTime() - PROCESSING_TIMEOUT_MS) },
  },
  take: 20,
})

for (const task of zombieVideoTasks) {
  await settleVideoTaskFailure({
    taskId: task.id,
    errorCode: "PROCESSING_TIMEOUT",
    errorMessage: "视频生成超时（超过 2 小时），请重试",
    source: "recovery",
  })
  await releaseSlot() // 释放信号量
}
```

同样为 Avatar 加超时：

```typescript
// 超过 1 小时的 cloning 状态标 failed
const AVATAR_CLONING_TIMEOUT_MS = 60 * 60 * 1000

const zombieAvatars = await prisma.avatar.findMany({
  where: {
    status: "cloning",
    updatedAt: { lt: new Date(now.getTime() - AVATAR_CLONING_TIMEOUT_MS) },
  },
  take: 20,
})

for (const avatar of zombieAvatars) {
  await prisma.avatar.update({
    where: { id: avatar.id },
    data: {
      status: "failed",
      errorCode: "CLONING_TIMEOUT",
      errorMessage: "数字人克隆超时（超过 1 小时），请重试",
    },
  })
}
```

### 2.7 闪剪 429 错误前端友好提示

**修改文件**: 视频详情页 `videos/[id]/page.tsx`

```typescript
const friendlyHint = errorMessage.includes("并发") || errorMessage.includes("排队")
  ? "系统当前繁忙，您的任务将自动排队处理。"
  : errorMessage.includes("timeout") || errorMessage.includes("超时")
    ? "视频生成服务响应超时，通常重试即可解决。"
    : // ...existing...
```

**修改文件**: 创建页 `create/page.tsx` — 处理 202 响应

```typescript
const task = await createVideoTask(taskParams)
if (task.status === "queued") {
  toast.info("系统繁忙，您的任务已排队，将自动处理")
} else {
  toast.success("视频任务已提交，正在生成中")
}
```

---

## 三、P1 变更清单（提升体验）

### 3.1 数字人/声音克隆并发控制

Avatar 和 Voice 克隆也使用同一个信号量：

```typescript
// avatars/route.ts POST
const slotAcquired = await acquireSlot()
if (!slotAcquired) {
  // 标记 avatar 为特殊等待状态或直接返回友好错误
  return NextResponse.json(
    { error: "系统繁忙，请稍后再试" },
    { status: 503 }
  )
}

try {
  // ... 现有闪剪调用 ...
} finally {
  // 注意：avatar 克隆是异步的，槽位应在 webhook 回来时释放
  // 不在这里 releaseSlot()
}
```

**关键问题**：视频/Avatar/Voice 共享 10 个并发槽。信号量需要区分"提交槽位"和"结果等待"。

**方案**：闪剪的并发限制是"同时 in-progress 的任务数"，不是"HTTP 请求并发"。因此：
- `acquireSlot()` 在**提交到闪剪**时调用
- `releaseSlot()` 在**闪剪返回最终结果**（webhook/poll 确认完成/失败）时调用
- 中间等待期间槽位被占用（正确行为）

### 3.2 闪剪客户端 Retry + Backoff

**修改文件**: `apps/web/src/lib/shanjian.ts`

在 `request()` 函数中加 retry：

```typescript
async function request<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  options?: { body?: unknown; params?: Record<string, string>; timeoutMs?: number; maxRetries?: number }
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 2 // 默认重试 2 次（共 3 次）

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // ... 现有 fetch 逻辑 ...

      if (json.code !== "Succeed") {
        const mapped = ERROR_MAP[json.code]
        if (mapped) {
          // 429 可重试
          if (mapped.code === "CONCURRENCY_EXCEEDED" && attempt < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, attempt), 8000)
            await new Promise(r => setTimeout(r, delay))
            continue
          }
          throw new ShanjianError(mapped.code, mapped.message, json.requestId)
        }
        // ...
      }

      return json.data
    } catch (error) {
      if (attempt < maxRetries && isRetryableError(error)) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 8000)
        await new Promise(r => setTimeout(r, delay))
        continue
      }
      throw error
    }
  }

  throw new ShanjianError("MAX_RETRIES_EXCEEDED", "重试次数已用尽，请稍后再试")
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof ShanjianError) {
    return ["CONCURRENCY_EXCEEDED", "SHANJIAN_TIMEOUT"].includes(error.code)
  }
  return false
}
```

### 3.3 前端排队状态展示

**修改文件**: `videos/page.tsx` — 新增 queued 状态配置

```typescript
const statusConfig = {
  // ...existing...
  queued: {
    label: "排队中",
    className: "bg-blue-100 text-blue-700 border-blue-200",
    pulse: true,
  },
}
```

**修改文件**: `videos/[id]/page.tsx` — queued 状态页面

```typescript
if (task.status === "queued") {
  return (
    <div>
      {/* 返回按钮 */}
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
        <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center">
          <Clock className="h-8 w-8 text-blue-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold">排队等候中</h2>
          <p className="text-sm text-muted-foreground mt-1">
            系统繁忙，您的任务已排队，将自动开始生成
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          完成后将自动刷新页面
        </p>
      </div>
    </div>
  )
}
```

### 3.4 提交前显示并发配额

**新增 API**: `GET /api/capacity` — 返回当前容量信息

```typescript
export const GET = withUserAuth(async (_request, { user }) => {
  const [usage, userConcurrency] = await Promise.all([
    getSlotUsage(),
    checkConcurrencyLimit(user.id, user.plan ?? "free"),
  ])

  return NextResponse.json({
    data: {
      system: { used: usage, total: MAX_CONCURRENT },
      user: userConcurrency,
    },
  })
})
```

---

## 四、Webhook/Poll 中释放槽位

### 4.1 Webhook 路径

**修改文件**: `apps/web/src/app/api/webhook/shanjian/route.ts`

在 handleVideoCallback 和 handleAvatarCallback 成功/失败处理后加 `releaseSlot()`：

```typescript
async function handleVideoCallback(videoTask, taskResult) {
  if (status === "succeed") {
    await settleVideoTaskSuccess({ ... })
    await releaseSlot()  // ← 新增
  } else if (status === "failed") {
    await settleVideoTaskFailure({ ... })
    await releaseSlot()  // ← 新增
  }
  // processing 状态不释放（任务还在跑）
}
```

### 4.2 Poll 路径

**修改文件**: `apps/web/src/lib/task-recovery.ts`

在 poll 发现任务完成/失败后 `releaseSlot()`：

```typescript
// 视频任务 poll 回调
if (taskResult.status === "succeed" || taskResult.status === "failed") {
  // ... 现有结算逻辑 ...
  await releaseSlot()  // ← 新增
}
```

---

## 五、K8s CronJob 配置

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: clipflow-submit-queued
spec:
  schedule: "*/10 * * * * *"  # 每 10 秒（需用 K8s 1.27+ 的 timeZone 支持或用 Deployment + sleep loop）
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: trigger
            image: curlimages/curl:latest
            command: ["curl", "-sf", "https://app.example.com/api/cron/submit-queued?secret=$(CRON_SECRET)"]
          restartPolicy: Never
```

> 注意：K8s CronJob 最小粒度 1 分钟。如需 10s 级别，改用 Deployment + while true sleep 循环，或在 task-recovery worker 中加入队列消费逻辑。

**推荐**：在现有 `task-recovery` worker 中增加队列消费逻辑，避免新增 CronJob。

---

## 六、信号量校准机制

Redis 信号量可能因进程崩溃等原因出现偏差（只 incr 没 decr）。需要定期校准。

在 `task-recovery` worker 中增加校准逻辑：

```typescript
// 每 5 分钟校准一次
const actualInFlight = await prisma.videoTask.count({
  where: { status: "processing" },
}) + await prisma.avatar.count({
  where: { status: "cloning" },
}) + await prisma.asset.count({
  where: { assetType: "voice", status: "processing" },
})

const semaphoreValue = await getSlotUsage()
if (Math.abs(semaphoreValue - actualInFlight) > 2) {
  console.warn(`[semaphore] Drift detected: redis=${semaphoreValue}, actual=${actualInFlight}`)
  await redis.set(SEMAPHORE_KEY, String(actualInFlight))
}
```

---

## 七、变更影响范围

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `lib/shanjian-semaphore.ts` | **新增** | Redis 信号量 |
| `lib/shanjian.ts` | 修改 | 加 retry + backoff |
| `lib/video-task-domain.ts` | 修改 | 新增 queued 状态 |
| `app/api/tasks/route.ts` | 修改 | 队列化提交 |
| `app/api/cron/submit-queued/route.ts` | **新增** | 队列消费 |
| `app/api/avatars/[id]/retry/route.ts` | 修改 | 幂等锁 |
| `app/api/tasks/[id]/retry/route.ts` | 修改 | 幂等锁 |
| `app/api/webhook/shanjian/route.ts` | 修改 | releaseSlot |
| `lib/task-recovery.ts` | 修改 | 超时兜底 + 信号量校准 + 队列消费 |
| `lib/rate-limit.ts` | 修改 | 包含 queued 状态 |
| 前端 videos 页面 | 修改 | queued 状态 UI |
| 前端 create 页面 | 修改 | 202 响应处理 |

---

## 八、风险评估

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| Redis 宕机 → 信号量失效 | 中 | acquireSlot 降级放行 + 定期校准 |
| 槽位泄漏（incr 无 decr） | 中 | 5 分钟校准 + 10 分钟 TTL 兜底 |
| queued 任务等太久 | 低 | 加 queued 超时（30 分钟未提交标 failed） |
| 迁移风险 | 低 | status 是 String，无 schema 迁移 |
