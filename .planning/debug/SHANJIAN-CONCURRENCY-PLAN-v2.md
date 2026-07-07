# 闪剪 API 并发控制实施方案 v2

**日期**: 2026-03-29
**版本**: v2（融合四方评审意见）
**核心原则**: 用户永远不会因后台并发限制看到报错。用户可以接受排队，但不可以接受报错。

---

## 一、总体架构

```
用户提交视频 → DB 创建任务 (status=queued, 保存完整 payload)
            → 尝试获取槽位 → [有] → 提交闪剪 → 回调/轮询 → 完成
                           → [无] → 返回 202, 前端显示"等待中"
                                  → Worker 每轮检查 → 有空位 → 提交闪剪
```

**三个基础设施组件**：

1. **Redis 信号量**（Lua 脚本原子操作）：控制 in-flight ≤ 8
2. **DB 队列**（VideoTask status=queued + shanjianPayload）：持久化排队
3. **Worker 消费**（复用 task-recovery worker）：15s 间隔消费队列

**关键设计决策**（吸收评审意见）：

- `releaseSlot()` 内聚到 settle 函数内部，基于 `updateMany.count > 0` 判断，杜绝 double release
- 信号量用 Lua 脚本保证原子性，无 TTL（靠校准兜底）
- Redis 不可用时 fallback DB count，不盲目放行
- `ACTIVE_VIDEO_TASK_STATUSES` 包含 queued，新增 `IN_FLIGHT_STATUSES` 仅 pending+processing 用于校准
- 抽出 `submitToShanjian()` 共用函数，创建和 Worker 共用
- 前端三态文案区分：等待中 / 准备中 / 生成中

---

## 二、变更清单

### 2.1 Redis 信号量（Lua 脚本版）

**新增文件**: `apps/web/src/lib/shanjian-semaphore.ts`

```typescript
import { redis } from "./redis"
import { prisma } from "./prisma"

const SEMAPHORE_KEY = "shanjian:inflight"
const MAX_CONCURRENT = parseInt(process.env.SHANJIAN_MAX_CONCURRENT ?? "8", 10)

// Lua 脚本：原子性 acquire
// 检查当前值 < max 才 INCR，否则返回 0
const ACQUIRE_SCRIPT = `
  local current = tonumber(redis.call('GET', KEYS[1]) or '0')
  if current < tonumber(ARGV[1]) then
    redis.call('INCR', KEYS[1])
    return 1
  end
  return 0
`

// Lua 脚本：原子性 release
// DECR 但不低于 0
const RELEASE_SCRIPT = `
  local current = tonumber(redis.call('GET', KEYS[1]) or '0')
  if current > 0 then
    redis.call('DECR', KEYS[1])
    return current - 1
  end
  return 0
`

export async function acquireSlot(): Promise<boolean> {
  try {
    const result = await redis.eval(ACQUIRE_SCRIPT, 1, SEMAPHORE_KEY, MAX_CONCURRENT)
    return result === 1
  } catch {
    // Redis 不可用 → fallback DB count
    return await acquireSlotFallback()
  }
}

export async function releaseSlot(): Promise<void> {
  try {
    await redis.eval(RELEASE_SCRIPT, 1, SEMAPHORE_KEY)
  } catch {
    // ignore, 校准机制会修正
  }
}

export async function getSlotUsage(): Promise<number> {
  try {
    const val = await redis.get(SEMAPHORE_KEY)
    return Math.max(0, parseInt(val ?? "0", 10))
  } catch {
    return 0
  }
}

/** Redis 不可用时，用 DB 实际 in-flight 数量做降级判断 */
async function acquireSlotFallback(): Promise<boolean> {
  console.warn("[semaphore] Redis unavailable, falling back to DB count")
  const inFlight = await countInFlightFromDB()
  return inFlight < MAX_CONCURRENT
}

/** 从 DB 统计真正占用闪剪槽位的任务数（pending + processing + cloning voice） */
export async function countInFlightFromDB(): Promise<number> {
  const [videos, avatars, voices] = await prisma.$transaction([
    prisma.videoTask.count({ where: { status: { in: ["pending", "processing"] } } }),
    prisma.avatar.count({ where: { status: "cloning" } }),
    prisma.asset.count({ where: { assetType: "voice", status: "processing" } }),
  ])
  return videos + avatars + voices
}

/**
 * 校准：用 DB 实际值覆盖 Redis 信号量。
 * 由 task-recovery worker 每轮调用。
 */
export async function calibrateSemaphore(): Promise<void> {
  try {
    const actual = await countInFlightFromDB()
    const current = await getSlotUsage()
    if (actual !== current) {
      console.warn(`[semaphore] Calibrating: redis=${current} → actual=${actual}`)
      await redis.set(SEMAPHORE_KEY, String(actual))
    }
  } catch (error) {
    console.error("[semaphore] Calibration failed:", error)
  }
}
```

