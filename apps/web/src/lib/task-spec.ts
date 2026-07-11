import type { AimTaskType } from "@/lib/aim-generator"

export type CollaborationMode =
  | "direct_delivery"
  | "assumption_delivery"
  | "feedback_iteration"
  | "discovery_exploration"

export type RiskLevel = "low" | "medium" | "high"

export type ContentTask =
  | "吸引目标客户"
  | "建立专业信任"
  | "展示真实案例"
  | "筛选不适合客户"
  | "解释问题与方法"
  | "推动咨询行动"

export type TrustAsset = "案例" | "资历" | "过程" | "观点" | "客户反馈" | "交付方法"

export type DesiredAction = "评论" | "私信" | "领取资料" | "预约诊断" | "进一步咨询"

export interface TaskSpecInput {
  agentId?: string
  taskType?: AimTaskType
  rawInput: string
  project: {
    name?: string | null
    targetCustomer?: string | null
    industry?: string | null
    offer?: string | null
    deliveryGoal?: string | null
  } | null
  topicSelection: {
    title?: string
    rationale?: string
    targetCustomer?: string
    sourceHighlights?: Array<{ category?: string; title?: string; content?: string }>
  } | null
  knowledgeTitles: string[]
}

export interface TaskSpec {
  goal: string
  mode: CollaborationMode
  riskLevel: RiskLevel
  targetCustomer?: string
  realProblem?: string
  contentTask?: ContentTask
  trustAssetType?: TrustAsset
  exclusiveEvidence?: string
  desiredAction?: DesiredAction
  dealPath?: string
  knownFacts: Array<{ statement: string; source: string }>
  unknowns: string[]
  assumptions: Array<{ statement: string; impact: "low" | "medium" | "high" }>
  rationale?: string
  nextAction: string
  classifiedBy: "rule" | "llm" | "rule_fallback"
  classifiedAt: string
}

// 风险关键词（高）
export const RISK_KEYWORDS_HIGH = [
  "商业诊断", "IP定位", "ip定位", "成交路径", "人群判断", "产品设计", "市场机会", "定位策划",
]

const LOW_TASK_TYPES: AimTaskType[] = ["polish_copy", "repurpose"]
const HIGH_AGENTS = new Set(["business_diagnosis", "business_system_diagnosis", "persona"])
const LOW_AGENTS = new Set(["free_copywriter"])

export function inferRiskLevel(input: TaskSpecInput): RiskLevel {
  const { agentId, taskType, rawInput } = input
  if (taskType && LOW_TASK_TYPES.includes(taskType)) return "low"
  if (agentId && LOW_AGENTS.has(agentId)) return "low"
  if (agentId && HIGH_AGENTS.has(agentId)) return "high"
  if (RISK_KEYWORDS_HIGH.some((kw) => rawInput.includes(kw))) return "high"
  return "medium"
}

/** 关键资料是否完整：至少要有目标客户 + offer/deliveryGoal 之一 */
function isProjectComplete(project: TaskSpecInput["project"]): boolean {
  if (!project) return false
  const hasCustomer = !!(project.targetCustomer && project.targetCustomer.trim())
  const hasOffer = !!(project.offer && project.offer.trim()) || !!(project.deliveryGoal && project.deliveryGoal.trim())
  return hasCustomer && hasOffer
}

export function inferMode(risk: RiskLevel, projectComplete: boolean): CollaborationMode {
  if (risk === "low") return "direct_delivery"
  if (risk === "medium") return "assumption_delivery"
  // high
  return projectComplete ? "assumption_delivery" : "discovery_exploration"
}

function deriveGoal(input: TaskSpecInput): string {
  const title = input.topicSelection?.title?.trim()
  if (title) return title.slice(0, 80)
  return input.rawInput.trim().slice(0, 80) || "未明确目标"
}

