import type { ProductionExecutionSpec } from "@/lib/aim/production-execution-spec"

export interface ManualProductionHandoffInput {
  sourceGenerationId: string
  kind: "shooting_handoff" | "image_pack" | "video"
  title: string
  approvedContent: string
  owner: string
  dueAt: string
}

export function createManualProductionHandoff(input: ManualProductionHandoffInput): {
  spec: ProductionExecutionSpec
  handoffText: string
} {
  const evidenceRef = `manual-handoff:${input.sourceGenerationId}`
  return {
    spec: {
      schemaVersion: 1,
      kind: input.kind,
      adapter: "manual",
      status: "prepared",
      sourceGenerationId: input.sourceGenerationId,
      evidenceRef,
      updatedAt: new Date().toISOString(),
    },
    handoffText: [
      `生产任务：${input.title}`,
      `负责人：${input.owner}`,
      `截止时间：${input.dueAt}`,
      `交接证据：${evidenceRef}`,
      "",
      "已审核内容：",
      input.approvedContent,
    ].join("\n"),
  }
}
