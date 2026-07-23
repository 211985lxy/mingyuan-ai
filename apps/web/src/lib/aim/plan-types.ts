/**
 * 计划模式（Plan Mode）· 共享类型
 *
 * 用于"做内容/新写文案"场景：用户输入一句大概需求，系统读取当前客户项目的
 * IP Wiki 和知识库，生成档案驱动的选择题，最终产出结构化任务单。
 */

// ─── 选项与来源 ───

/** 选项的档案来源引用（前端显示"来自：目标人群 Wiki"等简短依据） */
export interface PlanOptionSourceRef {
  /** 来源类型：ip_wiki 页 / knowledge 知识条目 / project 项目字段 */
  kind: "ip_wiki" | "knowledge" | "project"
  /** 来源 ID（wiki page id / knowledge entry id / project field name） */
  id: string
  /** 前端展示标签，如"目标人群 Wiki""客户痛点条目" */
  label: string
}

/** 单个选择题选项（A/B/C 为档案驱动推荐） */
export interface PlanOption {
  /** 选项标识：A / B / C */
  key: "A" | "B" | "C"
  /** 选项文本 */
  text: string
  /** 至少一个有效来源；无来源的选项会被服务端丢弃 */
  sourceRefs: PlanOptionSourceRef[]
}

// ─── 问题 ───

/** 计划问题维度（按影响排序） */
export type PlanQuestionDimension =
  | "core_message"
  | "audience"
  | "pain"
  | "platform"
  | "scenario"
  | "format"
  | "style"
  | "length"
  | "cta"

/** 维度排序权重（数值越小越先问） */
export const PLAN_DIMENSION_ORDER: PlanQuestionDimension[] = [
  "core_message",
  "audience",
  "pain",
  "platform",
  "format",
  "style",
  "cta",
  "scenario",
  "length",
]

/** 单个计划问题 */
export interface PlanQuestion {
  /** 问题唯一 ID */
  id: string
  /** 问题维度 */
  dimension: PlanQuestionDimension
  /** 问题文本 */
  prompt: string
  /** 档案驱动推荐选项（2-3 个）；不足 2 个时只保留 D */
  options: PlanOption[]
  /** 是否包含 D（"都不符合，我来补充"）——始终为 true */
  hasCustomOption: true
  /** 对应任务单字段名 */
  targetField: PlanTaskSpecField
}

// ─── 任务单字段 ───

/** 任务单可扩展字段名 */
export type PlanTaskSpecField =
  | "coreMessage"
  | "platform"
  | "useScenario"
  | "outputFormat"
  | "style"
  | "lengthRule"
  | "ctaText"
  | "targetCustomer"
  | "realProblem"
  | "contentGoal"
  | "desiredAction"
  | "mustKeep"
  | "avoid"

export const PLAN_TASK_SPEC_FIELDS: readonly PlanTaskSpecField[] = [
  "coreMessage", "platform", "useScenario", "outputFormat", "style", "lengthRule", "ctaText",
  "targetCustomer", "realProblem", "contentGoal", "desiredAction", "mustKeep", "avoid",
]

/** 结构化任务单（扩展 ConfirmedWorkflowBrief） */
export interface PlanTaskSpec {
  /** 内容目标 */
  contentGoal?: string
  /** 核心信息 */
  coreMessage?: string
  /** 目标受众 */
  targetCustomer?: string
  /** 真实痛点 */
  realProblem?: string
  /** 发布平台 */
  platform?: string
  /** 使用场景 */
  useScenario?: string
  /** 输出格式 */
  outputFormat?: string
  /** 风格 */
  style?: string
  /** 长度规则 */
  lengthRule?: string
  /** CTA 文本（自由文本，不做枚举校验） */
  ctaText?: string
  /** 期望动作枚举（保留用于路由和统计） */
  desiredAction?: string
  /** 必须保留 */
  mustKeep?: string
  /** 禁区 */
  avoid?: string
}

// ─── 答案 ───

/** 用户对单个问题的回答 */
export interface PlanAnswer {
  /** 对应问题 ID */
  questionId: string
  /** 选择的选项 key（A/B/C），选 D 时为 "D" */
  selectedKey: "A" | "B" | "C" | "D"
  /** 选 D 时用户填写的补充内容 */
  customText?: string
  /** 最终采用的文本（A/B/C 取选项文本，D 取 customText） */
  resolvedText: string
  /** 答案来源标记 */
  source: "archive" | "user_supplement"
}

// ─── API 请求/响应 ───

/** POST /api/aim/workflow/plan 请求体 */
export interface PlanRequest {
  /** 客户项目 ID（必填） */
  projectId: string
  /** 一句话需求 */
  requirement: string
  /** 当前已确认的任务单字段（上一轮结果） */
  confirmedFields?: Partial<PlanTaskSpec>
  /** 已回答的问题 ID 列表（避免重复追问） */
  answeredQuestionIds?: string[]
  /** 当前轮次（从 1 开始，最多 2 轮） */
  round?: number
}

/** 假设项：档案已有明确答案、无需追问的字段 */
export interface PlanAssumption {
  field: PlanTaskSpecField
  value: string
  sourceRefs: PlanOptionSourceRef[]
}

/** POST /api/aim/workflow/plan 响应体 */
export interface PlanResponse {
  /** 当前轮次 */
  round: number
  /** 是否已就绪（无更多问题，可展示最终任务单） */
  ready: boolean
  /** 本轮问题（最多 3 个，按维度排序） */
  questions: PlanQuestion[]
  /** 档案已有明确答案的假设项 */
  assumptions: PlanAssumption[]
  /** 当前累积的任务单快照 */
  taskSpec: Partial<PlanTaskSpec>
  /** 总问题数统计 */
  totalQuestionsAsked: number
}

// ─── 前端会话状态 ───

/** 计划会话状态机 */
export type PlanSessionStatus =
  | "idle"        // 未启动
  | "asking"      // 正在逐题追问
  | "reviewing"   // 展示最终任务单
  | "confirmed"   // 用户已确认，进入生成
  | "abandoned"   // 用户放弃

/** 前端计划会话完整状态 */
export interface CopyPlanSession {
  /** 原始一句话需求 */
  requirement: string
  /** 项目 ID */
  projectId: string
  /** 当前状态 */
  status: PlanSessionStatus
  /** 问题队列（所有轮次累积） */
  questions: PlanQuestion[]
  /** 当前题号（0-based） */
  currentIndex: number
  /** 所有已回答的答案 */
  answers: PlanAnswer[]
  /** 当前轮次 */
  round: number
  /** 假设项 */
  assumptions: PlanAssumption[]
  /** 最终任务单 */
  taskSpec: Partial<PlanTaskSpec>
  /** 是否正在等待服务端响应 */
  loading: boolean
  /** 错误信息 */
  error?: string
}

/** 创建空的计划会话 */
export function createEmptyPlanSession(requirement: string, projectId: string): CopyPlanSession {
  return {
    requirement,
    projectId,
    status: "asking",
    questions: [],
    currentIndex: 0,
    answers: [],
    round: 1,
    assumptions: [],
    taskSpec: {},
    loading: false,
  }
}

/** 计划模式最大轮次 */
export const PLAN_MAX_ROUNDS = 2
/** 每轮最大问题数 */
export const PLAN_MAX_QUESTIONS_PER_ROUND = 3
/** 总问题数上限 */
export const PLAN_MAX_TOTAL_QUESTIONS = 6
/** 档案选项最少数量（不足时只保留 D） */
export const PLAN_MIN_ARCHIVE_OPTIONS = 2
