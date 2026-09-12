import type { GenerateScriptCandidatesParams, ScriptDirection } from "./contracts"
import { promptRegistry } from "@/lib/prompt/registry"
import { fillPromptTemplate } from "@/lib/prompt/template"
import { PROMPT_KEYS } from "@/lib/prompt/types"

function durationLine(
  params: GenerateScriptCandidatesParams,
  prefix: string,
): string {
  if (!params.structure) return ""
  const { min, max } = params.structure.blueprint.durationRange
  return `\n${prefix}${min}-${max} 秒。`
}

function topicSectionForDirect(params: GenerateScriptCandidatesParams): string {
  const tc = params.topicContext
  if (!tc) return ""
  const beats = tc.copyStructureBeats
    .map((beat, i) => `  第${i + 1}拍 [${beat.label}]：${beat.instruction}`)
    .join("\n")
  return [
    "",
    "",
    `- 文案结构必须按「${tc.copyStructureName}」的节拍顺序组织：`,
    beats,
    `- 开场必须遵循「${tc.openingTypeName}」的公式风格`,
    `- 结尾必须符合「${tc.endingTypeName}」类型：${tc.endingGuidance}`,
  ].join("\n")
}

function topicSectionForMetaText(params: GenerateScriptCandidatesParams): string {
  const tc = params.topicContext
  if (!tc) return ""
  const beats = tc.copyStructureBeats
    .map((beat, i) => `  第${i + 1}拍 [${beat.label}]：${beat.instruction}`)
    .join("\n")
  return [
    "",
    "",
    "【节拍遵循要求】",
    `文案必须按以下节拍顺序组织内容（${tc.copyStructureName}）：`,
    beats,
    "",
    `结尾必须符合「${tc.endingTypeName}」类型：${tc.endingGuidance}`,
  ].join("\n")
}

function formatDirections(directions: ScriptDirection[]): string {
  return directions.map((direction, index) => [
    `文案${index + 1}:`,
    `- 开场策略：${direction.openingStrategy}`,
    `- 叙事风格：${direction.narrativeStyle}`,
    `- 核心论点：${direction.coreArgument}`,
    `- 结尾要求：${direction.endingRequirement}`,
  ].join("\n")).join("\n")
}

/**
 * @description 构建metaprompttext
 * @param contextBlock - 上下文块
 * @param params - 参数对象
 * @param directions - directions
 * @returns string
 */
export function buildMetaPromptText(
  contextBlock: string,
  params: GenerateScriptCandidatesParams,
  directions: ScriptDirection[],
): string {
  return fillPromptTemplate(
    promptRegistry.get(PROMPT_KEYS.scriptGenerationMetaText).content,
    {
      contextBlock,
      durationLine: durationLine(params, "- 时长控制在 "),
      topicSection: topicSectionForMetaText(params),
      directions: formatDirections(directions),
    },
  )
}

/**
 * @description 构建directgenerationprompt
 * @param contextBlock - 上下文块
 * @param params - 参数对象
 * @returns string
 */
export function buildDirectGenerationPrompt(
  contextBlock: string,
  params: GenerateScriptCandidatesParams,
): string {
  return fillPromptTemplate(
    promptRegistry.get(PROMPT_KEYS.scriptGenerationDirect).content,
    {
      contextBlock,
      durationLine: durationLine(params, "- 单条文案时长控制在 "),
      topicSection: topicSectionForDirect(params),
    },
  )
}
