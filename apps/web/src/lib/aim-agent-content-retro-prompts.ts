import { AIM_HIGH_RISK_LOOP_RULE } from "@/lib/aim-agent-prompts"
import { promptRegistry } from "@/lib/prompt/registry"
import { fillPromptTemplate } from "@/lib/prompt/template"
import { PROMPT_KEYS } from "@/lib/prompt/types"

/**
 * 有真实发布数据就贴进去；没有就走「未登记」分支，禁止模型补编数字。
 * 两个分支文案正本已入 prompt registry（批3）。
 */
export function buildPublishOutcomeSection(publishOutcomeBlock?: string): string {
  const block = publishOutcomeBlock?.trim()
  if (!block) {
    return promptRegistry.get(PROMPT_KEYS.contentRetroOutcomeMissing).content
  }

  return fillPromptTemplate(
    promptRegistry.get(PROMPT_KEYS.contentRetroOutcomePresent).content,
    { block },
  )
}

/**
 * @description 构建 content_retro chat prompt
 */
export function buildContentRetroChatPrompt(params: {
  contextBlock: string
  publishOutcomeBlock?: string
}): string {
  return fillPromptTemplate(
    promptRegistry.get(PROMPT_KEYS.contentRetroChat).content,
    {
      contextBlock: params.contextBlock,
      publishOutcomeSection: buildPublishOutcomeSection(params.publishOutcomeBlock),
      highRiskRule: AIM_HIGH_RISK_LOOP_RULE,
    },
  )
}

/**
 * @description 构建 content_retro generate prompt
 */
export function buildContentRetroGeneratePrompt(params: {
  knowledgeBlock: string
  publishOutcomeBlock?: string
}): string {
  return fillPromptTemplate(
    promptRegistry.get(PROMPT_KEYS.contentRetroGenerate).content,
    {
      knowledgeBlock: params.knowledgeBlock,
      publishOutcomeSection: buildPublishOutcomeSection(params.publishOutcomeBlock),
      highRiskRule: AIM_HIGH_RISK_LOOP_RULE,
    },
  )
}
