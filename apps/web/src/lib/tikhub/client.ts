import { env } from "@/env"
import type { TikHubResponse } from './types'

// ─── Error ──────────────────────────────────────────────

export class TikHubError extends Error {
  constructor(
    public readonly endpoint: string,
    public readonly statusCode: number | null,
    message: string,
  ) {
    super(message)
    this.name = 'TikHubError'
  }
}

// ─── Config ─────────────────────────────────────────────

const TIKHUB_BASE = env.TIKHUB_BASE_URL || 'https://api.tikhub.io'
const TIMEOUT_MS = 30_000
const MAX_RETRIES = 3
const RETRY_BASE_MS = 1_000 // 1s -> 2s -> 4s

function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)) }

// ─── Core Request Function ───────────────────────────────

/**
 * Make an authenticated GET request to the TikHub API.
 * - Adds Bearer token from TIKHUB_API_KEY env var
 * - Times out after 30 seconds
 * - Throws TikHubError on HTTP failure or non-200 API code
 * - Returns the typed `data` field from the response envelope
 */
/**
 * @description tikhubget
 * @param endpoint - 端点
 * @param params - 参数对象
 * @returns Promise<T>
 */
export async function tikhubGet<T>(
  endpoint: string,
  params: Record<string, string | number | undefined | null> = {},
): Promise<T> {
  const url = new URL(`${TIKHUB_BASE}${endpoint}`)

  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(k, String(v))
    }
  }

  const apiKey = env.TIKHUB_API_KEY
  if (!apiKey) {
    throw new TikHubError(endpoint, null, 'TIKHUB_API_KEY environment variable is not set')
  }

  let lastError: TikHubError | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // 指数退避：429 时等待 1s -> 2s -> 4s
    if (attempt > 0) {
      await sleep(RETRY_BASE_MS * Math.pow(2, attempt - 1))
    }

    let res: Response
    try {
      res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new TikHubError(endpoint, null, `TikHub request failed: ${message}`)
    }

    // 429 限流：指数退避重试
    if (res.status === 429 && attempt < MAX_RETRIES) {
      lastError = new TikHubError(endpoint, 429, `TikHub ${endpoint} rate limited (429), retrying...`)
      continue
    }

    // 402 余额不足：不重试，直接抛出带明确提示的错误
    if (res.status === 402) {
      throw new TikHubError(
        endpoint,
        402,
        'TikHub 账户余额不足，请联系管理员充值后重试',
      )
    }

    if (!res.ok) {
      throw new TikHubError(
        endpoint,
        res.status,
        `TikHub ${endpoint} failed: HTTP ${res.status} ${res.statusText}`,
      )
    }

    const json: TikHubResponse<T> = await res.json()

    if (json.code !== 200 || json.data === null || json.data === undefined) {
      throw new TikHubError(
        endpoint,
        json.code,
        `TikHub ${endpoint} returned error: ${json.message} (code: ${json.code})`,
      )
    }

    return json.data
  }

  throw lastError ?? new TikHubError(endpoint, 429, `TikHub ${endpoint} rate limited after ${MAX_RETRIES} retries`)
}
