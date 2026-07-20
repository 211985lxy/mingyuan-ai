/**
 * Business Loop 的代码版本化契约。
 *
 * 本模块只描述业务编排边界，不执行模型、不连接飞书，也不定义第二套状态机。
 */
import type { WorkItemWorkflow } from "@/lib/aim-feishu-work-item"

export const BUSINESS_LOOP_IDS = [
  "sales-diagnosis-v1",
  "content-growth-v1",
  "consulting-delivery-v1",
] as const

export type BusinessLoopId = (typeof BUSINESS_LOOP_IDS)[number]

export const LOOP_OPERATING_MODES = [
  "shadow",
  "assisted",
  "supervised_auto",
  "low_risk_auto",
] as const

export type LoopOperatingMode = (typeof LOOP_OPERATING_MODES)[number]

export type BusinessLoopTrigger =
  | "manual_approved"
  | "work_item_ready"
  | "meeting_completed"
  | "todo_card_scheduled"

export const LOOP_STEP_IDS = [
  "validate_input",
  "load_context",
  "extract_insight",
  "verify_output",
  "persist_result",
  "submit_review",
  "notify_supervisor",
  "create_memory_candidates",
] as const

export type LoopStepId = (typeof LOOP_STEP_IDS)[number]

export interface LoopStepSpec {
  id: LoopStepId
  name: string
  tool: string
}

export interface LoopBudgetPolicy {
  maxRunsPerWorkItem: number
  maxEstimatedInputTokens: number
  maxOutputTokens: number
  maxProviderAttempts: number
  maxAutoRetries: number
}

export interface LoopSupervisionPolicy {
  defaultMode: LoopOperatingMode
  requireStartApproval: boolean
  requireFinalReview: boolean
  allowExternalSideEffects: boolean
  budget: LoopBudgetPolicy
}

export interface LoopModelPolicy {
  temperature: number
}

export interface BusinessLoopSpec {
  id: BusinessLoopId
  version: number
  workflow: WorkItemWorkflow
  goal: {
    deliverables: string[]
    doneWhen: string[]
  }
  trigger: BusinessLoopTrigger
  steps: LoopStepSpec[]
  allowedTools: string[]
  verificationPolicy: string
  memoryPolicy: "none" | "candidate_after_approval"
  stopPolicy: {
    executionTimeoutMs: number
    requireHumanReview: boolean
  }
  modelPolicy: LoopModelPolicy
  supervisionPolicy: LoopSupervisionPolicy
}

export interface LoopExecutionContext {
  workItemRecordId: string
  projectId: string
  ownerUserId: string
  loopId: BusinessLoopId
  loopVersion: number
  operatingMode: LoopOperatingMode
  idempotencyKey: string
  inputFingerprint: string
  startApprovedBy?: string
  startApprovedAt?: string
}

export type LoopVerificationStatus = "pass" | "needs_human" | "fail"

export interface LoopVerificationResult {
  status: LoopVerificationStatus
  checks: Array<{
    id: string
    passed: boolean
    critical: boolean
    detail: string
  }>
  evidenceRefs: string[]
  summary: string
  nextAction: string
}

export type LoopStopReason =
  | "goal_reached"
  | "approval_required"
  | "missing_input"
  | "duplicate_suppressed"
  | "token_budget_exceeded"
  | "verification_failed"
  | "execution_timeout"
  | "retry_exhausted"
  | "human_required"
  | "external_side_effect_blocked"

export type LoopContractErrorReason =
  | "unknown_loop"
  | "invalid_loop_id"
  | "invalid_version"
  | "duplicate_step"
  | "duplicate_tool"
  | "unauthorized_tool"
  | "invalid_budget"
  | "invalid_contract"

export class LoopContractError extends Error {
  readonly reason: LoopContractErrorReason

  constructor(reason: LoopContractErrorReason, message: string) {
    super(message)
    this.name = "LoopContractError"
    this.reason = reason
  }
}

const WORKFLOWS: readonly WorkItemWorkflow[] = ["内容增长", "销售诊断", "咨询交付"]
const TRIGGERS: readonly BusinessLoopTrigger[] = [
  "manual_approved",
  "work_item_ready",
  "meeting_completed",
  "todo_card_scheduled",
]
const MEMORY_POLICIES: readonly BusinessLoopSpec["memoryPolicy"][] = [
  "none",
  "candidate_after_approval",
]

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function requirePositiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new LoopContractError("invalid_budget", `${field} 必须为正整数。`)
  }
  return value
}

function requireNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new LoopContractError("invalid_budget", `${field} 必须为非负整数。`)
  }
  return value
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new LoopContractError("invalid_contract", `${field} 必须为非空字符串。`)
  }
  return value
}

function validateStringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new LoopContractError("invalid_contract", `${field} 必须为非空数组。`)
  }
  return value.map((item, index) => requireNonEmptyString(item, `${field}[${index}]`))
}

function validateBudget(value: unknown): void {
  if (!isPlainObject(value)) {
    throw new LoopContractError("invalid_budget", "supervisionPolicy.budget 必须为对象。")
  }
  requirePositiveInteger(value.maxRunsPerWorkItem, "maxRunsPerWorkItem")
  requirePositiveInteger(value.maxEstimatedInputTokens, "maxEstimatedInputTokens")
  requirePositiveInteger(value.maxOutputTokens, "maxOutputTokens")
  requirePositiveInteger(value.maxProviderAttempts, "maxProviderAttempts")
  requireNonNegativeInteger(value.maxAutoRetries, "maxAutoRetries")
}

