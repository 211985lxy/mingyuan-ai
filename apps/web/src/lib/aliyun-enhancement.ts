import { env } from "@/env"
import { generateSignedUrl } from "@/lib/oss"

/**
 * Aliyun video enhancement is optional. The official SDK packages are not
 * always installed in this monorepo; keep a clear failure path instead of
 * soft-mocking success.
 */
export type EnhancementJobResult = {
  status: "PROCESS_SUCCESS" | "PROCESS_FAIL" | "PROCESSING" | string
  videoUrl?: string
  errorMessage?: string
  errorCode?: string
}

function enhancementUnavailable(): never {
  throw new Error(
    "[aliyun-enhancement] 4K enhancement unavailable: install @alicloud/videoenhan20200320 and @alicloud/openapi-core, then set ALIYUN_VIAPI_* credentials",
  )
}

export function createViapiClient(): never {
  enhancementUnavailable()
}

export async function submitEnhancementJob(input: {
  taskId: string
  sourceVideoUrl: string
}): Promise<{ jobId: string; requestId: string }> {
  // Keep URL signing side-effect parity for callers that expect OSS checks.
  generateSignedUrl(input.sourceVideoUrl, 7200)
  void env.ALIYUN_VIAPI_ACCESS_KEY_ID
  enhancementUnavailable()
}

export async function getEnhancementJobResult(_jobId: string): Promise<EnhancementJobResult> {
  enhancementUnavailable()
}
