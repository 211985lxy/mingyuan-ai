/**
 * 客户会后工作流 · 会议洞察抽取器（WP-6 纯域层）。
 *
 * docs/plans/aim-ai-native-company-zcode-execution-plan.md §9 阶段 B 要求的九类产出：
 * 痛点 / 目标 / 预算 / 决策阶段 / 异议 / 跟进建议 / 诊断问题清单 / 选题 / 交付任务。
 *
 * 本层是**纯域层**：不调用 LLM、不读写飞书/数据库、不接触 UI。
 * 它接受的输入是"已标注/已半结构化"的会议字段（由人或上层 LLM 抽取层提供），
 * 负责：去空白、去重、截断、枚举收敛、预算数值解析、合法性校验，并产出可序列化的结构化洞察。
 *
 * 设计原则：
 * - 自由文本 NLP 抽取属 LLM 层（后续包），不放进纯域层（不可测、违反确定性）。
 * - 缺失/未知字段不伪造：未知决策阶段保留 raw 并标 unresolved；无金额预算不造数。
 * - 与经营事项状态机解耦但可衔接：buildWorkItemReviewFields 把洞察接到 WP-3 的 submit_review 回写。
 */

import {
  isMeetingEvidenceKind,
  type MeetingEvidence,
} from "@/lib/aim/sales-diagnosis/evidence"

/** 客户决策阶段枚举（覆盖 §9 阶段 B 的成交链路）。 */
export const MEETING_DECISION_STAGES = [
  "初步接触",
  "需求确认",
  "方案比较",
  "决策中",
  "已成交",
  "暂搁置",
] as const

export type MeetingDecisionStage = (typeof MEETING_DECISION_STAGES)[number]

const DECISION_STAGE_SET = new Set<string>(MEETING_DECISION_STAGES)

/** 单条交付任务。owner 可空（会议中未必指明责任人）。 */
export interface DeliveryTask {
  title: string
  owner?: string
}

/** 抽取输入：九类产物的原始（未规整）形态，均可空。evidence 为兼容新增。 */
export interface MeetingInsightInput {
  meetingTitle: string
  customer: string
  pains: string[]
  goals: string[]
  budgets: string[]
  /** 未落入枚举的值会被标 unresolved 并保留 raw。 */
  decisionStage: string
  objections: string[]
  followUps: string[]
  diagnosisQuestions: string[]
  topicCandidates: string[]
  deliveryTasks: DeliveryTask[]
  /** v1 新增：证据数组，每项包含 kind/statement/quote。向后兼容，缺失时为空。 */
  evidence?: MeetingEvidence[]
}

/** 规整后的结构化会议洞察。 */
export interface MeetingInsight {
  meetingTitle: string
  customer: string
  pains: string[]
  goals: string[]
  budgets: string[]
  /** 决策阶段（合法枚举值）；未知时为空串。 */
  decisionStage: MeetingDecisionStage | ""
  /** 决策阶段原始值（解析前），用于追溯。 */
  decisionStageRaw: string
  /** 决策阶段未落入枚举时为 true。 */
  decisionStageUnresolved: boolean
  objections: string[]
  followUps: string[]
  diagnosisQuestions: string[]
  topicCandidates: string[]
  deliveryTasks: DeliveryTask[]
  /** 从 budgets 文本中解析出的金额（元）。 */
  budgetFigures: number[]
  /** 是否存在可解析的预算金额。 */
  budgetSpecified: boolean
  /** v1 新增：规整后的证据数组。向后兼容，缺失时为空。 */
  evidence?: MeetingEvidence[]
}

export type MeetingInsightResult =
  | { ok: true; insight: MeetingInsight }
  | { ok: false; error: string }

// ── 私有规整 helper ──────────────────────────────────────────────────────

const MAX_TEXT_LEN = 2000

function cleanStrings(items: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of items) {
    const v = (raw ?? "").trim().slice(0, MAX_TEXT_LEN)
    if (!v || seen.has(v)) continue
    seen.add(v)
    out.push(v)
  }
  return out
}

function cleanTasks(tasks: DeliveryTask[]): DeliveryTask[] {
  const seen = new Set<string>()
  const out: DeliveryTask[] = []
  for (const t of tasks) {
    const title = (t?.title ?? "").trim().slice(0, MAX_TEXT_LEN)
    if (!title) continue
    const owner = (t?.owner ?? "").trim()
    const key = `${title}\u0000${owner}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(owner ? { title, owner } : { title })
  }
  return out
}

/** 逐条规整 evidence：去空白、截断、校验 kind 合法性、过滤非法条目。 */
function cleanEvidence(raw: MeetingEvidence[]): MeetingEvidence[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: MeetingEvidence[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const kind = (typeof item.kind === "string" ? item.kind.trim() : "")
    if (!isMeetingEvidenceKind(kind)) continue
    const statement = (typeof item.statement === "string" ? item.statement.trim() : "")
    const quote = typeof item.quote === "string" ? item.quote.trim() : ""
    if (!statement || !quote) continue
    const key = `${kind}\u0000${statement}\u0000${quote}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ kind, statement, quote })
  }
  return out
}

