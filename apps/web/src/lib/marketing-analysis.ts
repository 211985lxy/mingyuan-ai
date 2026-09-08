import { LLMClient } from "@/lib/llm"
import { promptRegistry } from "@/lib/prompt/registry"
import { PROMPT_KEYS } from "@/lib/prompt/types"

export interface MarketingAnalysis {
  overallScore: number
  dimensions: { name: string; score: number; comment: string }[]
  summary: string
  suggestions: string[]
}

/**
 * @description 分析marketing
 * @param scriptContent - script内容
 * @returns Promise<MarketingAnalysis>
 */
export async function analyzeMarketing(
  scriptContent: string
): Promise<MarketingAnalysis> {
  const llm = LLMClient.shared()

  const result = await llm.complete({
    // system prompt 已资产化（Prompt Registry）：DB 版本优先，兜底内置 seed v1（逐字原文）
    messages: promptRegistry.getMessages(
      PROMPT_KEYS.marketingShortvideo,
      `请分析以下视频口播文案的营销效果：\n\n${scriptContent}`,
    ),
    temperature: 0.3,
    maxTokens: 1000,
    responseFormat: { type: "json_object" },
  })

  // Strip markdown code fences if present (e.g. ```json ... ```)
  let raw = result.content.trim()
  if (raw.startsWith("```")) {
    raw = raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "")
  }

  const parsed = JSON.parse(raw) as MarketingAnalysis

  // Clamp scores to 0-100
  parsed.overallScore = Math.max(0, Math.min(100, parsed.overallScore))
  for (const dim of parsed.dimensions) {
    dim.score = Math.max(0, Math.min(100, dim.score))
  }

  return parsed
}
