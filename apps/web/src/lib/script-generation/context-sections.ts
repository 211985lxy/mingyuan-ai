import type { GenerateScriptCandidatesParams, TopicContext } from "./contracts"

/**
 * @description 追加ipsections
 * @param sections - sections
 * @param params - 参数对象
 * @returns 无返回值
 */
export function appendIpSections(sections: string[], params: GenerateScriptCandidatesParams): void {
  if (params.ipProfile?.promptSnapshot) {
    sections.push("【个人IP档案】", params.ipProfile.promptSnapshot, "")
  }
  if (params.ipWikiBlock) {
    sections.push(params.ipWikiBlock, "")
  }
  if (params.styleProfileBlock) {
    sections.push(
      "【写作风格档案 · 全局风格】",
      "以下是这位 IP 的长期写作风格认知模型（思维/情绪/结构/语言/价值观）。请在保持本次选题和结构节拍的同时，让措辞、节奏、语气贴合该风格。",
      params.styleProfileBlock,
      "",
    )
  }
  // ADR-002：命名方法论块（含来源边界 + 事实优先级声明，内容已由调用方装配好）
  if (params.selectedMethodologyBlock) {
    sections.push(params.selectedMethodologyBlock, "")
  }
}

/**
 * @description 追加topicsections
 * @param sections - sections
 * @param topic - 主题
 * @returns 无返回值
 */
export function appendTopicSections(sections: string[], topic: TopicContext | null | undefined): void {
  if (!topic) return
  sections.push("【选题信息】", `选题标题：${topic.topicTitle}`, `营销元素：${topic.elementTags.join("、")}`, "")
  sections.push(
    "【开场公式】",
    `开场类型：${topic.openingTypeName}（${topic.openingTypeCode}）`,
    "公式模板：",
    ...topic.openingFormulas.map((formula, index) => `  ${index + 1}. ${formula}`),
    "",
  )
  sections.push(
    "【文案结构节拍】",
    `结构类型：${topic.copyStructureName}（${topic.copyStructureCode}）`,
    "节拍序列：",
    ...topic.copyStructureBeats.map((beat, index) => `  第${index + 1}拍 [${beat.label}]：${beat.instruction}`),
    "",
  )
  sections.push(
    "【结尾要求】",
    `结尾类型：${topic.endingTypeName}（${topic.endingTypeCode}）`,
    `结尾指导：${topic.endingGuidance}`,
    "结尾模式：",
    ...topic.endingPatterns.map((pattern, index) => `  ${index + 1}. ${pattern}`),
    "",
  )
}

/**
 * @description 追加structuresection
 * @param sections - sections
 * @param structure - structure
 * @returns 无返回值
 */
export function appendStructureSection(
  sections: string[],
  structure: GenerateScriptCandidatesParams["structure"],
): void {
  if (!structure) return
  const blueprint = structure.blueprint
  sections.push(
    "【视频结构蓝图】",
    `结构名：${structure.displayName}`,
    `开场模式：${blueprint.openingPattern}`,
    `叙事节拍：${blueprint.narrativeBeats.join(" -> ")}`,
    `证据位数量：${blueprint.evidenceSlots}`,
    `CTA 方式：${blueprint.ctaSlot}`,
    `节奏：${blueprint.pace ?? "medium"}`,
    `证据密度：${blueprint.evidenceDensity ?? "medium"}`,
    `CTA 强度：${blueprint.ctaStyle ?? "direct"}`,
    `建议时长：${blueprint.durationRange.min}-${blueprint.durationRange.max}秒（按每秒3-4字估算字数）`,
    "",
  )
}

/**
 * @description 追加templatesections
 * @param sections - sections
 * @param template - 模板
 * @returns 无返回值
 */
export function appendTemplateSections(sections: string[], template: GenerateScriptCandidatesParams["template"]): void {
  sections.push("【表达模板】", `模板名：${template.displayName}`, `模板说明：${template.description || "未提供"}`, `钩子类型：${template.hookType || "未提供"}`, `模板蓝图：${template.scriptTemplate}`, "")
  if (!template.expressionBlueprint) return
  sections.push(
    "【表达蓝图】",
    `论证模式：${template.expressionBlueprint.argumentPattern}`,
    `证据要求：${template.expressionBlueprint.proofBurden}`,
    `CTA 风格：${template.expressionBlueprint.ctaStyle}`,
    `热点适配：${template.expressionBlueprint.hotTopicModes.join(" / ") || "未提供"}`,
    `推荐搭配结构：${template.expressionBlueprint.recommendedStructures.join(" / ") || "未提供"}`,
    "",
  )
}
