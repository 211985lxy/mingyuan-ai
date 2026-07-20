import { buildHotTopicPromptSection } from "@/lib/hot-topic-intelligence"
import { appendIpSections, appendStructureSection, appendTemplateSections, appendTopicSections } from "./context-sections"
import type { GenerateScriptCandidatesParams } from "./contracts"

/**
 * @description 构建contextblock
 * @param params - 参数对象
 * @returns string
 */
export function buildContextBlock(params: GenerateScriptCandidatesParams): string {
  const sections: string[] = []
  appendIpSections(sections, params)
  appendTopicSections(sections, params.topicContext)
  appendStructureSection(sections, params.structure)
  appendTemplateSections(sections, params.template)
  appendBriefSection(sections, params)
  return sections.join("\n")
}

function appendBriefSection(sections: string[], params: GenerateScriptCandidatesParams): void {
  const inputLines = Object.entries(params.inputs).map(([key, value]) => `- ${key}: ${value}`).join("\n")
  sections.push("【视频 Brief】", inputLines || "未提供", "")
  if (params.hotTopicContext) {
    sections.push(buildHotTopicPromptSection(params.hotTopicContext.insight, params.hotTopicContext.fit))
  }
}
