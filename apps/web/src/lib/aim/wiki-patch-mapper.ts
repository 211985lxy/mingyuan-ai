/**
 * 会议洞察 → IP 维基 patch 候选（P3 纯域层）。
 *
 * 与 asset-candidates.ts 同构：从已审核的结构化洞察确定性映射出「维基 patch 候选」，
 * 但目标不是 KnowledgeEntry，而是 IP 维基页的增量内容追加。
 *
 * 映射规则（与 docs/plans/2026-08-02-meeting-agent-cloud-asr-plan.md P3 对齐）：
 * - pains        → audience（目标人群：客户痛点即人群画像补充）
 * - objections   → conversion_path（成交路径：异议即转化卡点）
 * - topicCandidates → topic_direction（选题方向）
 * - followUps    → viral_methodology（爆款方法论：有效话术即内容弹药）
 * - goals        → positioning（定位主张：目标反映价值诉求）
 *
 * 设计原则：
 * - 纯函数、确定性、可测试，不调用 LLM/不读写数据库。
 * - 每条候选只追加一行原文级内容，不重写整页——审批后由 repo.updateIpWikiPage 增量合并。
 * - 默认 confidence=medium、crossProjectAllowed=false，与 asset candidates 同闸门。
 * - 宁缺毋滥：某类洞察为空则不生成对应页的 patch。
 */
import type { MeetingInsight } from "@/lib/aim/meeting-insight"
import type { IpWikiPageType } from "@/lib/ip-wiki/types"

/** wiki_patch 候选在 AssetCandidate.kind 中的标识值。 */
export const WIKI_PATCH_KIND = "wiki_patch" as const

/** 维基 patch 候选草稿（生成阶段产物，落库前）。 */
export interface WikiPatchCandidateDraft {
  kind: typeof WIKI_PATCH_KIND
  /** 目标 IP 维基页类型。 */
  wikiPageType: IpWikiPageType
  title: string
  /** 要追加进维基页的内容（原文级，审批后增量合并）。 */
  content: string
  evidence: string
  confidence: "high" | "medium" | "low"
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
  return `（来源：会议「${meeting}」· 客户「${customer}」）`
}

/** 单条洞察语句 → 维基 patch 候选。 */
function fromStatement(
  wikiPageType: IpWikiPageType,
  text: string,
  confidence: "high" | "medium" | "low",
  insight: MeetingInsight,
): WikiPatchCandidateDraft {
  return {
    kind: WIKI_PATCH_KIND,
    wikiPageType,
    title: truncateTitle(`维基补充·${wikiPageType}｜${text}`),
    content: `- ${text} ${sourceLine(insight)}`,
    evidence: text,
    confidence,
    crossProjectAllowed: false,
  }
}

/**
 * 从结构化会议洞察构建 IP 维基 patch 候选。
 *
 * @returns 按页类型分组的候选数组；某类洞察为空则跳过对应页（宁缺毋滥）。
 */
export function buildWikiPatchCandidatesFromInsight(
  insight: MeetingInsight,
): WikiPatchCandidateDraft[] {
  const drafts: WikiPatchCandidateDraft[] = []

  for (const pain of insight.pains) {
    drafts.push(fromStatement("audience", pain, "high", insight))
  }
  for (const objection of insight.objections) {
    drafts.push(fromStatement("conversion_path", objection, "high", insight))
  }
  for (const topic of insight.topicCandidates) {
    drafts.push(fromStatement("topic_direction", topic, "medium", insight))
  }
  for (const followUp of insight.followUps) {
    drafts.push(fromStatement("viral_methodology", followUp, "medium", insight))
  }
  for (const goal of insight.goals) {
    drafts.push(fromStatement("positioning", goal, "medium", insight))
  }

  return drafts
}
