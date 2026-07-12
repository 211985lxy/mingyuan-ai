import type { GenerateScriptCandidatesParams, TopicContext } from "./contracts"

export function buildMetaPromptMessages(contextBlock: string, params: GenerateScriptCandidatesParams) {
  return [
    {
      role: "system" as const,
      content: [
        "你是一位短视频营销策略专家。你的任务是：根据用户提供的上下文信息，为 3 条短视频文案分别生成完整的创作方向。",
        "必须输出 JSON 对象，不要输出解释文字。",
        "",
        "输出格式：",
        "{",
        '  "directions": [',
        '    {"openingStrategy": "...", "narrativeStyle": "...", "coreArgument": "...", "endingRequirement": "..."},',
        '    {"openingStrategy": "...", "narrativeStyle": "...", "coreArgument": "...", "endingRequirement": "..."},',
        '    {"openingStrategy": "...", "narrativeStyle": "...", "coreArgument": "...", "endingRequirement": "..."}',
        "  ]",
        "}",
        "",
        "要求：",
        "1. 必须返回 3 条 directions，不能少。",
        "2. 每条 direction 的四个字段都必须完整、具体、可执行，不能只写半句。",
        "3. 三条文案的开场策略和叙事风格必须明显不同。",
        "4. 如果提供了热点洞察与适配结论，必须遵守适配结论；当结论为 caution 或 avoid 时，不得强行把热点标题硬塞进文案。",
        "5. 结尾要求必须包含明确 CTA 导向。",
        ...buildTopicConstraints(params.topicContext),
      ].join("\n"),
    },
    { role: "user" as const, content: `请为以下上下文生成文案创作指令：\n\n${contextBlock}` },
  ]
}

function buildTopicConstraints(topic: TopicContext | null | undefined): string[] {
  if (!topic) return []
  return [
    "", "【开场公式约束】", "每条文案的 openingStrategy 必须基于以下开场公式模板之一进行创作：",
    ...topic.openingFormulas.map((formula, index) => `  公式${index + 1}：${formula}`),
    `开场类型要求：${topic.openingTypeName}`, "三条文案可以选择不同的公式，但都必须属于上述开场类型。",
    "", "【叙事节拍约束】", "每条文案的 narrativeStyle 必须严格遵循以下节拍顺序：",
    ...topic.copyStructureBeats.map((beat, index) => `  第${index + 1}拍 [${beat.label}]：${beat.instruction}`),
    `文案结构类型：${topic.copyStructureName}`, "文案内容必须按顺序覆盖每个节拍，不允许跳过或乱序。",
    "", "【结尾类型约束】", `每条文案的 endingRequirement 必须遵循「${topic.endingTypeName}」类型的结尾指导：`, topic.endingGuidance,
    "可参考结尾模式：", ...topic.endingPatterns.map((pattern, index) => `  ${index + 1}. ${pattern}`),
  ]
}
