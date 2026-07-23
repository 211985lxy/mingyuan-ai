/**
 * AimGeneration 工作流状态机（阶段 4 WP4.1）
 *
 * 单一事实源：API 与前端共用本模块。
 * 非法跳转必须显式失败，不静默成功。
 */

export const AIM_WORKFLOW_STATUSES = [
  "draft",
  "pending_review",
  "ready_to_shoot",
  "shooting",
  "editing",
  "ready_to_publish",
  "published",
  "archived",
] as const

export type AimWorkflowStatus = (typeof AIM_WORKFLOW_STATUSES)[number]

export const AIM_WORKFLOW_STATUS_LABELS: Record<AimWorkflowStatus, string> = {
  draft: "草稿",
  pending_review: "待审核",
  ready_to_shoot: "待拍摄",
  shooting: "拍摄中",
  editing: "剪辑中",
  ready_to_publish: "待发布",
  published: "已发布",
  archived: "已归档",
}

/**
 * 合法转换表。
 * - published / archived 为终态（仅允许同态 no-op 或 archived）
 * - 允许回退到 pending_review 以便人工打回
 */
export const AIM_WORKFLOW_LEGAL_TRANSITIONS: Record<AimWorkflowStatus, AimWorkflowStatus[]> = {
  draft: ["pending_review", "ready_to_shoot", "ready_to_publish", "archived"],
  pending_review: ["ready_to_shoot", "ready_to_publish", "draft", "archived"],
  ready_to_shoot: ["shooting", "ready_to_publish", "pending_review", "archived"],
  shooting: ["editing", "ready_to_publish", "ready_to_shoot", "archived"],
  editing: ["ready_to_publish", "shooting", "archived"],
  ready_to_publish: ["published", "editing", "pending_review", "archived"],
  published: ["archived"],
  archived: [],
}

export function isAimWorkflowStatus(value: unknown): value is AimWorkflowStatus {
  return typeof value === "string" && (AIM_WORKFLOW_STATUSES as readonly string[]).includes(value)
}

export function normalizeAimWorkflowStatus(value: unknown): AimWorkflowStatus {
  return isAimWorkflowStatus(value) ? value : "draft"
}

export function getAllowedWorkflowTransitions(from: AimWorkflowStatus): AimWorkflowStatus[] {
  return AIM_WORKFLOW_LEGAL_TRANSITIONS[from] ?? []
}

export function canTransitionWorkflowStatus(
  from: AimWorkflowStatus | string | null | undefined,
  to: AimWorkflowStatus | string,
): boolean {
  const current = normalizeAimWorkflowStatus(from)
  if (!isAimWorkflowStatus(to)) return false
  if (current === to) return true
  return getAllowedWorkflowTransitions(current).includes(to)
}

export interface WorkflowTransitionInput {
  from: string | null | undefined
  to: string
  publishPlatform?: string | null
  publishUrl?: string | null
}

export type WorkflowTransitionResult =
  | { ok: true; from: AimWorkflowStatus; to: AimWorkflowStatus }
  | { ok: false; error: string }

/**
 * @description 校验工作流状态转换；进入 published 必须有发布平台
 */
export function assertWorkflowTransition(input: WorkflowTransitionInput): WorkflowTransitionResult {
  if (!isAimWorkflowStatus(input.to)) {
    return { ok: false, error: `无效工作流状态：${input.to}` }
  }
  const from = normalizeAimWorkflowStatus(input.from)
  const to = input.to
  if (from === to) {
    return { ok: true, from, to }
  }
  if (!canTransitionWorkflowStatus(from, to)) {
    return {
      ok: false,
      error: `不能从「${AIM_WORKFLOW_STATUS_LABELS[from]}」直接跳到「${AIM_WORKFLOW_STATUS_LABELS[to]}」`,
    }
  }
  if (to === "published") {
    const platform = input.publishPlatform?.trim()
    if (!platform) {
      return { ok: false, error: "登记已发布时必须填写发布平台" }
    }
  }
  return { ok: true, from, to }
}
