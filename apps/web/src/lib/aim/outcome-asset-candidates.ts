/**
 * 经营结果 → 资产候选（阶段 4 WP4.4 / WP-0 语义修复）
 * 只生成 pending 候选，不直接写入正式知识库。
 * 决策只看 verdictCode；userVerdict 仅作备注展示。
 */

import type { AssetCandidateDraft } from "@/lib/aim/asset-candidates"
import {
  isNegativeOutcomeVerdict,
  isPositiveOutcomeVerdict,
  resolveOutcomeVerdictCode,
  type OutcomeVerdictCodeOrUnknown,
} from "@/lib/aim/outcome-verdict"

export interface OutcomeAssetSource {
  outcomeId: string
  generationId: string
  projectId: string | null
  platform: string | null
  copy: string | null
  topicTitle?: string | null
  qualifiedLeadCount: number | null
  appointmentCount: number | null
  dealCount: number | null
  revenue: number | null
  /** @deprecated 仅展示备注，不得参与字符串包含判断 */
  userVerdict: string | null
  verdictCode?: string | null
  reason: string
}

/**
 * @description 从经营结果生成人工确认前的资产候选草稿
 */
export function buildAssetCandidatesFromOutcome(source: OutcomeAssetSource): AssetCandidateDraft[] {
  const drafts: AssetCandidateDraft[] = []
  const platform = source.platform || "未知平台"
  const titleBase = source.topicTitle?.trim() || `内容 ${source.generationId.slice(0, 8)}`
  const code = resolveOutcomeVerdictCode(source.verdictCode)
  const evidence = buildEvidence(source, code)

  // 成交/预约 → 转化案例候选（不是成功案例；成功案例须已审核客户结果，见 WP-4）
  if ((source.dealCount ?? 0) > 0 || (source.appointmentCount ?? 0) > 0) {
    drafts.push({
      kind: "case_candidate",
      title: `转化案例候选：${titleBase}`,
      content: [
        `平台：${platform}`,
        source.copy?.trim() ? `成稿摘录：\n${source.copy.trim().slice(0, 1200)}` : "（无成稿摘录）",
        `业务结果：${evidence}`,
        "说明：本条仅为转化信号候选；成功案例须另有已审核客户结果证据。",
      ].join("\n\n"),
      evidence,
      confidence: (source.dealCount ?? 0) > 0 ? "high" : "medium",
      crossProjectAllowed: false,
    })
  }

  // 正向码或有效线索 → 内容选题规律候选
  if ((source.qualifiedLeadCount ?? 0) > 0 || isPositiveOutcomeVerdict(code)) {
    drafts.push({
      kind: "content_topic",
      title: `有效内容规律：${titleBase}`,
      content: [
        `该内容在 ${platform} 产生有效经营信号。`,
        `判断码：${code}`,
        `原因：${source.reason}`,
        source.copy?.trim() ? `可复用片段：\n${source.copy.trim().slice(0, 800)}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      evidence,
      confidence: "medium",
      crossProjectAllowed: false,
    })
  }

  // 无效/失败 → 仅方法论修订；neutral / unknown 不生成成功或失败候选
  if (isNegativeOutcomeVerdict(code)) {
    drafts.push({
      kind: "methodology_revision",
      title: `无效内容警示：${titleBase}`,
      content: [
        `平台：${platform}`,
        `判断码：${code}`,
        source.userVerdict ? `用户备注：${source.userVerdict}` : "",
        `原因：${source.reason}`,
        "请人工确认后，再决定是否沉淀为禁区或方法论修订。",
      ]
        .filter(Boolean)
        .join("\n"),
      evidence,
      confidence: "low",
      crossProjectAllowed: false,
    })
  }

  return drafts
}

function buildEvidence(source: OutcomeAssetSource, code: OutcomeVerdictCodeOrUnknown): string {
  return [
    `outcomeId=${source.outcomeId}`,
    `generationId=${source.generationId}`,
    `平台=${source.platform || "未知平台"}`,
    `verdictCode=${code}`,
    source.qualifiedLeadCount != null ? `有效线索=${source.qualifiedLeadCount}` : "",
    source.appointmentCount != null ? `预约=${source.appointmentCount}` : "",
    source.dealCount != null ? `成交=${source.dealCount}` : "",
    source.revenue != null ? `收入=${source.revenue}` : "",
    source.userVerdict ? `用户备注=${source.userVerdict}` : "",
    `判定原因=${source.reason}`,
  ]
    .filter(Boolean)
    .join("；")
}
