import type { AimTaskType } from "@/lib/aim-generator"
import { isCopyStudioModule, type CopyStudioModule } from "@/lib/copy-studio"
import type { CanonicalContentSpec } from "@/lib/canonical-content-spec"
import type { ContentPackageSpec } from "@/lib/content-package-spec"

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
  /** 执行时实际采用的内容路由；不参与事实或业务判断。 */
  execution?: { schemaVersion: 1; copyStudioModule?: CopyStudioModule }
  // ── 计划模式扩展字段（Plan Mode）──
  /** 核心信息（本次内容要传达的一句话要点） */
  coreMessage?: string
  /** 发布平台（抖音/小红书/视频号等） */
  platform?: string
  /** 使用场景（引流/转化/品宣等） */
  useScenario?: string
  /** 输出格式（口播脚本/图文/朋友圈等） */
  outputFormat?: string
  /** 风格（专业/亲和/犀利等） */
  style?: string
  /** 长度规则（如"300字以内""1分钟口播"） */
  lengthRule?: string
  /** CTA 自由文本（避免用户表达被枚举校验静默丢弃） */
  ctaText?: string
  /** 母内容资产（阶段 2）；确认后作为多平台派生基准 */
  canonical?: CanonicalContentSpec
  /** 多平台内容包状态（阶段 3） */
  contentPackage?: ContentPackageSpec
  /** 编辑室样本锚点（内容机会 SourceBrief） */
  materialAnchors?: import("@/features/newsroom/contracts").SourceBrief
  /** 编辑室流水线阶段（独立于 workflowStatus） */
  newsroom?: import("@/features/newsroom/contracts").NewsroomTaskMeta
  /** 经营事项/内容机会溯源（create-work-item 等松散字段） */
  source?: string
  collectionId?: string
  sampleCount?: number
  analysisStatus?: string
  /** IP 方法论动态选卡计划（prepareAimContext 写入，供 prompt / METHOD_NOTE 共用） */
  methodologyPlan?: import("@/lib/methodology/resolve-copy-methodology-plan").CopyMethodologyPlan
}

/**
 * @description withcopystudioexecution
 * @param taskSpec - task规格
 * @param copyStudioModule - copyStudio模块
 * @returns TaskSpec | undefined
 */
export function withCopyStudioExecution(taskSpec: TaskSpec | undefined, copyStudioModule: CopyStudioModule | undefined): TaskSpec | undefined {
  if (!taskSpec || !copyStudioModule) return taskSpec
  return { ...taskSpec, execution: { ...taskSpec.execution, schemaVersion: 1, copyStudioModule } }
}

/**
 * @description 获取taskspeccopystudiomodule
 * @param taskSpec - task规格
 * @returns CopyStudioModule | undefined
 */
export function getTaskSpecCopyStudioModule(taskSpec: TaskSpec | null | undefined): CopyStudioModule | undefined {
  return isCopyStudioModule(taskSpec?.execution?.copyStudioModule)
    ? taskSpec.execution.copyStudioModule
    : undefined
}

// 风险关键词（高）
export const RISK_KEYWORDS_HIGH = [
  "商业诊断", "IP定位", "ip定位", "成交路径", "人群判断", "产品设计", "市场机会", "定位策划",
]

const LOW_TASK_TYPES: AimTaskType[] = ["polish_copy", "repurpose"]
const HIGH_AGENTS = new Set(["business_diagnosis", "business_system_diagnosis", "persona"])
const LOW_AGENTS = new Set(["free_copywriter"])

/**
 * @description inferrisklevel
 * @param input - 输入数据
 * @returns RiskLevel
 */
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

/**
 * @description infermode
 * @param risk - risk
 * @param projectComplete - projectComplete
 * @returns CollaborationMode
 */
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

const CONTENT_TASK_RULES: Array<{ words: string[]; task: ContentTask }> = [
  { words: ["种草", "吸引", "涨粉", "曝光", "停留", "转发"], task: "吸引目标客户" },
  { words: ["信任", "专业", "权威", "资历", "背书"], task: "建立专业信任" },
  { words: ["案例", "学员", "客户故事", "真实经历", "成交案例"], task: "展示真实案例" },
  { words: ["不适合", "筛选", "边界", "劝退"], task: "筛选不适合客户" },
  { words: ["解释", "方法", "怎么做", "方法论", "步骤"], task: "解释问题与方法" },
  { words: ["咨询", "私信", "预约", "转化", "成交", "引流", "获客"], task: "推动咨询行动" },
]

const DESIRED_ACTION_RULES: Array<{ words: string[]; action: DesiredAction }> = [
  { words: ["评论", "留言"], action: "评论" },
  { words: ["私信", "私聊", "DM"], action: "私信" },
  { words: ["资料", "领取", "白资料"], action: "领取资料" },
  { words: ["预约", "诊断", "约谈"], action: "预约诊断" },
  { words: ["咨询", "进一步"], action: "进一步咨询" },
]

const PLATFORM_RULES: Array<{ words: string[]; platform: string }> = [
  { words: ["小红书", "种草"], platform: "小红书" },
  { words: ["抖音", "短视频", "口播"], platform: "抖音" },
  { words: ["视频号"], platform: "视频号" },
  { words: ["朋友圈"], platform: "朋友圈" },
  { words: ["公众号", "长文"], platform: "公众号" },
  { words: ["社群", "微信群", "企微群"], platform: "社群" },
]

