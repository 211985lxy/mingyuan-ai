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
  buildContentRetroChatPrompt,
  buildContentRetroGeneratePrompt,
} from "./aim-agent-content-retro-prompts"

export {
  buildContentRetroChatPrompt,
  buildContentRetroGeneratePrompt,
  buildPublishOutcomeSection,
} from "./aim-agent-content-retro-prompts"

function buildChatContextBlock(params: { knowledgeBlock: string; conversationBlock?: string }) {
  return [params.conversationBlock, params.knowledgeBlock].filter(Boolean).join("\n\n")
}

// ─── 数据复盘 (ContentRetroHandler) ────────────────────

export class ContentRetroHandler implements AimAgentHandler {
  agentId = "content_retro" as const

  /** 数据复盘：报告模式仅 raw_copy */
  private static readonly ALLOWED_GENERATE_FORMATS = new Set<ContentFormat>(["raw_copy"])

  private buildChatPrompt(params: AimChatParams): string {
    return buildContentRetroChatPrompt({
      contextBlock: buildChatContextBlock(params),
      publishOutcomeBlock: params.publishOutcomeBlock,
    })
  }

  async chat(params: AimChatParams): Promise<AimChatResponse> {
    return executeChatLLM(this.agentId, this.buildChatPrompt(params), params.messages, params.modelPolicy)
  }

  streamChat(params: AimChatParams): AsyncIterable<string> {
    return executeChatLLMStream(this.agentId, this.buildChatPrompt(params), params.messages, params.modelPolicy)
  }

  async generate(context: AimGenerateContext): Promise<AimGenerateResponse> {
    const safeTargets = context.targetFormats.filter((f) =>
      ContentRetroHandler.ALLOWED_GENERATE_FORMATS.has(f)
    )
    const effectiveFormats = safeTargets.length > 0 ? safeTargets : ["raw_copy" as ContentFormat]

    const systemPrompt = buildContentRetroGeneratePrompt({
      knowledgeBlock: context.knowledgeBlock,
      publishOutcomeBlock: context.publishOutcomeBlock,
    })

    const workflowContext = buildWorkflowContext(context)
    const userPrompt = `用户输入的待复盘内容或复盘要求：
"${context.rawInput}"

${workflowContext ? `工作流上下文：
${workflowContext}

` : ""}请生成这份「内容数据复盘」。`

    const completion = await executeGenerateLLM(this.agentId, systemPrompt, userPrompt, context.modelPolicy)
    const deliverable = completion.content.trim()

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
