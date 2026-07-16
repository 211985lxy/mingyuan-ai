import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { failAimTrace, type AimTraceRecorder } from "@/lib/aim-observability"
import { enforceDailyBetaLimit } from "@/lib/internal-beta-limits"
import {
  executePreparedAimGeneration,
  prepareAimGenerateRequest,
  recordAimGenerationQuality,
  serializeAimGenerationRun,
} from "@/lib/aim/services/generate-request"

export async function POST(request: NextRequest) {
  let trace: AimTraceRecorder | undefined
  try {
    const user = await authenticateRequest(request)
    const quotaResponse = await enforceDailyBetaLimit(user.id, "aim_generate")
    if (quotaResponse) return quotaResponse

    const prepared = await prepareAimGenerateRequest(user.id, await request.json())
    trace = prepared.trace
    if (!prepared.ok) return NextResponse.json({ error: prepared.validationError }, { status: 400 })

    const run = await executePreparedAimGeneration(prepared)
    await recordAimGenerationQuality(prepared.trace, run)
    return NextResponse.json(serializeAimGenerationRun(run))
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