**要点**：
- Lua 脚本保证 acquire/release 原子性（架构师 + CTO 要求）
- 无 TTL（架构师要求，TTL 会导致正常运行期间信号量归零雪崩）
- Redis 降级时 fallback DB count（架构师要求，不盲目放行）
- 校准直接覆盖，不做差异阈值判断（架构师建议）
- 校准用 `$transaction` 保证三个 count 原子（测试工程师要求）
- 校准包含 pending 状态（测试工程师发现的遗漏）
- MAX_CONCURRENT 用环境变量（CTO 要求）

### 2.2 状态常量更新

**修改文件**: `apps/web/src/lib/video-task-domain.ts`

```typescript
// 活跃状态（用于并发限制计算、settlement where 条件）
export const ACTIVE_VIDEO_TASK_STATUSES = ["queued", "pending", "processing"] as const;

// 真正占用闪剪槽位的状态（用于信号量校准）
export const IN_FLIGHT_VIDEO_TASK_STATUSES = ["pending", "processing"] as const;

// 可被 Worker 消费的状态
export const QUEUED_VIDEO_TASK_STATUSES = ["queued"] as const;

// 终态（不变）
export const TERMINAL_VIDEO_TASK_STATUSES = ["completed", "failed"] as const;
```

### 2.3 releaseSlot 内聚到 settle 函数

**修改文件**: `apps/web/src/lib/video-task-settlement.ts`

```typescript
import { releaseSlot } from "./shanjian-semaphore"

export async function settleVideoTaskFailure(input: { ... }) {
  const task = await findTask(input.taskId)
  if (!task) return null
  if (isTerminalVideoTaskStatus(task.status)) return task

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.videoTask.updateMany({
      where: {
        id: input.taskId,
        status: { in: [...ACTIVE_VIDEO_TASK_STATUSES] },
      },
      data: { status: "failed", ... },
    })

    // ... plan reservation 释放逻辑 ...
    // 注意：queued 状态也需要释放 plan（产品经理 + 架构师要求）
    if (input.releasePlanReservation && task.productionPlanId
        && (task.status === "pending" || task.status === "queued")) {
      await tx.videoProductionPlan.updateMany({ ... })
    }

    return updated.count
  })

  // 只有真正发生状态变更时才释放槽位（测试工程师 + 架构师核心要求）
  // 且只有 pending/processing 状态才占了槽位，queued 没有
  if (result > 0 && (task.status === "pending" || task.status === "processing")) {
    await releaseSlot()
  }

  return findTask(input.taskId)
}

// settleVideoTaskSuccess 同理
export async function settleVideoTaskSuccess(input: { ... }) {
  // ... 现有逻辑 ...
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.videoTask.updateMany({ ... })
    return updated.count
  })

  if (result > 0) {
    await releaseSlot()
  }
  // ...
}
```

**要点**：
- releaseSlot 在 settle 内部，基于 `updateMany.count > 0`（杜绝 double release）
- queued 状态没有 acquire 过 slot，失败时不需要 release
- 调用方（webhook、poll、超时兜底）不再直接调 releaseSlot

### 2.4 抽出 submitToShanjian 共用函数

**新增文件**: `apps/web/src/lib/shanjian-submit.ts`

