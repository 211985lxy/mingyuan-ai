/**
 * Hypit 渲染服务的传输层：配置、错误模型与 HTTP 调用。
 *
 * 为什么单独成文件：`hypit.ts`（API 面）与 `hypit-deliverables.ts`（产物导出）
 * 要共用同一套鉴权 / 超时 / 埋点，而仓库的架构门禁是**单文件 ≤500 行**
 * （`config/architecture-size-policy.json`，提交前 `pnpm arch:size` 强制）。
 * 合并在一起必然超限，所以按「谁离 HTTP 最近」切出这一层。
 *
 * 完整的设计背景与**许可边界**见 `hypit.ts` 的模块注释——改本文件前先读它。
 */

import { env } from "@/env"
import { logger } from "./logger"
import { externalApiDuration, externalApiRequestsTotal } from "./metrics"

export const log = logger.child({ component: "hypit" })

/** 去掉尾部斜杠，避免拼出 `//api/v1`。 */
export const RENDERER_URL = (env.HYPIT_RENDERER_URL ?? "").trim().replace(/\/+$/, "")
export const API_TOKEN = (env.HYPIT_API_TOKEN ?? "").trim()
export const TOKEN_HEADER = "X-API-Token"

/** 渲染是重资源任务，轮询比上游 SaaS 慢得多；默认给 15 分钟。 */
export const DEFAULT_POLL_TIMEOUT_MS = 15 * 60 * 1000
/** 导出是「CLI 拷贝文件 + 传回」，大视频要给足。 */
export const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000
export const SUBMIT_TIMEOUT_MS = 60 * 1000
export const QUERY_TIMEOUT_MS = 30 * 1000

export class HypitError extends Error {
  constructor(
    public code: string,
    message: string,
    public requestId?: string,
  ) {
    super(message)
    this.name = "HypitError"
  }
}

export function isHypitConfigured(): boolean {
  return Boolean(RENDERER_URL && API_TOKEN)
}

/** 总开关。默认关——新链路必须先关着合并，再按 runbook §灰度 逐级放开。 */
export function isHypitEnabled(): boolean {
  return env.HYPIT_ENABLED === "true"
}

/**
 * 影子模式：链路照跑、产物照出，但落到隔离的 OSS 前缀，不污染正式产物路径。
 *
 * 语义对齐既有 `*_SHADOW_MODE`（见 `docs/runbooks/group-video-topic-pipeline.md`：
 * 「`shadowMode=true` 时不发群消息」）——即**写入但不对外动作**。这里对应的对外动作
 * 是「产物进入正式分发路径」，因此影子期产物只落 `hypit-shadow/` 前缀。
 */
export function isHypitShadowMode(): boolean {
  return env.HYPIT_SHADOW_MODE === "true"
}

export function assertConfigured(): void {
  if (!isHypitConfigured()) {
    throw new HypitError(
      "HYPIT_NOT_CONFIGURED",
      "本机渲染服务暂未配置（缺少 HYPIT_RENDERER_URL 或 HYPIT_API_TOKEN），请联系管理员",
    )
  }
}

export type FetchOptions = {
  method?: "GET" | "POST"
  body?: unknown
  params?: Record<string, string>
  timeoutMs?: number
  /** 导出走二进制，不解析 JSON。 */
  expectJson?: boolean
}

export async function call<T>(path: string, options: FetchOptions = {}): Promise<T> {
  assertConfigured()

  const url = new URL(`${RENDERER_URL}${path}`)
  for (const [key, value] of Object.entries(options.params ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, value)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? QUERY_TIMEOUT_MS)
  const started = Date.now()
  const method = options.method ?? "GET"

  let res: Response
  try {
    res = await fetch(url.toString(), {
      method,
      headers: {
        [TOKEN_HEADER]: API_TOKEN,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    })
  } catch (error) {
    clearTimeout(timeout)
    externalApiDuration.observe({ service: "hypit", endpoint: path }, (Date.now() - started) / 1000)
    externalApiRequestsTotal.inc({ service: "hypit", endpoint: path, status: "network_error" })
    if (error instanceof Error && error.name === "AbortError") {
      throw new HypitError("HYPIT_TIMEOUT", "本机渲染服务响应超时，请稍后重试")
    }
    // 渲染服务不可达是部署问题，不是用户输入问题；包成明确 code 便于归因。
    throw new HypitError("HYPIT_UNREACHABLE", "本机渲染服务当前不可达，请联系管理员")
  }

  clearTimeout(timeout)
  externalApiDuration.observe({ service: "hypit", endpoint: path }, (Date.now() - started) / 1000)

  if (!res.ok) {
    // 渲染服务的错误体统一为 { error, code, message, stdout?, stderr? }（见 app/main.py 的异常处理器）。
    // stderr 是引擎自己的输出，原样带出——那才是真实失败原因。
    const detail = await safeJson<{ code?: string; message?: string; stderr?: string }>(res)
    const code = detail?.code ?? `HTTP_${res.status}`
    externalApiRequestsTotal.inc({ service: "hypit", endpoint: path, status: code })
    log.warn({ path, method, status: res.status, code }, "Hypit renderer error")
    throw new HypitError(code, detail?.message ?? `渲染服务请求失败（HTTP ${res.status}）`)
  }

  externalApiRequestsTotal.inc({ service: "hypit", endpoint: path, status: "ok" })
  return (await res.json()) as T
}

export async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T
  } catch {
    return null
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
