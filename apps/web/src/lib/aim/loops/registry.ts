/** Business Loop 的静态注册表。运行时只能读取，不能动态注册或覆盖。 */
import {
  assertToolAuthorized,
  isBusinessLoopId,
  LoopContractError,
  validateBusinessLoopSpec,
  type BusinessLoopId,
  type BusinessLoopSpec,
  type LoopStepSpec,
} from "./contracts"

export const SALES_DIAGNOSIS_ALLOWED_TOOLS = [
  "deterministic_preflight",
  "aim_context_loader",
  "aim_harness",
  "sales_diagnosis_verifier",
  "aim_generation_store",
  "work_item_state_machine",
  "feishu_supervisor_notifier",
  "asset_candidate_store",
] as const

export const SALES_DIAGNOSIS_STEPS: LoopStepSpec[] = [
  { id: "validate_input", name: "校验输入与执行许可", tool: "deterministic_preflight" },
  { id: "load_context", name: "加载项目与客户上下文", tool: "aim_context_loader" },
  { id: "extract_insight", name: "生成销售诊断洞察", tool: "aim_harness" },
  { id: "verify_output", name: "执行确定性事实验证", tool: "sales_diagnosis_verifier" },
  { id: "persist_result", name: "保存运行结果", tool: "aim_generation_store" },
  { id: "submit_review", name: "提交人工终审", tool: "work_item_state_machine" },
  { id: "notify_supervisor", name: "通知监督人", tool: "feishu_supervisor_notifier" },
  { id: "create_memory_candidates", name: "生成待批准资产候选", tool: "asset_candidate_store" },
]

const SALES_DIAGNOSIS_V1_SPEC: BusinessLoopSpec = {
  id: "sales-diagnosis-v1",
  version: 1,
  workflow: "销售诊断",
  goal: {
    deliverables: ["可追溯的销售诊断结果", "明确的下一步行动"],
    doneWhen: ["确定性验证完成", "结果进入人工终审"],
  },
  trigger: "manual_approved",
  steps: SALES_DIAGNOSIS_STEPS,
  allowedTools: [...SALES_DIAGNOSIS_ALLOWED_TOOLS],
  verificationPolicy: "sales-diagnosis-evidence-v1",
  memoryPolicy: "candidate_after_approval",
  stopPolicy: {
    executionTimeoutMs: 300_000,
    requireHumanReview: true,
  },
  modelPolicy: {
    temperature: 0.2,
  },
  supervisionPolicy: {
    defaultMode: "shadow",
    requireStartApproval: true,
    requireFinalReview: true,
    allowExternalSideEffects: false,
    budget: {
      maxRunsPerWorkItem: 1,
      maxEstimatedInputTokens: 20_000,
      maxOutputTokens: 3_000,
      maxProviderAttempts: 1,
      maxAutoRetries: 0,
    },
  },
}

function freezeBusinessLoopSpec(spec: BusinessLoopSpec): BusinessLoopSpec {
  Object.freeze(spec.goal.deliverables)
  Object.freeze(spec.goal.doneWhen)
  Object.freeze(spec.goal)
  for (const step of spec.steps) Object.freeze(step)
  Object.freeze(spec.steps)
  Object.freeze(spec.allowedTools)
  Object.freeze(spec.stopPolicy)
  Object.freeze(spec.modelPolicy)
  Object.freeze(spec.supervisionPolicy.budget)
  Object.freeze(spec.supervisionPolicy)
  return Object.freeze(spec)
}

validateBusinessLoopSpec(SALES_DIAGNOSIS_V1_SPEC)
export const SALES_DIAGNOSIS_V1 = freezeBusinessLoopSpec(SALES_DIAGNOSIS_V1_SPEC)

const REGISTRY: ReadonlyMap<BusinessLoopId, BusinessLoopSpec> = new Map([
  [SALES_DIAGNOSIS_V1.id, SALES_DIAGNOSIS_V1],
])

export function getRegisteredLoop(id: string): BusinessLoopSpec {
  if (!isBusinessLoopId(id)) {
    throw new LoopContractError("invalid_loop_id", `未知的 Loop ID：${id}`)
  }
  const spec = REGISTRY.get(id)
  if (!spec) {
    throw new LoopContractError("unknown_loop", `尚未注册的 Loop：${id}`)
  }
  return spec
}

export function findRegisteredLoop(id: string): BusinessLoopSpec | null {
  try {
    return getRegisteredLoop(id)
  } catch (error) {
    if (error instanceof LoopContractError && error.reason === "unknown_loop") return null
    throw error
  }
}

export function listRegisteredLoops(): readonly BusinessLoopSpec[] {
  return [...REGISTRY.values()]
}

export function assertLoopToolAuthorized(id: string, tool: string): void {
  assertToolAuthorized(getRegisteredLoop(id), tool)
}