```typescript
import { ... } from "./shanjian"
import type { ShanjianSubmitResult } from "./shanjian"

/**
 * 根据 videoType 和 payload 提交到闪剪。
 * 由 tasks/route.ts 的 POST handler 和 Worker 的队列消费共用。
 */
export async function submitToShanjian(
  videoType: string,
  payload: Record<string, unknown>,
): Promise<ShanjianSubmitResult> {
  switch (videoType) {
    case "virtualman_broadcast":
      return generateVirtualmanBroadcast(payload as any)
    case "realman_broadcast":
      return generateRealmanBroadcast(payload as any)
    case "broadcast_mixcut":
      return generateMaterialMixcut(payload as any)
    case "news_mixcut":
      return generateNewsMixcut(payload as any)
    case "virtualman_video":
      return generateRawVideo(payload as any)
    case "custom_virtualman_broadcast":
      return generateCustomVirtualmanBroadcast(payload as any)
    case "custom_realman_broadcast":
      return generateCustomRealmanBroadcast(payload as any)
    case "custom_broadcast_mixcut":
      return generateCustomMaterialMixcut(payload as any)
    case "ai_cover":
      return generateAICover(payload as any)
    default:
      throw new Error(`Unsupported video type: ${videoType}`)
  }
}
```

### 2.5 视频任务提交流程改造

**修改文件**: `apps/web/src/app/api/tasks/route.ts`

```typescript
import { acquireSlot } from "@/lib/shanjian-semaphore"
import { submitToShanjian } from "@/lib/shanjian-submit"

export const POST = withUserAuth(async (request, { user }) => {
  // ... 现有校验、plan 加载等逻辑不变 ...

  // 构建闪剪提交 payload（无论是否立即提交都需要保存）
  const shanjianSubmitPayload: Record<string, unknown> = {
    videoType,
    styleId: resolvedStyleId,
    content: resolvedScriptContent,
    virtualmanId: avatar?.externalVirtualmanId ?? null,
    speakerId: avatar?.externalSpeakerId ?? null,
    materials: planMaterials,
    packRules: planPackRules,
    processRules: effectiveProcessRules,
    speakerExtra: effectiveSpeakerExtra,
    // rest 中的透传参数
    ...rest,
    // plan 特有的 scenes
    ...(videoType === "custom_virtualman_broadcast" && plan
      ? { scenes: [{ captions: { content: resolvedScriptContent }, materials: planMaterials || [] }] }
      : {}),
  }

  // 事务：创建任务（status=queued），保存完整 payload
  reservation = await prisma.$transaction(async (tx) => {
    // ... 现有 concurrency check, plan reserve, script resolve ...

    const videoTask = await tx.videoTask.create({
      data: {
        // ... 现有字段 ...
        status: "queued",                                    // ← 改为 queued
        shanjianPayload: shanjianSubmitPayload as Prisma.InputJsonValue,  // ← 保存完整 payload
      },
    })

    return { taskId: videoTask.id, resolvedSourceTemplateId }
  })

  // 尝试立即提交（快速路径）
  const slotAcquired = await acquireSlot()

  if (!slotAcquired) {
    // 无槽位：任务留在 queued 状态，返回 202
    const task = await prisma.videoTask.findUnique({ where: { id: reservation.taskId } })
    return NextResponse.json(
      { data: { ...task, sourceTemplateId: reservation.resolvedSourceTemplateId } },
      { status: 202 }
    )
  }

  // 有槽位：更新 pending → 提交闪剪
  await prisma.videoTask.update({
    where: { id: reservation.taskId },
    data: { status: "pending" },
  })

  try {
    const result = await submitToShanjian(videoType, shanjianSubmitPayload)
    upstreamAccepted = true
    externalTaskId = result.taskId
    shanjianPayload = result.payload

    const videoTask = await finalizeAcceptedVideoTaskSubmission({
      taskId: reservation.taskId,
      externalTaskId: externalTaskId!,
      productionPlanId: plan?.id ?? null,
      shanjianPayload,
    })

    return NextResponse.json(
      { data: { ...videoTask, sourceTemplateId: reservation.resolvedSourceTemplateId } },
      { status: 201 }
    )
  } catch (error) {
    // 注意：不再在这里手动 releaseSlot()
    // settlement 函数内部会处理
    // ... 现有补偿逻辑（compensation 内部会 release） ...
  }
})
```

**要点**：
- 任务永远先创建（queued），用户永远不会看到报错
- shanjianPayload 在创建时就保存（支持 Worker 重放）
- 有槽位走快速路径直接提交
- 无槽位返回 202，用户看到"等待中"
- 不再手动 releaseSlot，全部由 settle 内聚处理

### 2.6 Worker 队列消费（集成到 task-recovery）

**修改文件**: `apps/web/src/lib/task-recovery.ts` — runTaskRecoveryPass

