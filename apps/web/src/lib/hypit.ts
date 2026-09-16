/**
 * Hypit 渲染服务客户端（`services/hypit-renderer`）。
 *
 * 定位：这是 AIM 出片链路里的**第四个 provider**（前三个见 `chanjing` / `shanjian` /
 * `heygen`），但它和那三家有本质区别——Hypit 不是外部 SaaS，而是我们自己部署的
 * **单租户渲染后端**（见 `services/hypit-renderer/README.md`）。由此带来两个设计后果：
 *
 * 1. **不走 webhook**。渲染服务在我们自己的内网，没必要为此暴露公网回调端点。
 *    状态由 `lib/task-recovery/video-polling.ts` 的既有轮询机制推进。
 * 2. **产物要自己搬**。上游三家的 `videoUrl` 指向它们的 CDN；Hypit 的产物躺在渲染
 *    服务的导出目录里，必须导出并转存 OSS 才能给出稳定的 `videoUrl`。转存走
 *    `uploadBufferToOss`，**不能**用 `transferFromUrl`——后者带 SSRF 防护，会拒绝内网地址。
 *
 * ── 许可边界（改本文件前必读） ────────────────────────────────────────────
 * Hypit 采用**修改版 Apache-2.0**。它允许「作为本组织自营应用的渲染后端」，
 * 明确禁止**多租户运营**与**商业再分发**。因此本客户端只服务本组织内部站点，
 * 不提供按客户隔离的能力，也不得转售渲染能力。完整的许可条文与推导见
 * `services/hypit-renderer/app/hypit_cli.py` 模块头与仓库根
 * `明动AIM-Hypit渲染服务线上集成方案-*.md`。
 *
 * ── 安全 ─────────────────────────────────────────────────────────────────
 * - `HYPIT_API_TOKEN` 是渲染服务的服务端内部共享 token，**只在服务端使用，绝不下发浏览器**。
 * - 渲染服务地址由 `HYPIT_RENDERER_URL` 注入，不硬编码，也不回显给客户端。
 *
 * ── 文件分工（单文件 ≤500 行的架构门禁） ──────────────────────────────────
 * - `hypit-client.ts`：传输层（鉴权 / 超时 / 埋点 / HypitError / 三个开关）
 * - `hypit-deliverables.ts`：产物导出与 OSS 转存
 * - 本文件：对外 API 面（提交 / 查询 / 状态映射），并转出上面两处，调用方 import 不变。
 */

import {
  DEFAULT_POLL_TIMEOUT_MS,
  HypitError,
  QUERY_TIMEOUT_MS,
  SUBMIT_TIMEOUT_MS,
  call,
  log,
  sleep,
} from "./hypit-client"
import type { HypitDeliverable } from "./hypit-ratio"

// 传输层与产物导出已按门禁拆成独立模块；这里转出，保持既有 `@/lib/hypit` 导入路径不变。
export {
  HypitError,
  isHypitConfigured,
  isHypitEnabled,
  isHypitShadowMode,
} from "./hypit-client"
export {
  downloadOutput,
  exportNamedOutputToOss,
  exportTargetOutputsToOss,
} from "./hypit-deliverables"

// ─── 契约类型（对齐 services/hypit-renderer/app/schemas.py 与 routers） ───

export type HypitJobStatus =
  | "queued"
  | "submitting"
  | "submitted"
  | "failed"

export type HypitJob = {
  jobId: string
  state: string
  buildId: string | null
  source: string
  title: string | null
  createdAt: string
  updatedAt: string
  error: { code?: string; message?: string } | null
  note: string | null
}

export type HypitOutput = {
  name: string
  type?: string
  kind?: string
  /** 目标产物（`hypit build` 的 target）。三比例即三个 target。 */
  target?: boolean
  mediaType?: string
  size?: number
}

// 三比例的分派规则是纯函数，单独放 `hypit-ratio.ts`；这里转出以保持调用方 import 不变。
export type { HypitAspectRatio, HypitDeliverable } from "./hypit-ratio"
export { inferHypitAspectRatio, sortDeliverables } from "./hypit-ratio"

export type HypitBuildFacts = {
  id: string
  title?: string | null
  createdAt?: string
  finishedAt?: string
  outcome?: string
  targets?: string[]
  /** `hypit status` 的 work 段：state=done 且 outcome=complete 才算成功。 */
  work?: { state?: string; outcome?: string }
  result?: { state?: string; outputCount?: number }
  outputs?: HypitOutput[]
}

