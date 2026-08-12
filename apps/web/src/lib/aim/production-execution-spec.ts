export type ProductionStatus = "not_started" | "prepared" | "queued" | "processing" | "completed" | "failed"

export interface ProductionExecutionSpec {
  schemaVersion: 1
  kind: "shooting_handoff" | "image_pack" | "video"
  adapter: "manual" | "aim_video"
  status: ProductionStatus
  sourceGenerationId: string
  externalTaskId?: string
  deliverableUrl?: string
  evidenceRef?: string
  errorMessage?: string
  updatedAt: string
}

const TRANSITIONS: Record<ProductionStatus, readonly ProductionStatus[]> = {
  not_started: ["prepared"],
  prepared: ["queued", "processing", "completed", "failed"],
  queued: ["processing", "failed"],
  processing: ["completed", "failed"],
  completed: [],
  failed: ["prepared", "queued"],
}

export function canTransitionProductionStatus(from: ProductionStatus, to: ProductionStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

export function validateProductionExecutionSpec(spec: ProductionExecutionSpec): { ok: true } | { ok: false; error: string } {
  if (!spec.sourceGenerationId.trim()) return { ok: false, error: "缺少来源内容" }
  if (spec.status === "completed" && !spec.deliverableUrl?.trim() && !spec.evidenceRef?.trim()) {
    return { ok: false, error: "完成状态必须有可访问交付物或人工交付证据" }
  }
  if (spec.status === "failed" && !spec.errorMessage?.trim()) return { ok: false, error: "失败状态必须说明原因" }
  return { ok: true }
}
