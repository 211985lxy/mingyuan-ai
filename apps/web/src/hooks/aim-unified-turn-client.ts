import {
  ApiError,
  executeAimTurn,
  generateAimContent,
  type AimExecuteRequest,
  type AimExecuteResponse,
  type AimGenerateRequest,
  type AimGenerateResponse,
} from "@/lib/api/client"

function isTransientGenerateFailure(error: unknown): boolean {
  if (!(error instanceof ApiError)) {
    return error instanceof TypeError || (error instanceof Error && /fetch failed|network|Failed to fetch/i.test(error.message))
  }
  return error.status === 408 || error.status === 502 || error.status === 503 || error.status === 504
}

async function withTransientRetry<T>(run: () => Promise<T>, signal: AbortSignal): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await run()
    } catch (error) {
      lastError = error
      if (signal.aborted || attempt === 1 || !isTransientGenerateFailure(error)) throw error
      await new Promise((resolve) => setTimeout(resolve, 600))
    }
  }
  throw lastError
}

/** 创作台成稿主路径：走 /api/aim/generate，保留 workflow / 快通道 / 容错解析。 */
export async function generateAimContentWithTransientRetry(
  body: AimGenerateRequest,
  signal: AbortSignal,
): Promise<AimGenerateResponse> {
  return withTransientRetry(() => generateAimContent(body, signal), signal)
}

export async function executeAimTurnWithTransientRetry(
  body: AimExecuteRequest,
  signal: AbortSignal,
): Promise<AimExecuteResponse> {
  return withTransientRetry(() => executeAimTurn(body, signal), signal)
}
