import { LLMClient } from "@/lib/llm"

export interface MarketingAnalysis {
  overallScore: number
  dimensions: { name: string; score: number; comment: string }[]
  summary: string
  suggestions: string[]
}

const SYSTEM_PROMPT = `你是一位专业的短视频营销分析师。请根据用户提供的视频口播文案，从营销角度进行全面分析。

请以 JSON 格式返回分析结果，格式如下：
{
  "overallScore": <0-100的整体营销评分>,
  "dimensions": [
    {"name": "开场吸引力", "score": <0-100>, "comment": "<简短评价>"},
    {"name": "内容说服力", "score": <0-100>, "comment": "<简短评价>"},
    {"name": "行动号召力", "score": <0-100>, "comment": "<简短评价>"},
    {"name": "品牌一致性", "score": <0-100>, "comment": "<简短评价>"},
    {"name": "情感共鸣", "score": <0-100>, "comment": "<简短评价>"}
  ],
  "summary": "<一段整体评价，2-3句话>",
  "suggestions": ["<改进建议1>", "<改进建议2>", "<改进建议3>"]
}

评分标准：
- 开场吸引力：前3秒是否能抓住观众注意力，是否有悬念/痛点/反差
- 内容说服力：卖点阐述是否清晰，是否有数据/案例/对比支撑
- 行动号召力：是否有明确的行动引导（关注/点赞/购买/评论）
- 品牌一致性：是否有个人IP特征、口头禅、统一风格
- 情感共鸣：语言是否自然亲切，能否引起目标受众共鸣

请严格只返回 JSON，不要包含其他文字。`

export async function analyzeMarketing(
  scriptContent: string
): Promise<MarketingAnalysis> {
  const llm = LLMClient.shared()

  const result = await llm.complete({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `请分析以下视频口播文案的营销效果：\n\n${scriptContent}` },
    ],
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
