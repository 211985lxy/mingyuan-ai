import type { GenerateScriptCandidatesParams, TopicContext } from "./contracts"
import { promptRegistry } from "@/lib/prompt/registry"
import { fillPromptTemplate } from "@/lib/prompt/template"
import { PROMPT_KEYS } from "@/lib/prompt/types"

/**
 * @description 构建metapromptmessages
 * @param contextBlock - 上下文块
 * @param params - 参数对象
 * @returns 无返回值
 */
export function buildMetaPromptMessages(contextBlock: string, params: GenerateScriptCandidatesParams) {
  const topicConstraints = params.topicContext
    ? `\n${buildTopicConstraints(params.topicContext).join("\n")}`
    : ""
  return [
    {
      role: "system" as const,
      content: fillPromptTemplate(
        promptRegistry.get(PROMPT_KEYS.scriptGenerationMetaSystem).content,
        { topicConstraints },
      ),
    },
    {
      role: "user" as const,
      content: fillPromptTemplate(
        promptRegistry.get(PROMPT_KEYS.scriptGenerationMetaUser).content,
        { contextBlock },
      ),
    },
  ]
}

function buildTopicConstraints(topic: TopicContext): string[] {
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
