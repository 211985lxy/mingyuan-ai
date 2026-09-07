import { AIM_HIGH_RISK_LOOP_RULE } from "@/lib/aim-agent-prompts"
import { promptRegistry } from "@/lib/prompt/registry"
import { fillPromptTemplate } from "@/lib/prompt/template"
import { PROMPT_KEYS } from "@/lib/prompt/types"

/**
 * 有真实发布数据就贴进去；没有就走「未登记」分支，禁止模型补编数字。
 */
export function buildPublishOutcomeSection(publishOutcomeBlock?: string): string {
  const block = publishOutcomeBlock?.trim()
  if (!block) {
    return `【发布数据】未登记发布数据。
你必须明确告诉用户：当前没有登记发布数据和线索归因，请先去登记这条内容发布后的真实结果（含加微/进线线索归因），再来做复盘。
绝对不许编造任何数字、播放量、点赞、评论、转发或转化结果。`
  }

  return `【发布数据】
${block}

以上是用户已登记的真实发布结果与线索归因。只基于这些数据判断，缺什么就说缺什么，不许补编数字。`
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
