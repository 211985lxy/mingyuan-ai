import { renderTemplate } from "@/lib/template-engine"
import { buildContextBlock } from "./context"
import type { GenerateScriptCandidatesParams, ScriptGenerationResult } from "./contracts"
import { DEFAULT_MODEL } from "./models"
import { resolveScriptScoringFields, scoreWithKeywords } from "./scoring"

export function fallbackResult(params: GenerateScriptCandidatesParams): ScriptGenerationResult {
  const candidates = generateWithFallback(params)
  const scores = candidates.map((c) => scoreWithKeywords(c, params))
  const indexed = candidates.map((c, i) => ({ candidate: c, score: scores[i] }))
  indexed.sort((a, b) => b.score.overall - a.score.overall)

  return {
    candidates: indexed.map((i) => i.candidate),
    scores: indexed.map((i) => i.score),
    promptText: buildContextBlock(params),
    model: DEFAULT_MODEL,
    isDegraded: true,
  }
}

function generateWithFallback(params: GenerateScriptCandidatesParams): string[] {
  const { template, inputs, hotTopicContext, ipProfile } = params
  const resolved = resolveScriptScoringFields(ipProfile)
  const base = renderTemplate(template.scriptTemplate, inputs)
  const opener = hotTopicContext
    ? hotTopicContext.fit.verdict === "strong"
      ? `最近「${hotTopicContext.title}」这个话题很火，它真正戳中的，是${hotTopicContext.fit.bridgeReason}`
      : hotTopicContext.fit.verdict === "caution"
        ? `最近很多人都在聊「${hotTopicContext.title}」，但比跟风更重要的，是看懂这件事背后的${hotTopicContext.fit.recommendedAngle}`
        : ""
    : ""
  const identity = resolved.displayName || resolved.nickname
    ? `我是${resolved.displayName || resolved.nickname}。`
    : ""
  const authority = resolved.proofPoints
    ? `先说结论，我的判断来自这些真实经验：${resolved.proofPoints}。`
    : ""
  const cta = resolved.callToAction
    ? `如果你也想把这套方法用到自己的生意里，${resolved.callToAction}。`
    : "如果你也遇到类似问题，评论区告诉我。"
  const targetAudience = resolved.targetAudience
    ? `如果你正是${resolved.targetAudience}，这条内容尤其适合你。`
    : ""
  const tone = resolved.toneOfVoice
    ? `整体表达口吻请保持${resolved.toneOfVoice}。`
    : ""
  const trait = resolved.ipTraits ? `记住，你的人设重点是${resolved.ipTraits}。` : ""
  const caution = hotTopicContext?.fit.caution?.length
    ? `避开这些硬蹭方式：${hotTopicContext.fit.caution.join("；")}。`
    : ""

  return [
    [opener, identity, base, authority, cta].filter(Boolean).join(" "),
    [identity, targetAudience, base, trait, cta].filter(Boolean).join(" "),
    [opener, caution, tone, base, cta].filter(Boolean).join(" "),
  ].map((c) => c.trim())
}
