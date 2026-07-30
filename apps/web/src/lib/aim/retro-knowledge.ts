/**
 * 数据复盘结论沉淀知识库：分类、标签与溯源头。
 */

import type { AimAgentId } from "@/lib/aim-harness/contracts"
import type { KnowledgeCategory } from "@/lib/knowledge-categories"

export function resolveAimKnowledgeCategory(agentId: AimAgentId): KnowledgeCategory {
  if (agentId === "content_retro") return "user_insight"
  if (agentId === "content_review") return "benchmark_reference"
  return "positioning_material"
}

export function buildRetroKnowledgeTags(input: {
  generationId?: string | null
  collectWindowDay?: number | null
  source: "paste" | "chat" | "manual"
}): string[] {
  const tags = ["aim_retro", `source:${input.source}`]
  if (input.generationId) tags.push(`generation:${input.generationId}`)
  if (input.collectWindowDay === 7 || input.collectWindowDay === 14 || input.collectWindowDay === 30) {
    tags.push(`window:${input.collectWindowDay}`)
  }
  return tags
}

export function buildRetroKnowledgeContent(input: {
  generationId: string
  platform?: string | null
  metricsSummary?: string | null
  retroBody: string
}): string {
  const lines = [
    "【溯源】",
    `内容 ID：${input.generationId}`,
    `平台：${input.platform?.trim() || "未填写"}`,
    `数据摘要：${input.metricsSummary?.trim() || "见正文 / 未结构化登记"}`,
    "",
    "【复盘结论】",
    input.retroBody.trim(),
  ]
  return lines.join("\n")
}

export function resolveAimKnowledgeSourceType(agentId: AimAgentId): "manual" | "import" {
  if (agentId === "content_retro") return "import"
  return "manual"
}