在每轮 recovery pass 中增加队列消费逻辑：

```typescript
import { acquireSlot, calibrateSemaphore, getSlotUsage } from "./shanjian-semaphore"
import { submitToShanjian } from "./shanjian-submit"
import { finalizeAcceptedVideoTaskSubmission } from "./video-task-settlement"

async function consumeQueuedTasks(now: Date) {
  // 先校准信号量
  await calibrateSemaphore()

  // 检查可用槽位
  const usage = await getSlotUsage()
  const MAX = parseInt(process.env.SHANJIAN_MAX_CONCURRENT ?? "8", 10)
  const available = MAX - usage
  if (available <= 0) return 0

  // 取出最多 available 条 queued 任务（FIFO）
  const tasks = await prisma.videoTask.findMany({
    where: { status: "queued" },
    orderBy: { createdAt: "asc" },
    take: available,
  })

  let submitted = 0
  for (const task of tasks) {
    const slot = await acquireSlot()
    if (!slot) break

    try {
      // 更新为 pending
      await prisma.videoTask.update({
        where: { id: task.id, status: "queued" },  // 乐观锁
        data: { status: "pending" },
      })

      const payload = task.shanjianPayload as Record<string, unknown>
      if (!payload?.videoType) {
        throw new Error("Missing shanjianPayload for queued task")
      }

      const result = await submitToShanjian(
        payload.videoType as string,
        payload,
      )

      await finalizeAcceptedVideoTaskSubmission({
        taskId: task.id,
        externalTaskId: result.taskId,
        productionPlanId: task.productionPlanId,
        shanjianPayload: result.payload,
      })

      submitted++
      console.log(`[queue] Submitted queued task ${task.id}, externalTaskId=${result.taskId}`)
    } catch (error) {
      console.error(`[queue] Failed to submit queued task ${task.id}:`, error)
      // settlement 内部会 releaseSlot（如果状态已变为 pending）
      await compensateVideoTaskSubmissionFailure({
        taskId: task.id,
        errorMessage: error instanceof Error ? error.message : "队列提交失败，请重试",
      })
    }
  }

  return submitted
}

// 新增超时处理
async function expireZombieTasks(now: Date) {
  const PROCESSING_TIMEOUT_MS = 2 * 60 * 60 * 1000  // 2 hours
  const CLONING_TIMEOUT_MS = 60 * 60 * 1000          // 1 hour
  const QUEUED_TIMEOUT_MS = 30 * 60 * 1000            // 30 minutes

  // 超时 processing 视频任务
  const zombieVideos = await prisma.videoTask.findMany({
    where: { status: "processing", updatedAt: { lt: new Date(now.getTime() - PROCESSING_TIMEOUT_MS) } },
    take: 20,
  })
  for (const task of zombieVideos) {
    await settleVideoTaskFailure({
      taskId: task.id,
      errorCode: "PROCESSING_TIMEOUT",
      errorMessage: "视频生成超时（超过 2 小时），请重试",
      source: "recovery",
    })
  }

  // 超时 queued 任务
  const zombieQueued = await prisma.videoTask.findMany({
    where: { status: "queued", createdAt: { lt: new Date(now.getTime() - QUEUED_TIMEOUT_MS) } },
    take: 20,
  })
  for (const task of zombieQueued) {
    await settleVideoTaskFailure({
      taskId: task.id,
      errorCode: "QUEUED_TIMEOUT",
      errorMessage: "排队超时（超过 30 分钟），请重新提交",
      source: "recovery",
      releasePlanReservation: true,
    })
  }

  // 超时 avatar 克隆
  const zombieAvatars = await prisma.avatar.findMany({
    where: { status: "cloning", updatedAt: { lt: new Date(now.getTime() - CLONING_TIMEOUT_MS) } },
    take: 20,
  })
  for (const avatar of zombieAvatars) {
    await prisma.avatar.update({
      where: { id: avatar.id },
      data: { status: "failed", errorCode: "CLONING_TIMEOUT", errorMessage: "数字人克隆超时，请重试" },
    })
    // avatar 占了槽位，settle 不管 avatar，需要手动释放
    await releaseSlot()
  }
}

// 在 runTaskRecoveryPass 中调用
export async function runTaskRecoveryPass(options: { trigger: string }) {
  const now = new Date()

  // 1. 现有 recovery 逻辑（poll stale tasks）
  await recoverStaleTasks(now)

  // 2. 新增：超时兜底
  await expireZombieTasks(now)

  // 3. 新增：消费队列
  await consumeQueuedTasks(now)
}
```

