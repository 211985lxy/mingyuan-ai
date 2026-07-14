import { parseJsonBody } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { parseGenerateBody, validateGenerateInput } from "@/lib/aim-generate-validate"
import {
  addAimTraceStep,
  createAimTrace,
  failAimTrace,
  runAimTraceStep,
  summarizeText,
  type AimTraceRecorder,
} from "@/lib/aim-observability"
import { enforceDailyBetaLimit } from "@/lib/internal-beta-limits"
import { ownsActiveProject } from "@/lib/resource-ownership"
import { aimGenerateBodySchema } from "@/features/aim/contracts/api"
import {
  executePreparedAimGeneration,
  prepareAimGenerationContext,
  recordAimGenerationQuality,
} from "@/features/aim/services/generate-content"

export async function POST(request: NextRequest) {
  let trace: AimTraceRecorder | undefined
  try {
    const user = await authenticateRequest(request)
    const quotaResponse = await enforceDailyBetaLimit(user.id, "aim_generate")
    if (quotaResponse) return quotaResponse

    const body = await parseJsonBody(request, aimGenerateBodySchema, { maxBytes: 256 * 1024 })
    const parsed = parseGenerateBody(body)
    if (parsed.projectId && !(await ownsActiveProject(user.id, parsed.projectId))) {
      return NextResponse.json({ error: "IP 营销全案不存在或已归档" }, { status: 404 })
    }
    const requestTrace = await createAimTrace({
      userId: user.id,
      projectId: parsed.projectId || null,
      agentId: parsed.agentId || null,
      action: "generate",
      inputSummary: parsed.rawInput,
    })
    trace = requestTrace
    await addAimTraceStep(requestTrace, {
      key: "parse_request",
      label: "请求解析",
      status: "success",
      summary: "生成请求已解析",
      inputSummary: summarizeText(body),
      metadata: { agentId: parsed.agentId, targetFormats: parsed.targetFormats },
    })

    const validationError = await runAimTraceStep(
      requestTrace,
      "validate_input",
      "输入校验",
      () => validateGenerateInput(parsed),
      (error) => ({ summary: error ? "校验失败" : "校验通过", error: error || undefined }),
    )
    if (validationError) {
      await failAimTrace(requestTrace, validationError)
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    const generationContext = await prepareAimGenerationContext({
      userId: user.id,
      parsed,
      trace: requestTrace,
    })
    const run = await executePreparedAimGeneration({
      userId: user.id,
      parsed,
      trace: requestTrace,
      context: generationContext,
    })

    const result = run.output
    await recordAimGenerationQuality(requestTrace, run)

    return NextResponse.json({
      ...result,
      runId: run.metadata.runId,
      degraded: run.metadata.degraded,
      provider: run.metadata.provider,
      model: run.metadata.model,
      qualityStatus: run.qualityStatus,
      qualityChecks: run.qualityChecks,
      qualityReport: run.qualityReport,
    })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse

    console.error("[aim/generate] Error:", error)
    await failAimTrace(trace, error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "生成失败" },
      { status: 500 }
    )
  }
}