export function buildTaskSpecSkeleton(input: TaskSpecInput): TaskSpec {
  const risk = inferRiskLevel(input)
  const projectComplete = isProjectComplete(input.project)
  const mode = inferMode(risk, projectComplete)

  const knownFacts: TaskSpec["knownFacts"] = []
  const p = input.project
  if (p?.targetCustomer?.trim()) knownFacts.push({ statement: p.targetCustomer.trim(), source: "项目-目标客户" })
  if (p?.industry?.trim()) knownFacts.push({ statement: `${p.industry.trim()} 行业`, source: "项目-行业" })
  if (p?.offer?.trim()) knownFacts.push({ statement: p.offer.trim(), source: "项目-主推产品/服务" })
  if (p?.deliveryGoal?.trim()) knownFacts.push({ statement: p.deliveryGoal.trim(), source: "项目-成交目标" })
  const sh = input.topicSelection?.sourceHighlights ?? []
  for (const h of sh.slice(0, 4)) {
    if (h?.content?.trim()) knownFacts.push({ statement: h.content.trim().slice(0, 120), source: `选题证据-${h.title || h.category || "来源"}` })
  }

  const unknowns: string[] = []
  if (risk === "high") {
    if (!p?.targetCustomer?.trim()) unknowns.push("目标客户画像不明确")
    if (!p?.offer?.trim()) unknowns.push("主推产品/服务未定义")
    if (!input.knowledgeTitles.length && !sh.length) unknowns.push("缺少可引用的客户案例或证据素材")
  }
  if (risk === "medium" && !sh.length) unknowns.push("选题缺少老板专属案例/原话作为信任证据")

  return {
    goal: deriveGoal(input),
    mode,
    riskLevel: risk,
    targetCustomer: p?.targetCustomer?.trim() || undefined,
    dealPath: p?.offer?.trim() || p?.deliveryGoal?.trim() ? `${p.offer?.trim() || ""} → ${p.deliveryGoal?.trim() || ""}`.trim() : undefined,
    rationale: input.topicSelection?.rationale?.trim() || undefined,
    knownFacts,
    unknowns,
    assumptions: [],
    nextAction: mode === "discovery_exploration"
      ? "补充关键资料后再生成正式方案"
      : risk === "low" ? "直接交付，无需追问" : "可按假设交付，复核最薄弱假设",
    classifiedBy: "rule",
    classifiedAt: new Date().toISOString(),
  }
}

/** 校验并合并 LLM 精化结果；丢弃 LLM 试图写入的 knownFacts（铁律）。 */
export function sanitizeLLMRefinement(
  skeleton: TaskSpec,
  refinement: {
    mode?: CollaborationMode
    unknowns?: string[]
    assumptions?: Array<{ statement: string; impact: "low" | "medium" | "high" }>
    knownFacts?: unknown // 必须被丢弃
  },
): TaskSpec {
  const allowedModes: CollaborationMode[] = skeleton.riskLevel === "low"
    ? ["direct_delivery"]
    : skeleton.riskLevel === "medium"
      ? ["assumption_delivery"]
      : ["assumption_delivery", "discovery_exploration"]
  const mode = refinement.mode && allowedModes.includes(refinement.mode) ? refinement.mode : skeleton.mode
  return {
    ...skeleton,
    mode,
    unknowns: Array.isArray(refinement.unknowns) && refinement.unknowns.length
      ? refinement.unknowns.filter((u) => typeof u === "string" && u.trim()).slice(0, 6)
      : skeleton.unknowns,
    assumptions: Array.isArray(refinement.assumptions)
      ? refinement.assumptions.filter((a) => a && a.statement).slice(0, 4)
      : skeleton.assumptions,
    knownFacts: skeleton.knownFacts,
    classifiedBy: "llm",
    classifiedAt: new Date().toISOString(),
  }
}

export function buildTaskSpecLLMPrompt(spec: TaskSpec): string {
  return [
    "你是任务风险判断助手。只做判断，不得编造任何事实、客户案例或数字。",
    `已知事实（来自真实上下文，不可增改）：${spec.knownFacts.map((f) => f.statement).join("；") || "无"}`,
    `风险等级（规则给出，仅供参考）：${spec.riskLevel}`,
    `当前模式候选：${spec.riskLevel === "low" ? "direct_delivery" : spec.riskLevel === "medium" ? "assumption_delivery" : "assumption_delivery 或 discovery_exploration"}`,
    "请输出 JSON：{ mode, unknowns: string[], assumptions: [{statement, impact}] }。",
    "禁止输出 knownFacts、禁止输出任何数字指标、禁止编造客户反馈。unknowns 描述信息缺口，assumptions 描述为了交付而做的合理假设。",
  ].join("\n")
}
