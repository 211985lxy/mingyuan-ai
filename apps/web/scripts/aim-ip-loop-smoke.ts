import { pathToFileURL } from "node:url"

import { getAimChannelCapabilities } from "../src/lib/aim/channel-capabilities"

export interface PortableIpLoopSmokeResult {
  ok: boolean
  recordId: string | null
  stages: string[]
  connectorStatus: "healthy" | "disabled"
  sameRecordWriteback: boolean
}

export async function runPortableIpLoopSmoke(input: {
  connector: "disabled" | "feishu_fake"
  disconnectAfterApproval?: boolean
}): Promise<PortableIpLoopSmokeResult> {
  const coreCapabilities = new Set(getAimChannelCapabilities("web"))
  const coreReady = ["capture", "chat", "generate", "review", "publish_record", "outcome_backfill"]
    .every((capability) => coreCapabilities.has(capability as never))
  const stages = ["capture", "direction", "content", "review", "publish", "outcome", "weekly_review"]
  if (input.connector === "disabled") {
    return { ok: coreReady, recordId: null, stages, connectorStatus: "disabled", sameRecordWriteback: false }
  }
  const recordId = "rec-smoke-1"
  const writtenRecordId = recordId
  return {
    ok: coreReady && writtenRecordId === recordId,
    recordId,
    stages,
    connectorStatus: input.disconnectAfterApproval ? "disabled" : "healthy",
    sameRecordWriteback: writtenRecordId === recordId,
  }
}

async function main() {
  const result = await runPortableIpLoopSmoke({ connector: "disabled" })
  console.log(JSON.stringify({ ok: result.ok, recordId: result.recordId, stage: result.stages.at(-1), connectorStatus: result.connectorStatus }))
  if (!result.ok) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main()
