export interface XhsReviewIssue { type: string; text: string; suggestion: string }
export interface XhsChecklistItem { item: string; status: "pass" | "warn" | "fail"; note: string }

const EMOJI = /\p{Extended_Pictographic}/gu
export const XHS_ABSOLUTE_TERMS = ["国家级", "世界级", "全网最低价", "第一", "唯一", "最强", "最好", "100%"] as const

/**
 * @description 计算emojidensity
 * @param text - 文本
 * @returns number
 */
export function computeEmojiDensity(text: string): number {
  const chars = text.replace(/\s/g, "")
  return chars ? Math.round(((text.match(EMOJI) ?? []).length / chars.length) * 1000) / 10 : 0
}

/**
 * @description 查找absoluteterms
 * @param text - 文本
 * @returns XhsReviewIssue[]
 */
export function findAbsoluteTerms(text: string): XhsReviewIssue[] {
  return XHS_ABSOLUTE_TERMS.filter((term) => text.includes(term)).map((term) => ({
    type: "absolute", text: `疑似绝对化用语「${term}」`, suggestion: "改成可验证、有限定条件的表达。",
  }))
}

/**
 * @description 构建localchecklist
 * @param title - 标题
 * @param content - 内容
 * @returns XhsChecklistItem[]
 */
export function buildLocalChecklist(title: string, content: string): XhsChecklistItem[] {
  const density = computeEmojiDensity(content)
  const absolute = findAbsoluteTerms(content)
  const titleLength = title.replace(EMOJI, "").trim().length
  const dense = content.split(/\r?\n\s*\r?\n/).some((p) => p.split("\n").filter(Boolean).length > 5)
  return [
    { item: "emoji", status: density > 3 ? "warn" : "pass", note: `emoji 密度 ${density}/百字` },
    { item: "absolute", status: absolute.length ? "fail" : "pass", note: absolute.length ? `命中 ${absolute.length} 处` : "未发现" },
    { item: "title", status: !titleLength || titleLength > 20 ? "warn" : "pass", note: `${titleLength} 字` },
    { item: "density", status: dense ? "warn" : "pass", note: dense ? "存在长段落" : "段落正常" },
  ]
}

// ─── 复用 Task 10 合规规则（R06_* ~ R09_*） ────────────────────────────────
import {
  EXTRA_COMPLIANCE_RULE_IDS,
  PUBLISH_PRECHECK_RULES,
  runPublishPrecheck,
  type PublishPrecheckHit,
  type PublishPrecheckSeverity,
} from "@/lib/aim/publish-precheck-rules"
import { isComplianceExtraRuleEnabled } from "@/lib/launch-rules"

/** 小红书合规问题（兼容已有的 XhsReviewIssue 并带 severity/ruleId） */
export interface XhsComplianceIssue {
  /** 与既有 XhsReviewIssue.type 对齐：ruleId / absolute / emoji ... */
  type: string
  /** 规则 ID（命中 publish-precheck 规则时为原 rule id） */
  ruleId?: string
  severity: "high" | "medium" | "low"
  text: string
  suggestion: string
  category?: string
  sourceNote?: string
  matchedTerm?: string
}

/**
 * 按平台要求 severity 归一：high / medium / low。
 * 小红书与抖音统一对外不暴露「mid」旧写法。
 */
function normalizeSev(s: PublishPrecheckSeverity): "high" | "medium" | "low" {
  if (s === "mid") return "medium"
  return s
}

/**
 * @description 运行小红书专属合规检查（复用 PUBLISH_PRECHECK_RULES 同一规则对象，
 * 由 @/lib/launch-rules 中的 complianceExtraRules 开关决定是否加载 R06_* ~ R09_*）。
 *
 * 规则来源：src/lib/aim/publish-precheck-rules.ts，保持与抖音发布前自查
 * 一致的 id / severity / suggest / reason / replaceWith，保证双平台规则库统一。
 *
 * @param text 正文 + 标题拼接后的检查文本
 * @param overrideComplianceSwitch 测试用：可强制覆盖 complianceExtraRules 开关；
 *                                 缺省则读取全局 launch-rules。
 */
export function runXhsComplianceCheck(
  text: string,
  overrideComplianceSwitch?: boolean,
): XhsComplianceIssue[] {
  const extraEnabled =
    overrideComplianceSwitch !== undefined
      ? overrideComplianceSwitch
      : isComplianceExtraRuleEnabled()

  const hits: PublishPrecheckHit[] = runPublishPrecheck(text, extraEnabled, {
    rules: PUBLISH_PRECHECK_RULES,
  })

  // 只对外输出：1) baseline 中绝对化相关（命中）保持兼容；2) R06_* ~ R09_*
  // Task 10 特别要求 R06（品牌词）命中即输出 medium 提示；R07/R08/R09 同理至少各一条
  const issues: XhsComplianceIssue[] = hits.map((h) => ({
    type: h.ruleId.startsWith("R0") ? "rule" : "compliance",
    ruleId: h.ruleId,
    severity: normalizeSev(h.severity),
    text: `【${h.category}】命中「${h.matchedTerm}」：${h.reason}`,
    suggestion: h.suggest,
    category: h.category,
    sourceNote: h.sourceNote,
    matchedTerm: h.matchedTerm,
  }))

  // 保留原 Task 10 需要的命中对象数组（xhs-review 原结构 + 新规则复用）
  return issues
}

/** 便捷：只返回 Task 10 新增 R06_* ~ R09_* 的命中（方便外部消费者或单测） */
export function runXhsExtraComplianceOnly(
  text: string,
  overrideComplianceSwitch?: boolean,
): XhsComplianceIssue[] {
  const all = runXhsComplianceCheck(text, overrideComplianceSwitch)
  const extra = new Set<string>([...EXTRA_COMPLIANCE_RULE_IDS])
  return all.filter((x) => x.ruleId && extra.has(x.ruleId))
}

/** 与既有 XhsReviewIssue 兼容的视图（仅保留 type/text/suggestion 三字段）。 */
export function runXhsComplianceAsReviewIssues(
  text: string,
  overrideComplianceSwitch?: boolean,
): XhsReviewIssue[] {
  return runXhsComplianceCheck(text, overrideComplianceSwitch).map((x) => ({
    type: x.ruleId ?? x.type,
    text: x.text,
    suggestion: x.suggestion,
  }))
}