function validateSupervisionPolicy(value: unknown): void {
  if (!isPlainObject(value)) {
    throw new LoopContractError("invalid_contract", "supervisionPolicy 必须为对象。")
  }
  if (!LOOP_OPERATING_MODES.includes(value.defaultMode as LoopOperatingMode)) {
    throw new LoopContractError("invalid_contract", "supervisionPolicy.defaultMode 非法。")
  }
  for (const field of ["requireStartApproval", "requireFinalReview", "allowExternalSideEffects"] as const) {
    if (typeof value[field] !== "boolean") {
      throw new LoopContractError("invalid_contract", `supervisionPolicy.${field} 必须为布尔值。`)
    }
  }
  validateBudget(value.budget)
}

function validateModelPolicy(value: unknown): void {
  if (!isPlainObject(value)) {
    throw new LoopContractError("invalid_contract", "modelPolicy 必须为对象。")
  }
  if (typeof value.temperature !== "number" || !Number.isFinite(value.temperature) || value.temperature < 0 || value.temperature > 2) {
    throw new LoopContractError("invalid_budget", "modelPolicy.temperature 必须在 0 到 2 之间。")
  }
}

function validateSteps(value: unknown, allowedTools: Set<string>): void {
  if (!Array.isArray(value) || value.length === 0) {
    throw new LoopContractError("invalid_contract", "steps 必须为非空数组。")
  }
  const stepIds = new Set<string>()
  for (const [index, step] of value.entries()) {
    if (!isPlainObject(step)) {
      throw new LoopContractError("invalid_contract", `steps[${index}] 必须为对象。`)
    }
    const id = requireNonEmptyString(step.id, `steps[${index}].id`)
    requireNonEmptyString(step.name, `steps[${index}].name`)
    const tool = requireNonEmptyString(step.tool, `steps[${index}].tool`)
    if (!LOOP_STEP_IDS.includes(id as LoopStepId)) {
      throw new LoopContractError("invalid_contract", `未知步骤：${id}`)
    }
    if (stepIds.has(id)) {
      throw new LoopContractError("duplicate_step", `存在重复步骤：${id}`)
    }
    if (!allowedTools.has(tool)) {
      throw new LoopContractError("unauthorized_tool", `步骤 ${id} 使用了未授权工具：${tool}`)
    }
    stepIds.add(id)
  }
}

function expectedVersion(id: BusinessLoopId): number {
  return Number(id.slice(id.lastIndexOf("-v") + 2))
}

/**
 * @description 判断值是否为有效的业务循环 ID
 * @param value - 待判断的值
 * @returns 是有效 ID 返回 true
 */
export function isBusinessLoopId(value: string): value is BusinessLoopId {
  return BUSINESS_LOOP_IDS.includes(value as BusinessLoopId)
}

/**
 * @description 验证业务循环规格
 * @param spec - 业务循环规格
 * @returns 无返回值，验证失败时抛出错误
 */
export function validateBusinessLoopSpec(spec: BusinessLoopSpec): void {
  if (!isPlainObject(spec)) {
    throw new LoopContractError("invalid_contract", "BusinessLoopSpec 必须为对象。")
  }
  if (typeof spec.id !== "string" || !isBusinessLoopId(spec.id)) {
    throw new LoopContractError("invalid_loop_id", `未知的 Loop ID：${String(spec.id)}`)
  }
  if (!Number.isInteger(spec.version) || spec.version < 1 || spec.version !== expectedVersion(spec.id)) {
    throw new LoopContractError("invalid_version", `Loop ${spec.id} 的版本与 ID 不一致。`)
  }
  if (!WORKFLOWS.includes(spec.workflow)) {
    throw new LoopContractError("invalid_contract", `Loop ${spec.id} 的 workflow 非法。`)
  }
  if (!isPlainObject(spec.goal)) {
    throw new LoopContractError("invalid_contract", "goal 必须为对象。")
  }
  validateStringList(spec.goal.deliverables, "goal.deliverables")
  validateStringList(spec.goal.doneWhen, "goal.doneWhen")
  if (!TRIGGERS.includes(spec.trigger)) {
    throw new LoopContractError("invalid_contract", `Loop ${spec.id} 的 trigger 非法。`)
  }

  const tools = validateStringList(spec.allowedTools, "allowedTools")
  const toolSet = new Set(tools)
  if (toolSet.size !== tools.length) {
    throw new LoopContractError("duplicate_tool", `Loop ${spec.id} 存在重复工具。`)
  }
  validateSteps(spec.steps, toolSet)
  requireNonEmptyString(spec.verificationPolicy, "verificationPolicy")
  if (!MEMORY_POLICIES.includes(spec.memoryPolicy)) {
    throw new LoopContractError("invalid_contract", `Loop ${spec.id} 的 memoryPolicy 非法。`)
  }
  if (!isPlainObject(spec.stopPolicy)) {
    throw new LoopContractError("invalid_contract", "stopPolicy 必须为对象。")
  }
  requirePositiveInteger(spec.stopPolicy.executionTimeoutMs, "executionTimeoutMs")
  if (typeof spec.stopPolicy.requireHumanReview !== "boolean") {
    throw new LoopContractError("invalid_contract", "stopPolicy.requireHumanReview 必须为布尔值。")
  }
  validateModelPolicy(spec.modelPolicy)
  validateSupervisionPolicy(spec.supervisionPolicy)
}

/**
 * @description 断言工具已在循环规格中授权
 * @param spec - 业务循环规格
 * @param tool - 工具名称
 * @returns 无返回值，未授权时抛出错误
 */
export function assertToolAuthorized(spec: BusinessLoopSpec, tool: string): void {
  if (!spec.allowedTools.includes(tool)) {
    throw new LoopContractError("unauthorized_tool", `Loop ${spec.id} 未授权工具：${tool}`)
  }
}
