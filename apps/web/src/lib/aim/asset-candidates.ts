/**
 * 会后资产候选构建器（90 天计划 3.1）纯域层。
 *
 * 从结构化会议洞察（MeetingInsight）确定性映射出八类资产候选：
 *   客户高频痛点 / 客户原话 / 购买异议 / 成交触发点 /
 *   跟进话术 / 内容选题 / 案例候选 / 方法论修订候选
 *
 * 原则：
 * - 不调用 LLM、不读写数据库，只依赖已审核的结构化洞察。
 * - 原文证据（evidence）必须来自洞察字段本身，禁止补造；
 *   没有来源数据的资产类型直接缺省，不凑数。
 * - 所有候选默认 reviewStatus=pending、crossProjectAllowed=false：
 *   未经人工审核，不自动升级为正式知识、案例或评估样本。
 */
import type { MeetingInsight } from "@/lib/aim/meeting-insight"

export const ASSET_CANDIDATE_KINDS = [
  "pain_point",
  "customer_quote",
  "objection",
  "deal_trigger",
  "follow_up_script",
  "content_topic",
  "case_candidate",
  "methodology_revision",
] as const

export type AssetCandidateKind = (typeof ASSET_CANDIDATE_KINDS)[number]

export const ASSET_CANDIDATE_KIND_LABELS: Record<AssetCandidateKind, string> = {
  pain_point: "客户高频痛点",
  customer_quote: "客户原话",
  objection: "购买异议",
  deal_trigger: "成交触发点",
  follow_up_script: "跟进话术",
  content_topic: "内容选题",
  case_candidate: "案例候选",
  methodology_revision: "方法论修订候选",
}

export type AssetCandidateConfidence = "high" | "medium" | "low"

export interface AssetCandidateDraft {
  kind: AssetCandidateKind
  title: string
  content: string
  /** 原文证据：必须来自洞察字段，缺省时为 null，不伪造。 */
  evidence: string | null
  confidence: AssetCandidateConfidence
  /** 是否允许跨项目复用：默认 false，需人工批准后才可放宽。 */
  crossProjectAllowed: boolean
}

const MAX_TITLE_LEN = 60

function truncateTitle(text: string): string {
  const v = text.trim().replace(/\s+/g, " ")
  return v.length > MAX_TITLE_LEN ? `${v.slice(0, MAX_TITLE_LEN - 1)}…` : v
}

function sourceLine(insight: MeetingInsight): string {
  const meeting = insight.meetingTitle || "未命名会议"
  const customer = insight.customer || "未指明客户"
  return `来源：会议「${meeting}」· 客户「${customer}」`
}

function fromStatement(
  kind: AssetCandidateKind,
  text: string,
  confidence: AssetCandidateConfidence,
  insight: MeetingInsight,
): AssetCandidateDraft {
  return {
    kind,
    title: truncateTitle(`${ASSET_CANDIDATE_KIND_LABELS[kind]}｜${text}`),
    content: `${text}\n\n${sourceLine(insight)}`,
    evidence: text,
    confidence,
    crossProjectAllowed: false,
  }
}

/** 决策后期阶段：客户目标此时更可能是真实购买触发点。 */
const LATE_DECISION_STAGES = new Set(["方案比较", "决策中", "已成交"])

/**
 * 从结构化会议洞察构建资产候选。
 * 映射规则（确定性、可测试）：
 * - pains → pain_point（high）
 * - objections → objection（high）
 * - pains ∪ objections（去重）→ customer_quote（medium，客户发声语句）
 * - decisionStage ∈ 决策后期时，goals → deal_trigger（已成交 high，否则 medium）
 * - followUps → follow_up_script（medium）
 * - topicCandidates → content_topic（medium）
 * - 已成交且有交付任务 → 恰好一条 case_candidate（low）
 * - diagnosisQuestions → methodology_revision（low）
 */
export function buildAssetCandidatesFromInsight(insight: MeetingInsight): AssetCandidateDraft[] {
  const drafts: AssetCandidateDraft[] = []

  for (const pain of insight.pains) {
    drafts.push(fromStatement("pain_point", pain, "high", insight))
  }
  for (const objection of insight.objections) {
    drafts.push(fromStatement("objection", objection, "high", insight))
  }

  // 客户原话：痛点与异议均为客户在会议中的发声语句，跨来源去重。
  const quoteSeen = new Set<string>()
  for (const text of [...insight.pains, ...insight.objections]) {
    if (quoteSeen.has(text)) continue
    quoteSeen.add(text)
    drafts.push(fromStatement("customer_quote", text, "medium", insight))
  }

  if (LATE_DECISION_STAGES.has(insight.decisionStage)) {
    const confidence: AssetCandidateConfidence = insight.decisionStage === "已成交" ? "high" : "medium"
    for (const goal of insight.goals) {
      drafts.push(fromStatement("deal_trigger", goal, confidence, insight))
    }
  }

  for (const followUp of insight.followUps) {
    drafts.push(fromStatement("follow_up_script", followUp, "medium", insight))
  }
  for (const topic of insight.topicCandidates) {
    drafts.push(fromStatement("content_topic", topic, "medium", insight))
  }

  // 案例候选：只有真实成交且进入交付的客户才可成为案例，禁止虚构。
  if (insight.decisionStage === "已成交" && insight.deliveryTasks.length > 0) {
    const tasks = insight.deliveryTasks.map((t) => t.title).join("；")
    const goals = insight.goals.length ? insight.goals.join("；") : "（待确认）"
    const text = `客户「${insight.customer || "未指明"}」已成交，目标：${goals}；交付任务：${tasks}。`
    drafts.push({
      kind: "case_candidate",
      title: truncateTitle(`${ASSET_CANDIDATE_KIND_LABELS.case_candidate}｜${insight.customer || "未指明客户"}`),
      content: `${text}\n\n${sourceLine(insight)}`,
      evidence: text,
      confidence: "low",
      crossProjectAllowed: false,
    })
  }

  for (const question of insight.diagnosisQuestions) {
    drafts.push(fromStatement("methodology_revision", question, "low", insight))
  }

  return drafts
}
