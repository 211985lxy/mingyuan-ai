import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { failAimTrace, type AimTraceRecorder } from "@/lib/aim-observability"
import { enforceDailyBetaLimit } from "@/lib/internal-beta-limits"
import { apiRequestErrorResponse, parseJsonRecord } from "@/lib/api-contract"
import { aimFailureHttpStatus, mapAimErrorToUserMessage, toAimFailureResponse } from "@/lib/aim-error-message"
import { AIM_GENERATE_MAX_REQUEST_BYTES } from "@/lib/aim/generate-payload-budget"
import { AIM_EXECUTION_DEADLINE_MS, runWithAimExecutionDeadline } from "@/lib/llm/execution-deadline"
import {
  executePreparedAimGeneration,
  prepareAimGenerateRequest,
  recordAimGenerationQuality,
  serializeAimGenerationRun,
} from "@/lib/aim/services/generate-request"

/** LLM 多步生成可达 1–3 分钟；与 Nginx 300s 对齐（前端等待上限见 AIM_GENERATION_CLIENT_TIMEOUT_MS=120s） */
export const maxDuration = 180

/**
 * @description 处理 POST 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function POST(request: NextRequest) {
  let trace: AimTraceRecorder | undefined
  try {
    /**
     * 整条请求共享一份 115s 预算（前端 120s 放弃）。
     *
     * 必要性：prepared 之前的阶段（项目绑定、trace 落库、辅助上下文——含对标热评的
     * 外部拉取，其自带上限默认 60s）跑在任何 deadline 之外，而 executeAimRun 会自建
     * 一份**完整**的智能体预算、并不因前置耗时而收缩。两者相加最坏可达 175s（60 + 115），
     * 已经越过前端的 120s——用户拿到的是前端放弃，而不是带错误码的可重试失败。
     *
     * 之所以敢包在入口层：execution-deadline 的嵌套语义是取更严的一层，所以 runner
     * 内层更严的智能体上限（顶级生成 115s / 其余 60s）依然生效，包一层不会把它放大。
     */
    return await runWithAimExecutionDeadline(AIM_EXECUTION_DEADLINE_MS, async () => {
      const user = await authenticateRequest(request)
      const quotaResponse = await enforceDailyBetaLimit(user.id, "aim_generate")
      if (quotaResponse) return quotaResponse

      // 对话历史会塞进 rawInput；默认 64 KiB 过严，与 chat 一样显式抬高。
      const prepared = await prepareAimGenerateRequest(
        user.id,
        await parseJsonRecord(request, { maxBytes: AIM_GENERATE_MAX_REQUEST_BYTES }),
      )
      trace = prepared.trace
      if (!prepared.ok) {
        return NextResponse.json({
          error: prepared.validationError,
          ...(prepared.errorCode ? { code: prepared.errorCode } : {}),
        }, { status: prepared.status ?? 400 })
      }

      const run = await executePreparedAimGeneration(prepared)
      await recordAimGenerationQuality(prepared.trace, run)
      return NextResponse.json(serializeAimGenerationRun(run))
    }, request.signal)
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    const contractResponse = apiRequestErrorResponse(request, error)
    if (contractResponse) return contractResponse

    console.error("[aim/generate] Error:", error)
    await failAimTrace(trace, error)
    const requestId = request.headers.get("x-request-id") || crypto.randomUUID()
    const failure = toAimFailureResponse(error, requestId)
    // 分类落在 INTERNAL_ERROR 时不下发错误码：前端把该码当作「不可重试」，而这里的
    // 兜底错误（如「正文被截断，请重试本次请求」）恰恰需要用户能再试一次。
    // 其余码照常下发，让截图报障时可以直接引用错误码（与 execute 入口对齐）。
    const isOpaque = failure.code === "INTERNAL_ERROR"
    return NextResponse.json(
      {
        error: mapAimErrorToUserMessage(error, failure.error),
        requestId,
        ...(isOpaque ? {} : { code: failure.code, recoverable: failure.recoverable }),
      },
      { status: isOpaque ? 500 : aimFailureHttpStatus(failure.code), headers: { "x-request-id": requestId } },
    )
  }
}
