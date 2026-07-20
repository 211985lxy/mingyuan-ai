import { LLMClient } from "@/lib/llm/client"
import type { ApiHotTopicFit } from "@/types/api"
import { asString, asStringArray, clampScore, normalizeVerdict, safeJsonParse } from "./formatting"
import { HotTopicIntelligenceError, type FitInput } from "./types"

/**
 * @description 评估hottopicfituncached
 * @param input - 输入数据
 * @param ipSnapshot - ip快照
 * @returns Promise<ApiHotTopicFit>
 */
export async function evaluateHotTopicFitUncached(
  input: FitInput,
  ipSnapshot: string,
): Promise<ApiHotTopicFit> {
  const llm = LLMClient.shared()
  if (!llm.available) {
    throw new HotTopicIntelligenceError(
      "HOT_TOPIC_FIT_UNAVAILABLE",
      "AI 服务暂不可用，无法评估热点适配度",
      503,
    )
  }

  const parsed = await requestFitEvaluation(llm, buildFitMessages(input, ipSnapshot))
  if (!parsed) {
    throw new HotTopicIntelligenceError(
      "HOT_TOPIC_FIT_PARSE_FAILED",
      "热点适配评估解析失败",
      500,
    )
  }
  return normalizeFit(input, parsed)
}

function buildFitMessages(input: FitInput, ipSnapshot: string) {
  const briefLines = Object.entries(input.inputs).map(([key, value]) => `- ${key}: ${value}`).join("\n")
  return [
    {
      role: "system" as const,
      content: [
        "你是一位严苛的营销总监，要判断一个热点是否适合借势到当前营销视频。",
        "你只能基于提供的热点洞察、IP 档案、模板、视频结构和 Brief 做判断，不允许编造。",
        "如果热点与业务关系弱、容易硬蹭、容易引发反感，必须明确给出 caution 或 avoid。",
        "返回 JSON，字段必须包含：score, verdict, fitSummary, bridgeReason, recommendedAngle, recommendedHook, ctaDirection, caution。",
        "verdict 只能是 strong、caution、avoid。",
        "score 为 0-100 整数。",
        "不要输出 markdown，不要输出解释文字，只返回一个 JSON 对象。",
      ].join("\n"),
    },
    {
      role: "user" as const,
      content: [
        `【热点】${input.topicTitle}`,
        "",
        "【热点洞察】",
        `摘要：${input.insight.summary}`,
        `为什么火：${input.insight.whyTrending}`,
        `营销母题：${input.insight.marketingThemes.join("、") || "无"}`,
        `风险等级：${input.insight.riskLevel}`,
        `注意事项：${input.insight.caution.join("；") || "无"}`,
        `不建议角度：${input.insight.notRecommendedAngles.join("；") || "无"}`,
        "",
        "【IP 档案】",
        ipSnapshot,
        "",
        "【表达模板】",
        `模板名：${input.template.displayName}`,
        `模板说明：${input.template.description || "未提供"}`,
        `钩子类型：${input.template.hookType || "未提供"}`,
        `模板蓝图：${input.template.scriptTemplate}`,
        ...(input.template.expressionBlueprint
          ? [
              `论证模式：${input.template.expressionBlueprint.argumentPattern}`,
              `证据要求：${input.template.expressionBlueprint.proofBurden}`,
              `CTA风格：${input.template.expressionBlueprint.ctaStyle}`,
            ]
          : []),
        "",
        "【视频结构】",
        `结构名：${input.structure.displayName}`,
        `开场模式：${input.structure.blueprint.openingPattern}`,
        `叙事节拍：${input.structure.blueprint.narrativeBeats.join(" -> ")}`,
        `CTA方式：${input.structure.blueprint.ctaSlot}`,
        "",
        "【当前 Brief】",
        briefLines || "未提供",
      ].join("\n"),
    },
  ]
}

async function requestFitEvaluation(
  llm: ReturnType<typeof LLMClient.shared>,
  messages: ReturnType<typeof buildFitMessages>,
): Promise<Record<string, unknown> | null> {
  let parsed: Record<string, unknown> | null = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await llm.complete({
      messages,
      temperature: attempt === 0 ? 0.3 : 0.1,
      maxTokens: 1200,
      responseFormat: { type: "json_object" },
    })

    parsed = safeJsonParse(result.content)
    if (parsed) {
      break
    }
  }
  return parsed
}

function normalizeFit(input: FitInput, parsed: Record<string, unknown>): ApiHotTopicFit {
  return {
    topicId: input.insight.topicId,
    title: input.topicTitle,
    score: clampScore(parsed.score),
    verdict: normalizeVerdict(parsed.verdict),
    fitSummary: asString(parsed.fitSummary, "该热点与当前营销内容的关联度有限。"),
    bridgeReason: asString(parsed.bridgeReason, "当前业务与热点缺少自然桥接点。"),
    recommendedAngle: asString(parsed.recommendedAngle, "回到业务核心价值，不要强行引用热点。"),
    recommendedHook: asString(parsed.recommendedHook, "从业务判断或用户痛点切入。"),
    ctaDirection: asString(parsed.ctaDirection, input.ipProfile?.callToAction || "引导用户进一步咨询或互动。"),
    caution: asStringArray(parsed.caution),
    evaluatedAt: new Date().toISOString(),
  }
}
