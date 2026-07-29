import { NextRequest, NextResponse } from "next/server"

import {
  agentAuthErrorResponse,
  assertAgentProjectAccess,
  assertAgentScope,
  authenticateAgentRequest,
  recordAgentApiCall,
} from "@/lib/agent-api-auth"
import { parseJsonRecord } from "@/lib/api-contract"
import { AGENT_SCOPE } from "@/lib/aim-remote/contracts"
import { parseRunOutcomeMetadata } from "@/lib/aim/run-outcome-telemetry"
import {
  findRunOutcomeOwner,
  writeFinalRunOutcome,
} from "@/lib/aim/run-outcome-write-service"

type RouteContext = { params: Promise<{ runId: string }> }

/** Agent API terminal-disposition reporting. This records telemetry only. */
export async function POST(request: NextRequest, context: RouteContext) {
  const startedAt = Date.now()
  let agentContext: Awaited<ReturnType<typeof authenticateAgentRequest>> | null = null
  let runId = ""
  try {
    agentContext = await authenticateAgentRequest(request)
    assertAgentScope(agentContext, AGENT_SCOPE.outcomesWrite)
    runId = (await context.params).runId
    if (!runId.startsWith("run_") || runId.length > 40) {
      return NextResponse.json({ error: "Invalid runId" }, { status: 400 })
    }
    const body = await parseJsonRecord(request, { maxBytes: 16 * 1024 })
    const outcome = parseRunOutcomeMetadata({ ...body, channel: "api" })
    if (!outcome) {
      return NextResponse.json({ error: "Invalid RunOutcomeMetadata" }, { status: 400 })
    }

    const owner = await findRunOutcomeOwner(runId)
    if (!owner || owner.userId !== agentContext.userId || !owner.projectId) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 })
    }
    await assertAgentProjectAccess(agentContext, owner.projectId)

    const result = await writeFinalRunOutcome({
      runId,
      userId: agentContext.userId,
      channel: "api",
      outcome,
    })
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.code === "RUN_NOT_FOUND" ? 404 : 400 },
      )
    }
    await recordAgentApiCall({
      context: agentContext,
      action: "aim.outcome.report",
      projectId: owner.projectId,
      inputSummary: `${outcome.workflowId}/${outcome.taskType}/${outcome.finalDisposition}`,
      status: "success",
      durationMs: Date.now() - startedAt,
    })
    return NextResponse.json(
      { ok: true, id: result.id, deduped: result.deduped },
      { status: result.deduped ? 200 : 201 },
    )
  } catch (error) {
    if (agentContext) {
      await recordAgentApiCall({
        context: agentContext,
        action: "aim.outcome.report",
        inputSummary: runId || undefined,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
      }).catch(() => undefined)
    }
    return agentAuthErrorResponse(error)
      ?? NextResponse.json(
        { error: error instanceof Error ? error.message : "Outcome reporting failed" },
        { status: 400 },
      )
  }
}
