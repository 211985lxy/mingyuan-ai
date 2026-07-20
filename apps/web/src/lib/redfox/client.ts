import { env } from "@/env"
/**
 * RedFox Hub 最小 HTTP 客户端。
 *
 * 设计原则：
 * - 复用现有环境变量 REDFOX_API_KEY / REDFOX_BASE_URL / REDFOX_TIMEOUT_MS
 * - 支持 POST 和 GET
 * - code !== 2000 && code !== 200 → 业务错误透传
 * - HTTP 错误 / 超时 → 抛标准化 RedFoxError
 * - 无 provider 抽象、无 orchestrator、无复杂回退链
 */

const REDFOX_BASE = env.REDFOX_BASE_URL || 'https://redfox.hk'
const TIMEOUT_MS = Number(env.REDFOX_TIMEOUT_MS || 60000)

export class RedFoxError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'RedFoxError'
  }
}

interface RedFoxEnvelope<T> {
  code?: number
  msg?: string
  data?: T
}

export interface RedFoxRequestConfig {
  /** API path，如 /story/api/dyUser/querySimilarAccounts */
  path: string
  /** HTTP method，默认 POST */
  method?: 'GET' | 'POST'
  /** POST body（method=POST 时使用） */
  body?: Record<string, unknown>
  /** GET query params（method=GET 时使用，会拼到 URL 后面） */
  params?: Record<string, string | number | undefined>
}

/**
 * 调用 RedFox API 并返回解包后的 data 字段。
 * 成功条件：HTTP 2xx 且 (code === 2000 或 code === 200) 且 data !== undefined。
 * 否则抛 RedFoxError。
 */
/**
 * @description redfoxrequest
 * @param config - 配置对象
 * @returns Promise<T>
 */
export async function redfoxRequest<T>(config: RedFoxRequestConfig): Promise<T> {
  const apiKey = process.env.REDFOX_API_KEY?.trim()
  if (!apiKey) {
    throw new RedFoxError('未配置 REDFOX_API_KEY，无法调用 RedFox API')
  }

  const { path, method = 'POST', body, params } = config
  const url = new URL(`${REDFOX_BASE}${path}`)

  if (method === 'GET' && params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value))
      }
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-API-KEY': apiKey,
  }

  const fetchOptions: RequestInit = {
    method,
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }

  if (method === 'POST' && body) {
    fetchOptions.body = JSON.stringify(body)
  }

  let res: Response
  try {
    res = await fetch(url.toString(), fetchOptions)
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new RedFoxError(`RedFox ${path} 请求超时（${TIMEOUT_MS}ms）`, err)
    }
    throw new RedFoxError(`RedFox ${path} 网络错误: ${(err as Error).message}`, err)
  }

  const json = await res.json().catch(() => null) as RedFoxEnvelope<T> | null

  if (!res.ok) {
    throw new RedFoxError(
      `RedFox ${path} HTTP 错误: ${res.status} ${res.statusText}`,
      json,
    )
  }

  if (!json || (json.code !== 2000 && json.code !== 200) || json.data === undefined) {
    throw new RedFoxError(
      json?.msg || `RedFox ${path} 业务错误 (code=${json?.code})`,
      json,
    )
  }

  return json.data
}

/** 检查 RedFox API Key 是否已配置 */
/**
 * @description 判断是否包含redfoxapikey
 * @returns boolean
 */
export function hasRedFoxApiKey(): boolean {
  return Boolean(process.env.REDFOX_API_KEY?.trim())
}

// ── 便捷方法 ──

/** POST 请求快捷方式 */
/**
 * @description redfoxpost
 * @param path - 路径
 * @param body - 请求体
 * @returns Promise<T>
 */
export function redfoxPost<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  return redfoxRequest<T>({ path, method: 'POST', body })
}

/** GET 请求快捷方式 */
/**
 * @description redfoxget
 * @param path - 路径
 * @param params? - params?
 * @returns Promise<T>
 */
export function redfoxGet<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  return redfoxRequest<T>({ path, method: 'GET', params })
}
