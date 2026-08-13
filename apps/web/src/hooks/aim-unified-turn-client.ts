import { ApiError, executeAimTurn, type AimExecuteRequest, type AimExecuteResponse } from "@/lib/api/client"

function isTransientGenerateFailure(error: unknown): boolean {
  if (!(error instanceof ApiError)) {
    return error instanceof TypeError || (error instanceof Error && /fetch failed|network|Failed to fetch/i.test(error.message))
  }
  return error.status === 408 || error.status === 502 || error.status === 503 || error.status === 504
}

export async function executeAimTurnWithTransientRetry(
  body: AimExecuteRequest,
  signal: AbortSignal,
): Promise<AimExecuteResponse> {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await executeAimTurn(body, signal)
    } catch (error) {
      lastError = error
      if (signal.aborted || attempt === 1 || !isTransientGenerateFailure(error)) throw error
      await new Promise((resolve) => setTimeout(resolve, 600))
    }
  }
  throw lastError
}
