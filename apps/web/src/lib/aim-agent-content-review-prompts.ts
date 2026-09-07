import { AIM_HIGH_RISK_LOOP_RULE } from "@/lib/aim-agent-prompts"
import { promptRegistry } from "@/lib/prompt/registry"
import { fillPromptTemplate } from "@/lib/prompt/template"
import { PROMPT_KEYS } from "@/lib/prompt/types"

/**
 * @description 构建 content_review chat prompt
 */
export function buildContentReviewChatPrompt(contextBlock: string): string {
  return fillPromptTemplate(
    promptRegistry.get(PROMPT_KEYS.contentReviewChat).content,
    { contextBlock, highRiskRule: AIM_HIGH_RISK_LOOP_RULE },
  )
}

/**
 * @description 构建 content_review generate prompt（报告模式）
 */
export function buildContentReviewGeneratePrompt(knowledgeBlock: string): string {
  return fillPromptTemplate(
    promptRegistry.get(PROMPT_KEYS.contentReviewGenerate).content,
    { knowledgeBlock, highRiskRule: AIM_HIGH_RISK_LOOP_RULE },
  )
}

/**
 * Editor 改稿模式：终稿闸门，可直接替换 deliverable。
 */
export function buildContentEditorRevisePrompt(knowledgeBlock: string): string {
  return fillPromptTemplate(
    promptRegistry.get(PROMPT_KEYS.contentEditorRevise).content,
    { knowledgeBlock, highRiskRule: AIM_HIGH_RISK_LOOP_RULE },
  )
}

const EDITOR_FINAL_PATTERN = /\[\[AIM_EDITOR_FINAL\]\]([\s\S]*?)\[\[\/AIM_EDITOR_FINAL\]\]/
const EDITOR_DIFF_PATTERN = /\[\[AIM_EDITOR_DIFF\]\]([\s\S]*?)\[\[\/AIM_EDITOR_DIFF\]\]/

export function parseEditorReviseOutput(rawText: string): {
  finalContent: string
  diffSummary: string
  requestRewrite: boolean
} {
  const finalMatch = rawText.match(EDITOR_FINAL_PATTERN)
  const diffMatch = rawText.match(EDITOR_DIFF_PATTERN)
  const diffSummary = (diffMatch?.[1] || "").trim()
  const finalContent = (finalMatch?.[1] || "").trim()
  const requestRewrite = /request_rewrite/i.test(diffSummary) || (!finalContent && /打回|重写/.test(diffSummary))
  return {
    finalContent: finalContent || (requestRewrite ? "" : rawText.trim()),
    diffSummary: diffSummary || "已完成主编修订。",
    requestRewrite,
  }
}
