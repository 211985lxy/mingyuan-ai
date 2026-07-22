import { NextRequest, NextResponse } from "next/server"
import { parseJsonBody } from "@/lib/api-contract"
import { agentAuthErrorResponse, assertAgentProjectAccess, assertAgentScope, authenticateAgentRequest, recordAgentApiCall, type AgentApiContext } from "@/lib/agent-api-auth"
import { inspirationEventBodySchema } from "@/features/knowledge/contracts/api"
import { ingestInspirationEvent } from "@/features/topics/services/inspiration-events"
import { InspirationPipelineError } from "@/lib/inspiration-pipeline-error"
import { AGENT_SCOPE } from "@/lib/aim-remote/contracts"
import { createHash } from "node:crypto"

/**
 * Build a privacy-safe input summary for the AgentApiCallLog.
 * Stores structured metadata instead of raw message content.
 */
function buildPrivacySafeSummary(body: { platform: string; content: string }): string {
  const contentLength = body.content.length
  const urlMatch = body.content.match(/[a-z][a-z\d+.-]*:\/\/[^\s，。；、"'<>]+/i)
  const urlDomain = urlMatch ? (() => { try { return new URL(urlMatch[0]).hostname } catch { return "unknown" } })() : null
  const contentSha256 = createHash("sha256").update(body.content).digest("hex").slice(0, 16)
  return JSON.stringify({ platform: body.platform, contentLength, urlDomain, contentSha256 })
}

function inspirationEventErrorResponse(error: unknown) {
  if (error instanceof InspirationPipelineError) {
    const statusMap: Partial<Record<string, number>> = {
      BACKGROUND_TASKS_UNAVAILABLE: 503,
      INSPIRATION_PIPELINE_DISABLED: 503,
      INSPIRATION_PLATFORM_UNSUPPORTED: 400,
      INSPIRATION_PLATFORM_DISABLED: 503,
      INSPIRATION_PROJECT_FORBIDDEN: 403,
      CHANNEL_UNBOUND: 403,
      CHANNEL_DISABLED: 503,
      CHANNEL_FORBIDDEN: 403,
      TRIGGER_NOT_MATCHED: 202,
      PLATFORM_DISABLED: 503,
      RATE_LIMITED: 429,
      UNSUPPORTED_VIDEO_URL: 400,
      UNSUPPORTED_VIDEO_PLATFORM: 400,
      UNSUPPORTED_VIDEO_DIRECT_LINK: 400,
      LOCAL_URL_BLOCKED: 400,
      NO_VIDEO_URL: 400,
      MULTIPLE_VIDEO_URLS: 400,
      UNSUPPORTED_MESSAGE_TYPE: 400,
    }
    const status = statusMap[error.code] ?? 500
    return NextResponse.json({
      accepted: false,
      ignored: status === 202 || status === 429,
      error: error.userMessage || error.code,
      code: error.code,
    }, { status })
  }
  if (!(error instanceof Error)) return null
  const errors: Record<string, { status: number; error: string }> = {
    BACKGROUND_TASKS_UNAVAILABLE: { status: 503, error: "Background tasks are unavailable" },
    INSPIRATION_PIPELINE_DISABLED: { status: 503, error: "Inspiration pipeline is disabled" },
    INSPIRATION_PLATFORM_UNSUPPORTED: { status: 400, error: "Unsupported platform" },
    INSPIRATION_PLATFORM_DISABLED: { status: 503, error: "This platform is disabled" },
    INSPIRATION_PROJECT_FORBIDDEN: { status: 403, error: "Project is not available" },
    INSPIRATION_CHANNEL_UNBOUND: { status: 403, error: "Channel is not bound to an AIM project" },
    INSPIRATION_CHANNEL_FORBIDDEN: { status: 403, error: "Channel binding does not match this API key" },
    INSPIRATION_TRIGGER_NOT_MATCHED: { status: 202, error: "Message did not match the channel trigger" },
  }
  const item = errors[error.message]
  return item ? NextResponse.json({ accepted: false, ignored: item.status === 202, error: item.error }, { status: item.status }) : null
}

/**
 * @description 处理 POST 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function POST(request: NextRequest) {
  let context: AgentApiContext | null = null
  let projectId = ""
  let inputSummary = ""
  const startedAt = Date.now()
  try {
    context = await authenticateAgentRequest(request)
    assertAgentScope(context, AGENT_SCOPE.inspirationIngest)
    const body = await parseJsonBody(request, inspirationEventBodySchema, { maxBytes: 16 * 1024 })
    projectId = body.projectId
    inputSummary = buildPrivacySafeSummary(body)
    await assertAgentProjectAccess(context, body.projectId)
    const result = await ingestInspirationEvent(body, context.userId)
    await recordAgentApiCall({ context, action: "inspiration.events.ingest", projectId, inputSummary, status: "success", durationMs: Date.now() - startedAt })
    return NextResponse.json(result, { status: 202 })
  } catch (error) {
    if (context) {
      await recordAgentApiCall({ context, action: "inspiration.events.ingest", projectId, inputSummary, status: "failed", errorMessage: error instanceof Error ? error.message : String(error), durationMs: Date.now() - startedAt }).catch(() => undefined)
    }
    return agentAuthErrorResponse(error)
      ?? inspirationEventErrorResponse(error)
      ?? NextResponse.json({ error: "Inspiration event ingestion failed" }, { status: 500 })
  }
}