/**
 * 从文本中解析金额为元。
 * 支持："1500 万"、"1500万"、"20 万元"、"2.45 元/平/天"。
 * "万" → ×10000；纯"元" → 原值。抽不到返回 null，不伪造。
 */
function parseBudgetFigure(text: string): number | null {
  // 匹配"数字（可含小数）+ 万/亿元/元"。
  const m = text.match(/(\d+(?:\.\d+)?)\s*(亿元|万|元)/)
  if (!m) return null
  const value = Number(m[1])
  if (!Number.isFinite(value)) return null
  const unit = m[2]
  if (unit === "亿元") return Math.round(value * 100_000_000)
  if (unit === "万") return Math.round(value * 10_000)
  return Math.round(value) // 元
}

function resolveDecisionStage(raw: string): {
  stage: MeetingDecisionStage | ""
  unresolved: boolean
} {
  const v = (raw ?? "").trim()
  if (!v) return { stage: "", unresolved: false }
  if (DECISION_STAGE_SET.has(v)) return { stage: v as MeetingDecisionStage, unresolved: false }
  return { stage: "", unresolved: true }
}

/** 构造飞书可见的摘要（受 2000 字上限保护）。 */
function buildSummary(insight: MeetingInsight): string {
  const parts: string[] = [
    `客户：${insight.customer || "未指明"}`,
    `决策阶段：${insight.decisionStage || insight.decisionStageRaw || "未明确"}`,
    `目标 ${insight.goals.length} / 痛点 ${insight.pains.length} / ` +
      `异议 ${insight.objections.length} / 跟进 ${insight.followUps.length} / ` +
      `选题 ${insight.topicCandidates.length} / 交付 ${insight.deliveryTasks.length} / ` +
      `证据 ${insight.evidence?.length ?? 0} 条`,
  ]
  if (insight.goals.length) parts.push(`核心目标：${insight.goals.slice(0, 3).join("；")}`)
  if (insight.deliveryTasks.length) {
    parts.push(`交付任务：${insight.deliveryTasks.slice(0, 3).map((t) => t.title).join("；")}`)
  }
  return parts.join("\n").slice(0, 2000)
}

// ── 对外 API ─────────────────────────────────────────────────────────────

/**
 * 抽取并规整会议洞察。
 * - 缺失/未知字段不伪造。
 * - 既无目标也无交付任务视为非有效会议 → ok:false。
 */
export function extractMeetingInsight(input: MeetingInsightInput): MeetingInsightResult {
  const pains = cleanStrings(input.pains ?? [])
  const goals = cleanStrings(input.goals ?? [])
  const objections = cleanStrings(input.objections ?? [])
  const followUps = cleanStrings(input.followUps ?? [])
  const diagnosisQuestions = cleanStrings(input.diagnosisQuestions ?? [])
  const topicCandidates = cleanStrings(input.topicCandidates ?? [])
  const budgets = cleanStrings(input.budgets ?? [])
  const deliveryTasks = cleanTasks(input.deliveryTasks ?? [])
  const evidence = cleanEvidence(input.evidence ?? [])

  // 至少要有可执行落点：目标或交付任务其一，否则不是一次有产出的客户会议。
  if (goals.length === 0 && deliveryTasks.length === 0) {
    return {
      ok: false,
      error: "会议洞察无效：既无目标也无交付任务，无法作为有效客户会后产物。",
    }
  }

  const budgetFigures = budgets
    .map(parseBudgetFigure)
    .filter((n): n is number => n != null)

  const { stage, unresolved } = resolveDecisionStage(input.decisionStage)

  const insight: MeetingInsight = {
    meetingTitle: (input.meetingTitle ?? "").trim().slice(0, MAX_TEXT_LEN),
    customer: (input.customer ?? "").trim().slice(0, MAX_TEXT_LEN),
    pains,
    goals,
    budgets,
    decisionStage: stage,
    decisionStageRaw: (input.decisionStage ?? "").trim(),
    decisionStageUnresolved: unresolved,
    objections,
    followUps,
    diagnosisQuestions,
    topicCandidates,
    deliveryTasks,
    budgetFigures,
    budgetSpecified: budgetFigures.length > 0,
    evidence,
  }
  return { ok: true, insight }
}

/**
 * 把会议洞察组装成经营事项 `submit_review` 的可回写字段（对接 WP-3/WP-4）。
 * 结果摘要受 2000 字上限保护。
 *
 * 字段契约（WP-5 真实联调）：飞书「结果链接」是 **URL 文本字段**，
 * 必须写字符串，不能写 `{ link, text }` 对象（写对象会被飞书拒绝或失真）。
 */
export function buildWorkItemReviewFields(
  insight: MeetingInsight,
  meta: { aimResultId: string; resultLink: string },
): Record<string, unknown> {
  return {
    AIM结果ID: meta.aimResultId.trim(),
    结果摘要: buildSummary(insight),
    结果链接: meta.resultLink.trim(),
  }
}
