import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { executeAimRun } from "@/lib/aim-harness/runtime"
import { executeAimGenerationDomain } from "@/lib/aim-harness/domain-executor"
import { createAimTrace } from "@/lib/aim-observability"
import { apiRequestErrorResponse, parseJsonRecord } from "@/lib/api-contract"
import {
  buildInspirationGenerateResponse,
  findOwnedInspiration,
  persistInspirationGeneration,
  prepareInspirationGeneration,
} from "@/lib/aim/services/inspiration-generation"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request)
    const { id } = await params
    const body = await parseJsonRecord(request)
    const projectId = typeof body.projectId === "string" ? body.projectId.trim() : ""
    const topicTitle = typeof body.topicTitle === "string" ? body.topicTitle.trim() : undefined

    // 灵感归属隔离：findFirst 必须按 id + userId
    const inspiration = await findOwnedInspiration({ id, userId: user.id })
    if (!inspiration) {
      return NextResponse.json({ error: "灵感记录不存在" }, { status: 404 })
    }
    if (!projectId) {
      return NextResponse.json({ error: "请选择 IP 营销全案" }, { status: 400 })
    }

    const trace = await createAimTrace({
      userId: user.id,
      projectId,
      agentId: "content_producer",
      action: "generate",
      inputSummary: inspiration.content,
    })

    const runRequest = prepareInspirationGeneration({
      inspirationContent: inspiration.content,
      topicTitle,
      userId: user.id,
      projectId,
      trace,
    })
    const run = await executeAimRun(runRequest, (spec) =>
      executeAimGenerationDomain(spec, {
        userId: user.id,
        projectId,
        rawInput: inspiration.content,
        targetFormats: runRequest.targetFormats,
        taskType: "write_script",
        topicTitle,
        trace,
      }),
    )
    const result = run.output

    // 更新灵感记录，关联生成结果
    await persistInspirationGeneration({ id, result })

    return NextResponse.json(buildInspirationGenerateResponse({ result, run }))
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    const contractResponse = apiRequestErrorResponse(request, error)
    if (contractResponse) return contractResponse

    console.error("[inspiration/generate] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "文案生成失败" },
      { status: 500 }
    )
  }
}
