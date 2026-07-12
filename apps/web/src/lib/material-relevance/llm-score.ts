import { LLMClient } from "@/lib/llm/client"
import { LLM_PASS_SCORE, SCORING_MODEL } from "./scoring-constants"
import type { BusinessContext, ScorableMediaRow, ScoredMediaRow, ScoringEntry } from "../material-relevance"

interface LLMScoreItem {
  id: string
  score: number
  reject: boolean
}

function unscoredRows(rows: ScorableMediaRow[], reason: string): ScoredMediaRow[] {
  return rows.map((row) => ({
    row,
    score: 50,
    rejected: false,
    tier: "llm" as const,
    rejectionReason: reason,
  }))
}

function parseScoreItems(content: string): LLMScoreItem[] {
  try {
    const parsed = JSON.parse(content)
    if (Array.isArray(parsed)) return parsed
    if (Array.isArray(parsed?.scores)) return parsed.scores
    if (Array.isArray(parsed?.results)) return parsed.results
  } catch {
    // A malformed model response falls back to a neutral pass.
  }
  return []
}

export async function scoreLLMBatch(
  rows: ScorableMediaRow[],
  context: BusinessContext,
  entry: ScoringEntry,
): Promise<ScoredMediaRow[]> {
  const llm = LLMClient.shared()
  if (!llm.available) return unscoredRows(rows, "LLM unavailable — passed through unscored")

  const candidates = rows.slice(0, 20)
  const candidatePayload = candidates.map((row) => ({
    id: `${row.provider}:${row.pexelsId}`,
    alt: row.alt ?? "",
  }))
  const contextSummary = [
    context.industry ? `行业: ${context.industry}` : null,
    context.primaryOffer ? `主营: ${context.primaryOffer}` : null,
    context.targetAudience ? `目标: ${context.targetAudience}` : null,
  ].filter(Boolean).join(", ").substring(0, 300)

  const systemPrompt = `你是一名图库素材相关性评估专家。
给定用户的业务背景和一批图库素材的描述，为每条素材评分（0-10），判断是否与用户的具体行业相关。

评分标准：
- 9-10：高度相关，直接展示用户行业的典型场景
- 6-8：相关，展示的内容符合用户业务方向
- 3-5：边缘相关，通用商业场景，非行业特定
- 0-2：不相关，展示了与用户行业无关的场景（如自然风景、其他行业）

输出 JSON：{"scores":[{"id":"pexels:123","score":7,"reject":false}]}
reject=true 当 score <= ${LLM_PASS_SCORE}。`

  try {
    const result = await llm.complete({
      model: SCORING_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `业务背景：${contextSummary}\n搜索角色：${entry.role}，搜索词：${entry.query}\n\n待评估素材：\n${JSON.stringify(candidatePayload)}` },
      ],
      temperature: 0.2,
      maxTokens: 800,
      responseFormat: { type: "json_object" },
    })
    const scoreMap = new Map(parseScoreItems(result.content).map((item) => [item.id, item]))

    return candidates.map((row) => {
      const scoreItem = scoreMap.get(`${row.provider}:${row.pexelsId}`)
      if (!scoreItem) return { row, score: 50, rejected: false, tier: "llm" as const }
      const llmScore = scoreItem.score ?? 5
      const rejected = llmScore <= LLM_PASS_SCORE
      return {
        row,
        score: Math.round((llmScore / 10) * 100),
        rejected: rejected || scoreItem.reject,
        tier: "llm" as const,
        ...(rejected ? { rejectionReason: `LLM score ${llmScore} <= ${LLM_PASS_SCORE}` } : {}),
      }
    })
  } catch {
    return unscoredRows(candidates, "LLM error — passed through unscored")
  }
}
