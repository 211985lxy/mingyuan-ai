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

// ─── Core Request Function ───────────────────────────────

/**
 * Make an authenticated GET request to the TikHub API.
 * - Adds Bearer token from TIKHUB_API_KEY env var
 * - Times out after 30 seconds
 * - Throws TikHubError on HTTP failure or non-200 API code
 * - Returns the typed `data` field from the response envelope
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