/**
 * 形状刻意与 `HeygenTaskResult` 对齐（`status` 联合 + 其余字段全可选）。
 *
 * 不要改成判别联合（discriminated union）：`getVideoTaskStatusForProvider` 的返回
 * 类型是各家结果的联合，任何一家收窄成判别联合，都会让 `video-polling` /
 * `demo-polling` 这类调用方在访问 `result` / `errorCode` 时编译失败。
 */
export type HypitTaskResult = {
  status: "processing" | "succeed" | "failed"
  progress?: number
  result?: {
    videoUrl?: string
    coverUrl?: string
    duration?: number
    /** 全部目标产物（三比例）。`videoUrl` 是其中的首选那条。 */
    outputs?: HypitDeliverable[]
  }
  errorCode?: string
  errorMessage?: string
}

// ─── 提交 ───────────────────────────────────────────────

/**
 * 把一段源文本落盘到渲染服务工作区，并**顺便校验**它。
 *
 * 走 `POST /api/v1/checks`（`hypit check`）：它名义上是「只校验不执行」，但和
 * `/builds` 一样会先把 `content` 写进工作区，并在响应里回 `source` 文件名。
 * 模板提交正是靠这个副作用完成「上传」——渲染服务一次调用只写一个文件，而
 * `build` 需要 Run Source + Author Source 两个文件（见 `hypit-templates.ts` 的模块注释）。
 *
 * 顺便校验是好事：变量渲染出的 markup 若有问题，在这里就以 `MARKUP_*` 失败，
 * 不会浪费一次真正的渲染。
 *
 * @returns 落盘后的源文件名（相对工作区根，如 `tpl_ab12cd.svml`）
 */
export async function uploadHypitSource(input: {
  /** 源文本（Author Source `.svml`，或任意被允许的源后缀）。 */
  content: string
  /** 决定落盘后缀，须是渲染服务允许的源后缀之一。 */
  filename: string
}): Promise<string> {
  const body = await call<{ ok?: boolean; source?: string; sourceKind?: string }>(
    "/api/v1/checks",
    {
      method: "POST",
      timeoutMs: QUERY_TIMEOUT_MS,
      body: { content: input.content, filename: input.filename },
    },
  )
  const source = typeof body.source === "string" ? body.source.trim() : ""
  if (!source) {
    // 没有文件名就没法在下一步的 .svrun 里引用它，继续走下去只会更难查。
    throw new HypitError("HYPIT_BAD_RESPONSE", "渲染服务校验通过但未回传源文件名")
  }
  log.info({ source, sourceKind: body.sourceKind ?? null }, "Hypit source uploaded")
  return source
}

/**
 * 提交一个 Build。渲染服务是异步模型：`POST /builds` 只等到「buildId 已知」，
 * 不等渲染完成（默认阻塞窗口 15s，超时返回 202 + jobId）。
 *
 * 调用方拿到 `jobId` 后用 {@link waitForBuildId} 换 `buildId`。
 */
export async function submitHypitBuild(input: {
  /** 渲染服务工作区内的一条路径（`.svml` / `.svs` / `.svrun`）。与 `content` 二选一。 */
  source?: string
  /** 内联源文本，服务端会写入工作区。与 `source` 二选一。 */
  content?: string
  filename?: string
  title?: string
  /**
   * 请求侧等待 buildId 的秒数（上限 120）。
   * 渲染的重活在 Worker 里，这个窗口只覆盖 CLI 的预检与持久化提交。
   */
  waitSeconds?: number
}): Promise<HypitJob> {
  if (Boolean(input.source) === Boolean(input.content)) {
    throw new HypitError("HYPIT_INVALID_INPUT", "必须且只能提供 source 或 content 之一")
  }

  const job = await call<HypitJob>("/api/v1/builds", {
    method: "POST",
    timeoutMs: SUBMIT_TIMEOUT_MS,
    body: {
      ...(input.source ? { source: input.source } : { content: input.content }),
      ...(input.filename ? { filename: input.filename } : {}),
      ...(input.title ? { title: input.title } : {}),
      ...(input.waitSeconds !== undefined ? { wait_seconds: input.waitSeconds } : {}),
    },
  })

  if (job.state === "failed") {
    throw new HypitError(
      job.error?.code ?? "HYPIT_SUBMIT_FAILED",
      job.error?.message ?? "渲染任务提交失败",
    )
  }
  return job
}

export async function getHypitJob(jobId: string): Promise<HypitJob> {
  return call<HypitJob>(`/api/v1/jobs/${encodeURIComponent(jobId)}`)
}

/**
 * 把「提交 job」推进到「已知 buildId」。
 *
 * 渲染服务刻意把这两步分开：提交可能因为预检慢而返回 202，此时 buildId 还没生成。
 * 一旦拿到 buildId 就应把它落库（`VideoTask.externalTaskId`），后续状态由轮询推进。
 */
