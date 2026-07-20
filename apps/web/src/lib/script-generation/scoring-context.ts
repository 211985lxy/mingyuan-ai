import type { GenerateScriptCandidatesParams } from "./contracts"
import type { ResolvedScoringFields } from "./scoring"

/**
 * @description 构建scoringprompt
 * @param candidates - candidates
 * @param params - 参数对象
 * @param resolved - resolved
 * @returns string
 */
export function buildScoringPrompt(
  candidates: string[],
  params: GenerateScriptCandidatesParams,
  resolved: ResolvedScoringFields,
): string {
  const lines = buildScoringDimensions(params.topicContext !== null && params.topicContext !== undefined)
  appendProfileContext(lines, params, resolved)
  appendTopicCriteria(lines, params)
  appendCandidateRequest(lines, candidates, params.topicContext !== null && params.topicContext !== undefined)
  return lines.join("\n")
}

function buildScoringDimensions(hasTopicContext: boolean): string[] {
  const lines = [
    "请为以下短视频口播文案打分（0-100），评估维度：", "",
    "1. structuralCompliance：是否遵循了视频结构蓝图的叙事节拍顺序",
    "2. briefCoverage：是否覆盖了用户Brief中的关键信息",
    "3. evidenceStrength：是否有具体的数据/案例/经验作为支撑",
    "4. ctaClarity：结尾是否有清晰的行动引导",
    "5. voiceFit：口吻是否匹配IP档案的人设和表达风格",
    "6. lengthOk：文案长度是否合理（1=合理，0=过长或过短）",
  ]
  if (hasTopicContext) lines.push("7. openingFormulaCompliance：开场是否遵循了指定的开场公式模板", "8. endingTypeCompliance：结尾是否符合指定的结尾类型要求")
  return lines
}

function appendProfileContext(
  lines: string[],
  params: GenerateScriptCandidatesParams,
  resolved: ResolvedScoringFields,
): void {
  lines.push("", "评分上下文：", `IP名称：${resolved.displayName || "未知"}`, `行业：${resolved.industry || "未知"}`, `口吻要求：${resolved.toneOfVoice || "未指定"}`, `IP特征：${resolved.ipTraits || "未指定"}`, `CTA方式：${resolved.callToAction || "未指定"}`)
  if (params.structure) {
    lines.push(`结构名：${params.structure.displayName}`, `叙事节拍：${params.structure.blueprint.narrativeBeats.join(" -> ")}`, `建议时长：${params.structure.blueprint.durationRange.min}-${params.structure.blueprint.durationRange.max}秒`)
  }
  lines.push(`Brief要点：${Object.entries(params.inputs).map(([key, value]) => `${key}: ${value}`).join(", ")}`)
}

function appendTopicCriteria(lines: string[], params: GenerateScriptCandidatesParams): void {
  const topic = params.topicContext
  if (!topic) return
  lines.push("", "开场公式评判标准：", `开场类型：${topic.openingTypeName}`, `公式模板：${topic.openingFormulas.join(" | ")}`, "", "结尾类型评判标准：", `结尾类型：${topic.endingTypeName}`, `结尾指导：${topic.endingGuidance}`, `结尾模式：${topic.endingPatterns.join(" | ")}`)
}

function appendCandidateRequest(lines: string[], candidates: string[], hasTopicContext: boolean): void {
  const outputFields = hasTopicContext
    ? "structuralCompliance, briefCoverage, evidenceStrength, ctaClarity, voiceFit, lengthOk(0或1), openingFormulaCompliance, endingTypeCompliance, overall"
    : "structuralCompliance, briefCoverage, evidenceStrength, ctaClarity, voiceFit, lengthOk(0或1), overall"
  lines.push("", "文案内容：", ...candidates.map((candidate, index) => `--- 文案${index + 1} ---\n${candidate}`), "", `输出纯 JSON 数组，包含 ${candidates.length} 个对象，每个对象有 ${outputFields} 字段。overall 是加权综合分。`)
}
