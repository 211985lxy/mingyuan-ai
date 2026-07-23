/**
 * 经营结果 → 资产候选（阶段 4 WP4.4）
 * 只生成 pending 候选，不直接写入正式知识库。
 */

import type { AssetCandidateDraft } from "@/lib/aim/asset-candidates"

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
  userVerdict: string | null
  reason: string
}

/**
 * @description 从优秀经营结果生成人工确认前的资产候选草稿
 */
export function buildAssetCandidatesFromOutcome(source: OutcomeAssetSource): AssetCandidateDraft[] {
  const drafts: AssetCandidateDraft[] = []
  const platform = source.platform || "未知平台"
  const titleBase = source.topicTitle?.trim() || `内容 ${source.generationId.slice(0, 8)}`
  const evidence = [
    `outcomeId=${source.outcomeId}`,
    `generationId=${source.generationId}`,
    `平台=${platform}`,
    source.qualifiedLeadCount != null ? `有效线索=${source.qualifiedLeadCount}` : "",
    source.appointmentCount != null ? `预约=${source.appointmentCount}` : "",
    source.dealCount != null ? `成交=${source.dealCount}` : "",
    source.revenue != null ? `收入=${source.revenue}` : "",
    source.userVerdict ? `用户判断=${source.userVerdict}` : "",
    `判定原因=${source.reason}`,
  ]
    .filter(Boolean)
    .join("；")

  if ((source.dealCount ?? 0) > 0 || (source.appointmentCount ?? 0) > 0) {
    drafts.push({
      kind: "case_candidate",
      title: `结果验证案例：${titleBase}`,
      content: [
        `平台：${platform}`,
        source.copy?.trim() ? `成稿摘录：\n${source.copy.trim().slice(0, 1200)}` : "（无成稿摘录）",
        `业务结果：${evidence}`,
      ].join("\n\n"),
      evidence,
      confidence: (source.dealCount ?? 0) > 0 ? "high" : "medium",
      crossProjectAllowed: false,
    })
  }

  if ((source.qualifiedLeadCount ?? 0) > 0 || source.userVerdict?.includes("有效")) {
    drafts.push({
      kind: "content_topic",
      title: `有效内容规律：${titleBase}`,
      content: [
        `该内容在 ${platform} 产生有效经营信号。`,
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

  if (source.userVerdict?.includes("无效") || source.userVerdict?.includes("失败")) {
    drafts.push({
      kind: "methodology_revision",
      title: `无效内容警示：${titleBase}`,
      content: [
        `平台：${platform}`,
        `用户判断：${source.userVerdict}`,
        `原因：${source.reason}`,
        "请人工确认后，再决定是否沉淀为禁区或方法论修订。",
      ].join("\n"),
      evidence,
      confidence: "low",
      crossProjectAllowed: false,
    })
  }

  return drafts
}