**要点**：
- 复用现有 task-recovery worker（CTO 要求，不新增 CronJob）
- 每轮先校准信号量再消费（保证准确性）
- 乐观锁更新 `where: { status: "queued" }` 防并发消费
- queued 超时 30 分钟自动失败（测试工程师要求）
- avatar 超时手动 releaseSlot（因为 avatar 没有走 settle 函数）

### 2.7 重试幂等锁

**修改文件**: `apps/web/src/app/api/avatars/[id]/retry/route.ts`

```typescript
import { redis } from "@/lib/redis"

// 在 status check 之后
const lockKey = `avatar:retry:${avatar.id}`
const locked = await redis.set(lockKey, "1", "EX", 120, "NX") // 120s TTL，不 finally 删
if (!locked) {
  return NextResponse.json(
    { error: "您的重试请求正在处理中，请勿重复操作" },
    { status: 409 }
  )
}

// ... 现有提交逻辑 ...
// 不在 finally 中 del lockKey，让 TTL 自然过期（测试工程师要求，防误删他人锁）
```

**要点**：
- TTL 改 120s（覆盖 retry+backoff 最大耗时，测试工程师要求）
- 不 finally 删锁，让 TTL 自然过期（防误删，测试工程师要求）
- HTTP 409 Conflict 而非 429（产品经理建议，语义更准确）
- 文案改为"请勿重复操作"（产品经理建议）

### 2.8 前端状态展示 + Polling 修复

**修改文件**: `apps/web/src/app/(dashboard)/videos/page.tsx`

```typescript
const statusConfig = {
  completed: { label: "已完成", className: "bg-green-100 text-green-700 border-green-200" },
  processing: { label: "生成中", className: "bg-yellow-100 text-yellow-700 border-yellow-200", pulse: true },
  pending: { label: "准备中", className: "bg-yellow-100 text-yellow-700 border-yellow-200", pulse: true },
  queued: { label: "等待中", className: "bg-blue-100 text-blue-700 border-blue-200", pulse: true },
  failed: { label: "失败", className: "bg-red-100 text-red-700 border-red-200" },
}
```

三态文案（产品经理要求）：
- `queued` → "等待中"（蓝色，还没开始）
- `pending` → "准备中"（黄色，已获取槽位正在提交）
- `processing` → "生成中"（黄色，闪剪在跑）

**修改文件**: `apps/web/src/app/(dashboard)/videos/[id]/page.tsx`

Polling 条件修复（产品经理发现的功能 Bug）：

```typescript
// 修改 polling useEffect
useEffect(() => {
  if (!taskStatus || !["processing", "pending", "queued"].includes(taskStatus)) {
    return  // ← 新增 queued
  }

  // queued 状态 polling 间隔 10s（减少负载），其他 3s
  const interval = taskStatus === "queued" ? 10000 : 3000

  pollRef.current = setInterval(async () => { ... }, interval)
  return () => { if (pollRef.current) clearInterval(pollRef.current) }
}, [taskStatus, id])
```

新增 queued 状态页面：

```typescript
if (task.status === "queued") {
  return (
    <div>
      <Button variant="ghost" size="sm" onClick={() => router.push("/videos")} className="mb-6 cursor-pointer">
        <ArrowLeft className="h-4 w-4 mr-1" />返回视频列表
      </Button>
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
        <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center">
          <Clock className="h-8 w-8 text-blue-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold">等待处理中</h2>
          <p className="text-sm text-muted-foreground mt-1">
            当前使用人数较多，您的任务已排队，通常几分钟内会开始生成
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          状态变化后将自动刷新，您也可以先去做其他事情
        </p>
      </div>
    </div>
  )
}
```

**修改文件**: `apps/web/src/app/(dashboard)/create/page.tsx`

提交后处理 queued 状态：

```typescript
const task = await createVideoTask(taskParams)
setTaskId(task.id)
setTaskStatus(task.status)
localStorage.removeItem(DRAFT_KEY)

if (task.status === "queued") {
  toast.info("当前使用人数较多，您的视频已排队，将自动开始生成")
} else {
  toast.success("视频任务已提交，正在生成中")
}
```

