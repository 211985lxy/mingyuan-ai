import type { GenerateScriptCandidatesParams, ScriptDirection } from "./contracts"

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
  const lines = [
    "请根据以下上下文创作短视频口播文案（条数按用户要求；未说明时先问一句要几条）。",
    "",
    contextBlock,
    "",
    "【共通要求】",
    "- 文案是可直接朗读的纯口播文本。",
    "- 不要输出任何结构标签、说明、括号注释、错误提示或 markdown。",
    "- 行动引导（CTA）只在用户明确要求或目标已确认为获客/成交时给出，不默认添加。",
  ]

  if (params.structure) {
    lines.push(
      `- 时长控制在 ${params.structure.blueprint.durationRange.min}-${params.structure.blueprint.durationRange.max} 秒。`,
    )
  }

  // COPY-03: Add beat-by-beat instructions to the meta-prompt
  if (params.topicContext) {
    const tc = params.topicContext
    lines.push(
      "",
      "【节拍遵循要求】",
      `文案必须按以下节拍顺序组织内容（${tc.copyStructureName}）：`,
    )
    tc.copyStructureBeats.forEach((beat, i) => {
      lines.push(`  第${i + 1}拍 [${beat.label}]：${beat.instruction}`)
    })
    lines.push(
      "",
      `结尾必须符合「${tc.endingTypeName}」类型：${tc.endingGuidance}`,
    )
  }

  lines.push("", "【三条文案的具体方向】")

  directions.forEach((direction, index) => {
    lines.push(
      `文案${index + 1}:`,
      `- 开场策略：${direction.openingStrategy}`,
      `- 叙事风格：${direction.narrativeStyle}`,
      `- 核心论点：${direction.coreArgument}`,
      `- 结尾要求：${direction.endingRequirement}`,
    )
  })

  return lines.join("\n")
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
  const lines = [
    "请基于以下上下文，直接创作多条不同角度的短视频口播文案（条数按用户要求）。",
    "",
    contextBlock,
    "",
    "【硬性要求】",
    "- 最终输出 JSON 对象，键名必须是 scripts，值必须是 3 条字符串。",
    "- 每条文案都要是可以直接朗读的纯文本，不要结构标签、括号注释、解释、道歉、报错或补充要求。",
    "- 三条文案的开场切入必须明显不同，不能只是改几个词。",
    "- 文案要自然使用 IP 的身份、Brief 信息和 CTA，不要把提示词原话照搬进成片文案。",
    "- 如果有热点适配判断，必须遵守；当结论为 caution 或 avoid 时，只能借情绪或观点，不能强蹭标题。",
  ]

  if (params.structure) {
    lines.push(
      `- 单条文案时长控制在 ${params.structure.blueprint.durationRange.min}-${params.structure.blueprint.durationRange.max} 秒。`,
    )
  }

  // COPY-03: Add beat constraints to direct generation prompt too
  if (params.topicContext) {
    const tc = params.topicContext
    lines.push(
      "",
      `- 文案结构必须按「${tc.copyStructureName}」的节拍顺序组织：`,
    )
    tc.copyStructureBeats.forEach((beat, i) => {
      lines.push(`  第${i + 1}拍 [${beat.label}]：${beat.instruction}`)
    })
    lines.push(
      `- 开场必须遵循「${tc.openingTypeName}」的公式风格`,
      `- 结尾必须符合「${tc.endingTypeName}」类型：${tc.endingGuidance}`,
    )
  }

  return lines.join("\n")
}