export async function waitForBuildId(
  jobId: string,
  timeoutMs = DEFAULT_POLL_TIMEOUT_MS,
): Promise<string> {
  const deadline = Date.now() + timeoutMs
  let delay = 1000

  for (;;) {
    const job = await getHypitJob(jobId)
    if (job.buildId) return job.buildId
    if (job.state === "failed") {
      throw new HypitError(
        job.error?.code ?? "HYPIT_SUBMIT_FAILED",
        job.error?.message ?? "渲染任务提交失败",
      )
    }
    if (Date.now() >= deadline) {
      throw new HypitError("HYPIT_SUBMIT_TIMEOUT", "渲染任务提交超时，未取得 buildId")
    }
    await sleep(Math.min(delay, Math.max(0, deadline - Date.now())))
    delay = Math.min(delay * 2, 5000)
  }
}

// ─── 查询 ───────────────────────────────────────────────

/** `hypit status` — 轻量状态查询。 */
export async function getHypitBuild(buildId: string): Promise<HypitBuildFacts> {
  const body = await call<{ build?: HypitBuildFacts }>(
    `/api/v1/builds/${encodeURIComponent(buildId)}`,
  )
  const build = body.build
  if (!build?.id) {
    throw new HypitError("HYPIT_BAD_RESPONSE", "渲染服务返回了无法解析的 build 状态")
  }
  return build
}

/** `hypit inspect` — 带 outputs 清单，用来挑目标产物。 */
export async function inspectHypitBuild(buildId: string): Promise<HypitBuildFacts> {
  const body = await call<{ build?: HypitBuildFacts }>(
    `/api/v1/builds/${encodeURIComponent(buildId)}/inspect`,
  )
  const build = body.build
  if (!build?.id) {
    throw new HypitError("HYPIT_BAD_RESPONSE", "渲染服务返回了无法解析的 build 详情")
  }
  return build
}

export async function getHypitBuildLogs(buildId: string, lines = 100): Promise<unknown> {
  return call(`/api/v1/builds/${encodeURIComponent(buildId)}/logs`, {
    params: { lines: String(lines) },
  })
}

export async function cancelHypitBuild(buildId: string, reason?: string): Promise<void> {
  await call(`/api/v1/builds/${encodeURIComponent(buildId)}/cancel`, {
    method: "POST",
    body: reason ? { reason } : {},
  })
}

/**
 * 引擎是否可用：`doctor` + `runtime status` 的合并结论。
 * 用于健康检查与上线前自检，零成本。
 */
export async function getHypitHealth(): Promise<{
  ok: boolean
  warnings: string[]
  doctor?: unknown
  runtime?: unknown
}> {
  const body = await call<{ ok?: boolean; warnings?: string[]; doctor?: unknown; runtime?: unknown }>(
    "/api/v1/health",
  )
  return {
    ok: Boolean(body.ok),
    warnings: body.warnings ?? [],
    doctor: body.doctor,
    runtime: body.runtime,
  }
}

// ─── 状态映射 ───────────────────────────────────────────

/**
 * 把渲染服务的 build 事实映射成 AIM 的 provider 结果契约
 * （形状对齐 `mapHeygenVideoToTaskResult`，便于 `getVideoTaskStatusForProvider` 统一返回）。
 *
 * 注意这里**不包含产物转存**——映射只管状态。产物的导出与上传见
 * `hypit-deliverables.ts` 的 `exportTargetOutputsToOss`，由调用方在 `complete` 之后单独执行。
 */
export function mapHypitBuildToTaskResult(build: HypitBuildFacts): HypitTaskResult {
  const work = build.work ?? {}
  const state = String(work.state ?? "")
  const outcome = String(work.outcome ?? build.outcome ?? "")

  if (state === "done") {
    if (outcome === "complete") return { status: "processing" } // 由调用方补齐 videoUrl 后转为 succeed
    return {
      status: "failed",
      errorCode: `HYPIT_RENDER_${outcome ? outcome.toUpperCase() : "FAILED"}`,
      errorMessage: "渲染未产出可用成片，请稍后重试或联系管理员",
    }
  }
  if (state === "failed") {
    return {
      status: "failed",
      errorCode: "HYPIT_RENDER_FAILED",
      errorMessage: "渲染未产出可用成片，请稍后重试或联系管理员",
    }
  }
  return { status: "processing" }
}

/** build 是否已渲染完成（可导出产物）。 */
export function isHypitBuildComplete(build: HypitBuildFacts): boolean {
  return String(build.work?.state ?? "") === "done"
    && String(build.work?.outcome ?? build.outcome ?? "") === "complete"
}
