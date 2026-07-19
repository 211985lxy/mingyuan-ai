import type { AimAgentId } from "@/lib/aim-ui-config"
import type { ContentTask, DesiredAction, TaskSpec } from "@/lib/task-spec"

export type AimWorkflowStage = "direction" | "content" | "publish" | "results"
export type AimContentAction = "new_copy" | "edit_current" | "rewrite_reference" | "repurpose"

export interface AimWorkflowStageConfig {
  id: AimWorkflowStage
  title: string
  description: string
  defaultAgentId: AimAgentId
}

export const AIM_WORKFLOW_STAGES: AimWorkflowStageConfig[] = [
  { id: "direction", title: "定方向", description: "想清楚讲什么、讲给谁、为什么值得做", defaultAgentId: "business_diagnosis" },
  { id: "content", title: "做内容", description: "把方向变成可以发布和持续修改的内容", defaultAgentId: "content_producer" },
  { id: "publish", title: "发作品", description: "编辑、质检、整理发布包，并登记已发布内容", defaultAgentId: "content_review" },
  { id: "results", title: "看结果", description: "复盘有效内容，把规则沉淀回项目资产", defaultAgentId: "content_producer" },
]

export const AIM_CONTENT_ACTIONS: Array<{
  id: AimContentAction
  title: string
  prompt: string
  taskType: "write_script" | "polish_copy" | "repurpose"
}> = [
  { id: "new_copy", title: "新写一版", prompt: "请基于当前项目资料，新写一版可直接发布的内容。", taskType: "write_script" },
  { id: "edit_current", title: "修改当前稿", prompt: "请只修改我指定的部分，未指定段落必须保持原意和结构。", taskType: "polish_copy" },
  { id: "rewrite_reference", title: "按对标重写", prompt: "请按我提供的对标内容重写，保留结构价值，不复用原句。", taskType: "write_script" },
  { id: "repurpose", title: "拆成多平台", prompt: "请把当前内容拆成适合不同平台发布的版本。", taskType: "repurpose" },
]

const STAGE_BY_AGENT: Partial<Record<AimAgentId, AimWorkflowStage>> = {
  business_diagnosis: "direction",
  business_system_diagnosis: "direction",
  persona: "direction",
  content_producer: "content",
  free_copywriter: "content",
  deep_copywriter: "content",
  content_review: "publish",
}

export function isAimWorkflowStage(value: unknown): value is AimWorkflowStage {
  return typeof value === "string" && AIM_WORKFLOW_STAGES.some((stage) => stage.id === value)
}

export function getAimWorkflowStage(stage: AimWorkflowStage) {
  return AIM_WORKFLOW_STAGES.find((item) => item.id === stage)!
}

export function getWorkflowStageForAgent(agentId: AimAgentId): AimWorkflowStage {
  return STAGE_BY_AGENT[agentId] || "content"
}

export function isAimContentAction(value: unknown): value is AimContentAction {
  return typeof value === "string" && AIM_CONTENT_ACTIONS.some((action) => action.id === value)
}

export interface ConfirmedWorkflowBrief {
  goal?: string
  targetCustomer?: string
  realProblem?: string
  contentTask?: ContentTask
  mustKeep?: string
  avoid?: string
  desiredAction?: DesiredAction
  suggestedFormat?: string
  userSupplement?: string
}

const CONTENT_TASKS: ContentTask[] = ["吸引目标客户", "建立专业信任", "展示真实案例", "筛选不适合客户", "解释问题与方法", "推动咨询行动"]
const DESIRED_ACTIONS: DesiredAction[] = ["评论", "私信", "领取资料", "预约诊断", "进一步咨询"]

function cleanText(value: unknown, max = 500): string | undefined {
  if (typeof value !== "string") return undefined
  const text = value.trim().slice(0, max)
  return text || undefined
}

/** Accept only user-editable brief fields. Facts remain server-sourced. */
export function parseConfirmedWorkflowBrief(value: unknown): ConfirmedWorkflowBrief | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const input = value as Record<string, unknown>
  const contentTask = cleanText(input.contentTask, 40)
  const desiredAction = cleanText(input.desiredAction, 40)
  return {
    goal: cleanText(input.goal),
    targetCustomer: cleanText(input.targetCustomer),
    realProblem: cleanText(input.realProblem),
    contentTask: contentTask && CONTENT_TASKS.includes(contentTask as ContentTask) ? contentTask as ContentTask : undefined,
    mustKeep: cleanText(input.mustKeep),
    avoid: cleanText(input.avoid),
    desiredAction: desiredAction && DESIRED_ACTIONS.includes(desiredAction as DesiredAction) ? desiredAction as DesiredAction : undefined,
    suggestedFormat: cleanText(input.suggestedFormat, 100),
    userSupplement: cleanText(input.userSupplement, 1000),
  }
}

export function parseWorkflowBriefRequest(value: unknown): {
  stage: AimWorkflowStage
  projectId?: string
  sourceGenerationId?: string
  goal?: string
  confirmed?: ConfirmedWorkflowBrief
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const body = value as Record<string, unknown>
  if (!isAimWorkflowStage(body.stage)) return null
  const readString = (key: string) => typeof body[key] === "string" ? body[key].trim() || undefined : undefined
  return {
    stage: body.stage,
    projectId: readString("projectId"),
    sourceGenerationId: readString("sourceGenerationId"),
    goal: readString("goal"),
    confirmed: parseConfirmedWorkflowBrief(body.confirmed),
  }
}

export function applyConfirmedWorkflowBrief(base: TaskSpec, confirmed?: ConfirmedWorkflowBrief): TaskSpec {
  if (!confirmed) return base
  const additions = confirmed.userSupplement
    ? [{ statement: confirmed.userSupplement, source: "用户补充" }]
    : []
  const constraints = [
    confirmed.mustKeep ? `必须保留：${confirmed.mustKeep}` : "",
    confirmed.avoid ? `禁区：${confirmed.avoid}` : "",
    confirmed.suggestedFormat ? `建议形式：${confirmed.suggestedFormat}` : "",
  ].filter(Boolean)
  return {
    ...base,
    goal: confirmed.goal || base.goal,
    targetCustomer: confirmed.targetCustomer || base.targetCustomer,
    realProblem: confirmed.realProblem || base.realProblem,
    contentTask: confirmed.contentTask || base.contentTask,
    exclusiveEvidence: confirmed.mustKeep || base.exclusiveEvidence,
    desiredAction: confirmed.desiredAction || base.desiredAction,
    knownFacts: [...base.knownFacts, ...additions].slice(0, 12),
    assumptions: constraints.length
      ? [...base.assumptions, ...constraints.map((statement) => ({ statement, impact: "medium" as const }))].slice(0, 6)
      : base.assumptions,
  }
}
