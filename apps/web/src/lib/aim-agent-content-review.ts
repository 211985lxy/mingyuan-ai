import { executeChatLLM, executeChatLLMStream, executeGenerateLLM } from "@/lib/aim-agent-model"
import { saveAimGenerationRecord } from "@/lib/aim-harness/persistence"
import { buildWorkflowContext } from "@/lib/aim-generation-prompts"
import type { ContentFormat } from "./aim-generator"
import type {
  AimAgentHandler,
  AimChatParams,
  AimChatResponse,
  AimGenerateContext,
  AimGenerateResponse,
} from "./aim-agent-handlers"
import {
  buildContentEditorRevisePrompt,
  buildContentReviewChatPrompt,
  buildContentReviewGeneratePrompt,
  parseEditorReviseOutput,
} from "./aim-agent-content-review-prompts"

export {
  buildContentEditorRevisePrompt,
  buildContentReviewChatPrompt,
  buildContentReviewGeneratePrompt,
  parseEditorReviseOutput,
} from "./aim-agent-content-review-prompts"

function buildChatContextBlock(params: { knowledgeBlock: string; conversationBlock?: string }) {
  return [params.conversationBlock, params.knowledgeBlock].filter(Boolean).join("\n\n")
}

// ─── 5. 发布质检官 (ContentReviewHandler) ────────────────────

export class ContentReviewHandler implements AimAgentHandler {
  agentId = "content_review" as const

  /** 发布质检官：报告模式仅 raw_copy；改稿模式产出 raw_copy（终稿包在标记里） */
  private static readonly ALLOWED_GENERATE_FORMATS = new Set<ContentFormat>(["raw_copy"])

  private buildChatPrompt(params: AimChatParams): string {
    return buildContentReviewChatPrompt(buildChatContextBlock(params))
  }

  async chat(params: AimChatParams): Promise<AimChatResponse> {
    return executeChatLLM(this.agentId, this.buildChatPrompt(params), params.messages, params.modelPolicy)
  }

  streamChat(params: AimChatParams): AsyncIterable<string> {
    return executeChatLLMStream(this.agentId, this.buildChatPrompt(params), params.messages, params.modelPolicy)
  }

  async generate(context: AimGenerateContext): Promise<AimGenerateResponse> {
    const safeTargets = context.targetFormats.filter((f) =>
      ContentReviewHandler.ALLOWED_GENERATE_FORMATS.has(f)
    )
    const effectiveFormats = safeTargets.length > 0 ? safeTargets : ["raw_copy" as ContentFormat]
    const reviewMode = context.reviewMode === "editor_revise" ? "editor_revise" : "review_report"

    const systemPrompt = reviewMode === "editor_revise"
      ? buildContentEditorRevisePrompt(context.knowledgeBlock)
      : buildContentReviewGeneratePrompt(context.knowledgeBlock)

    const workflowContext = buildWorkflowContext(context)
    const userPrompt = reviewMode === "editor_revise"
      ? `用户输入的待修订文案：
"${context.rawInput}"

${workflowContext ? `工作流上下文：
${workflowContext}

` : ""}请作为主编终审官输出修订终稿（含 DIFF 与 FINAL 标记）。`
      : `用户输入的待质检文案或质检要求：
"${context.rawInput}"

${workflowContext ? `工作流上下文：
${workflowContext}

` : ""}

请生成这份"发布前质检报告"。`

    const completion = await executeGenerateLLM(this.agentId, systemPrompt, userPrompt, context.modelPolicy)
    const rawText = completion.content.trim()

    let deliverable = rawText
    if (reviewMode === "editor_revise") {
      const parsed = parseEditorReviseOutput(rawText)
      deliverable = parsed.requestRewrite
        ? `[[AIM_EDITOR_DIFF]]\n${parsed.diffSummary}\n[[/AIM_EDITOR_DIFF]]\n\n（主编要求打回重写，未产出终稿）`
        : `${parsed.finalContent}\n\n[[AIM_EDITOR_DIFF]]\n${parsed.diffSummary}\n[[/AIM_EDITOR_DIFF]]`
    }

    const parsedFormats: Record<ContentFormat, string | undefined> = {
      video_script: undefined,
      wechat_article: undefined,
      moments_post: undefined,
      community_message: undefined,
      shooting_brief: undefined,
      koubo_script: undefined,
      xiaohongshu_post: undefined,
      raw_copy: deliverable,
    }

    const record = await saveAimGenerationRecord(context, completion, parsedFormats)

    return {
      id: record.id,
      results: effectiveFormats.map((format) => ({
        format,
        content: deliverable,
        wordCount: deliverable.length,
      })),
      knowledgeUsed: record.knowledgeUsed as any[],
    }
  }
}