SubmissionPolling 组件增加 queued 分支：

```typescript
// SubmissionPolling 中
{taskStatus === "queued" ? (
  <>
    <Clock className="h-5 w-5 text-blue-600" />
    <span>当前使用人数较多，您的任务正在排队中，通常几分钟内会开始生成...</span>
  </>
) : (
  <>
    <Loader2 className="h-5 w-5 animate-spin" />
    <span>AI 正在为你制作视频，通常需要 1-3 分钟...</span>
  </>
)}
```

---

## 三、Webhook/Poll 释放槽位

不再需要单独处理。`releaseSlot()` 已内聚到 `settleVideoTaskSuccess` / `settleVideoTaskFailure` 内部。

Webhook 和 Poll 只需正常调用 settle 函数即可，不需要额外调 releaseSlot。

唯一例外：Avatar/Voice 克隆的超时兜底（在 expireZombieTasks 中手动 releaseSlot）。

---

## 四、变更影响范围

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `lib/shanjian-semaphore.ts` | **新增** | Lua 脚本信号量 + 校准 + DB fallback |
| `lib/shanjian-submit.ts` | **新增** | submitToShanjian 共用函数 |
| `lib/video-task-domain.ts` | 修改 | 新增 queued + IN_FLIGHT 常量 |
| `lib/video-task-settlement.ts` | 修改 | releaseSlot 内聚 + queued plan 释放 |
| `lib/task-recovery.ts` | 修改 | 队列消费 + 超时兜底 + 信号量校准 |
| `app/api/tasks/route.ts` | 修改 | queued 初始状态 + 快速路径 + 202 |
| `app/api/avatars/[id]/retry/route.ts` | 修改 | 幂等锁 120s |
| `app/api/tasks/[id]/retry/route.ts` | 修改 | 幂等锁 120s |
| 前端 `videos/page.tsx` | 修改 | queued 状态 badge |
| 前端 `videos/[id]/page.tsx` | 修改 | queued 页面 + polling 修复 |
| 前端 `create/page.tsx` | 修改 | 202 处理 + queued toast |

**总计**: 11 个文件（2 新增 + 9 修改）

---

## 五、回滚方案

如果上线后有问题：

1. 回滚代码（git revert）
2. 运行清理命令：`UPDATE VideoTask SET status='failed', errorMessage='系统维护，请重新提交' WHERE status='queued'`
3. `DEL shanjian:inflight`（清除 Redis 信号量）
4. queued 状态在旧代码中不在 ACTIVE_VIDEO_TASK_STATUSES 内，不影响新任务创建

---

## 六、评审意见采纳清单

| 来源 | 意见 | 采纳情况 |
|------|------|----------|
| 架构师 | releaseSlot 内聚到 settle | ✅ 2.3 节 |
| 架构师 | 去掉 TTL 兜底 | ✅ 改用校准 |
| 架构师 | ACTIVE 与 IN_FLIGHT 分离 | ✅ 2.2 节 |
| 架构师 | submitToShanjian 共用函数 | ✅ 2.4 节 |
| 架构师 | Redis 降级 fallback DB | ✅ 2.1 节 |
| 架构师 | queued plan reservation 释放 | ✅ 2.3 节 |
| 产品 | queued/pending/processing 文案区分 | ✅ 等待中/准备中/生成中 |
| 产品 | polling 条件包含 queued | ✅ 2.8 节 |
| 产品 | SubmissionPolling queued 分支 | ✅ 2.8 节 |
| 产品 | 排队时间定性提示 | ✅ "通常几分钟内" |
| 测试 | double release 防护 | ✅ settle 内聚 |
| 测试 | 幂等锁 TTL 120s + 不 finally 删 | ✅ 2.7 节 |
| 测试 | 校准包含 pending + 原子查询 | ✅ 2.1 节 $transaction |
| 测试 | queued 超时实现 | ✅ 2.6 节 30 分钟 |
| CTO | Lua 脚本原子性 | ✅ 2.1 节 |
| CTO | MAX_CONCURRENT 环境变量 | ✅ 2.1 节 |
| CTO | 补充回滚方案 | ✅ 第五节 |
| 用户 | 不暴露报错，必须排队 | ✅ 核心设计原则 |
