import { NextResponse } from "next/server"

import { parseJsonRecord } from "@/lib/api-contract"
import { resolveBotByVerificationToken } from "@/lib/feishu-agent-registry"
import { parseRunOutcomeMetadata } from "@/lib/aim/run-outcome-telemetry"
import {
  findRunOutcomeOwner,
  writeFinalRunOutcome,
} from "@/lib/aim/run-outcome-write-service"

// api-inventory: auth=signed_integration
export const dynamic = "force-dynamic"

const ACTION_TO_DISPOSITION = {
  accept_first_pass: "accepted_first_pass",
  accept_after_edit: "accepted_after_edit",
  rewrite: "rewrite_requested",
  reject: "rejected",
  abandon: "abandoned",
} as const

interface FeishuOutcomeBody {
  token?: string
  open_id?: string
  user_id?: string
  open_message_id?: string
  action?: {
    value?: Record<string, unknown>
  }
}

/** Signed Feishu card callback for run outcome telemetry only. */
export async function POST(request: Request) {
  let body: FeishuOutcomeBody & { challenge?: string; type?: string }
  try {
    body = (await parseJsonRecord(request)) as FeishuOutcomeBody & {
      challenge?: string
      type?: string
    }
  } catch {
    return NextResponse.json({ error: "Invalid card callback payload" }, { status: 400 })
  }
  if (body.type === "url_verification" && body.challenge) {
    return NextResponse.json({ challenge: body.challenge })
  }
  if (!resolveBotByVerificationToken(body.token ?? "")) {
    return NextResponse.json({ error: "Unknown agent bot" }, { status: 404 })
  }
  if (!body.open_id?.trim() && !body.user_id?.trim()) {
    return NextResponse.json({ error: "Missing Feishu operator identity" }, { status: 400 })
  }

  const value = body.action?.value ?? {}
  const runId = typeof value.runId === "string" ? value.runId.trim() : ""
  const action = typeof value.action === "string" ? value.action : ""
  const mapped = ACTION_TO_DISPOSITION[action as keyof typeof ACTION_TO_DISPOSITION]
  const requestId = typeof value.requestId === "string" && value.requestId.trim()
    ? value.requestId.trim()
    : body.open_message_id?.trim()
      ? `feishu_outcome:${body.open_message_id}:${action}:${runId}`
      : ""
  const outcome = parseRunOutcomeMetadata({
    ...value,
    finalDisposition: value.finalDisposition ?? mapped,
    channel: "feishu",
    requestId,
  })
  if (!runId.startsWith("run_") || runId.length > 40 || !outcome) {
    return NextResponse.json({ error: "Invalid RunOutcomeMetadata" }, { status: 400 })
  }

  const owner = await findRunOutcomeOwner(runId)
  if (!owner?.userId) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 })
  }
  const result = await writeFinalRunOutcome({
    runId,
    userId: owner.userId,
    channel: "feishu",
    outcome,
  })
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.code === "RUN_NOT_FOUND" ? 404 : 400 },
    )
  }
  return NextResponse.json(
    { ok: true, id: result.id, deduped: result.deduped },
    { status: result.deduped ? 200 : 201 },
  )
}
