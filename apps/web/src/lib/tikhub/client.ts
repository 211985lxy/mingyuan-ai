import { env } from "@/env"
import type { TikHubResponse } from './types'

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

const TIKHUB_BASE = env.TIKHUB_BASE_URL || 'https://api.tikhub.io'
const TIMEOUT_MS = 30_000
const MAX_RETRIES = 3
const RETRY_BASE_MS = 1_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function requireApiKey(endpoint: string): string {
  const apiKey = env.TIKHUB_API_KEY
  if (!apiKey) {
    throw new TikHubError(endpoint, null, 'TIKHUB_API_KEY environment variable is not set')
  }
  return apiKey
}

async function parseTikHubJson<T>(endpoint: string, res: Response): Promise<T> {
  if (res.status === 402) {
    throw new TikHubError(endpoint, 402, 'TikHub 账户余额不足，请联系管理员充值后重试')
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

async function withRetries<T>(endpoint: string, run: () => Promise<Response>): Promise<T> {
  let lastError: TikHubError | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(RETRY_BASE_MS * Math.pow(2, attempt - 1))

    let res: Response
    try {
      res = await run()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new TikHubError(endpoint, null, `TikHub request failed: ${message}`)
    }

    if (res.status === 429 && attempt < MAX_RETRIES) {
      lastError = new TikHubError(endpoint, 429, `TikHub ${endpoint} rate limited (429), retrying...`)
      continue
    }

    return parseTikHubJson<T>(endpoint, res)
  }

  throw lastError ?? new TikHubError(endpoint, 429, `TikHub ${endpoint} rate limited after ${MAX_RETRIES} retries`)
}

/**
 * Authenticated GET — returns TikHub envelope `data`.
 */
export async function tikhubGet<T>(
  endpoint: string,
  params: Record<string, string | number | undefined | null> = {},
): Promise<T> {
  const apiKey = requireApiKey(endpoint)
  const url = new URL(`${TIKHUB_BASE}${endpoint}`)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }

  return withRetries<T>(endpoint, () =>
    fetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }),
  )
}

/**
 * Authenticated JSON POST — returns TikHub envelope `data`.
 */
export async function tikhubPost<T>(
  endpoint: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const apiKey = requireApiKey(endpoint)
  return withRetries<T>(endpoint, () =>
    fetch(`${TIKHUB_BASE}${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }),
  )
}