const OUTPUT_FORMAT_RULES: Array<{ words: string[]; outputFormat: string }> = [
  { words: ["小红书", "种草图文"], outputFormat: "小红书图文" },
  { words: ["口播", "短视频脚本", "视频脚本"], outputFormat: "口播脚本" },
  { words: ["朋友圈"], outputFormat: "朋友圈文案" },
  { words: ["公众号"], outputFormat: "公众号文章" },
  { words: ["拍摄交接", "分镜"], outputFormat: "拍摄交接单" },
]

function matchRule<T extends string>(text: string, rules: Array<{ words: string[]; value: T }>): T | undefined {
  for (const rule of rules) {
    if (rule.words.some((w) => text.includes(w))) return rule.value
  }
  return undefined
}

/**
 * 规则级补全 TaskSpec 运营字段（不调用 LLM）。
 * 仅填充空字段；已有计划确认值不被覆盖。缺失时写入 unknowns。
 */
export function enrichTaskSpecFromRawInput(
  spec: TaskSpec,
  rawInput: string,
  opts?: { platformHint?: string; outputFormatHint?: string },
): TaskSpec {
  const text = (rawInput || "").trim()
  if (!text && !opts?.platformHint && !opts?.outputFormatHint) return spec

  const next: TaskSpec = { ...spec, unknowns: [...spec.unknowns], assumptions: [...spec.assumptions] }

  if (!next.contentTask) {
    const inferred = matchRule(text, CONTENT_TASK_RULES.map((r) => ({ words: r.words, value: r.task })))
    if (inferred) next.contentTask = inferred
    else if (!next.unknowns.some((u) => u.includes("主要内容任务"))) {
      next.unknowns.push("待确认：主要内容任务")
    }
  }

  if (!next.desiredAction) {
    const inferred = matchRule(text, DESIRED_ACTION_RULES.map((r) => ({ words: r.words, value: r.action })))
    if (inferred) next.desiredAction = inferred
  }

  if (!next.realProblem) {
    const painMatch = text.match(/(?:痛点|问题|困扰|焦虑)[是为：:：]?\s*([^\n。！？]{6,40})/)
    if (painMatch?.[1]) next.realProblem = painMatch[1].trim()
    else if (!next.unknowns.some((u) => u.includes("真实问题"))) {
      next.unknowns.push("待确认：真实问题/痛点")
    }
  }

  if (!next.platform) {
    next.platform = opts?.platformHint
      || matchRule(text, PLATFORM_RULES.map((r) => ({ words: r.words, value: r.platform })))
  }

  if (!next.outputFormat) {
    next.outputFormat = opts?.outputFormatHint
      || matchRule(text, OUTPUT_FORMAT_RULES.map((r) => ({ words: r.words, value: r.outputFormat })))
  }

  if (!next.style) {
    if (/(犀利|锋利|直接)/.test(text)) next.style = "犀利"
    else if (/(亲和|温和|亲切)/.test(text)) next.style = "亲和"
    else if (/(专业|严谨)/.test(text)) next.style = "专业"
    else if (/(幽默|轻松)/.test(text)) next.style = "幽默"
  }

  if (!next.useScenario) {
    if (/(转化|成交|获客)/.test(text)) next.useScenario = "转化"
    else if (/(引流|涨粉|曝光)/.test(text)) next.useScenario = "引流"
    else if (/(品宣|品牌)/.test(text)) next.useScenario = "品宣"
    else if (/(种草)/.test(text)) next.useScenario = "种草"
  }

  if (!next.lengthRule) {
    const lengthMatch = text.match(/(\d{2,4})\s*字|(\d{1,2})\s*分钟|保持.{0,6}(长度|体量|篇幅)/)
    if (lengthMatch) {
      if (lengthMatch[1]) next.lengthRule = `${lengthMatch[1]}字以内`
      else if (lengthMatch[2]) next.lengthRule = `${lengthMatch[2]}分钟口播`
      else next.lengthRule = "保持原稿体量"
    }
  }

  if (!next.ctaText) {
    const ctaMatch = text.match(/(?:引导|CTA|行动号召)[：:]\s*([^\n。]{2,30})/i)
    if (ctaMatch?.[1]) next.ctaText = ctaMatch[1].trim()
    else if (next.desiredAction) next.ctaText = next.desiredAction
  }

  next.unknowns = next.unknowns.slice(0, 8)
  return next
}

export const COLLABORATION_MODE_LABELS: Record<CollaborationMode, string> = {
  direct_delivery: "直接交付",
  assumption_delivery: "按假设交付",
  feedback_iteration: "反馈迭代",
  discovery_exploration: "探索补资料",
}

/**
 * @description 构建taskspecskeleton
 * @param input - 输入数据
 * @returns TaskSpec
 */
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
/**
 * @description sanitizellmrefinement
 * @param skeleton - skeleton
 * @param refinement - refinement
 * @returns TaskSpec
 */
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

/**
 * @description 构建taskspecllmprompt
 * @param spec - 规格
 * @returns string
 */
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
