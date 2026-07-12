import { executeChatLLM, executeChatLLMStream, executeGenerateLLM } from "@/lib/aim-agent-model"
import { saveAimGenerationRecord } from "@/lib/aim-harness/persistence"
import { AIM_HIGH_RISK_LOOP_RULE } from "@/lib/aim-agent-prompts"
import { buildWorkflowContext } from "@/lib/aim-generation-prompts"
import type { ContentFormat } from "./aim-generator"
import type {
  AimAgentHandler,
  AimChatParams,
  AimChatResponse,
  AimGenerateContext,
  AimGenerateResponse,
} from "./aim-agent-handlers"

function buildChatContextBlock(params: { knowledgeBlock: string; conversationBlock?: string }) {
  return [params.conversationBlock, params.knowledgeBlock].filter(Boolean).join("\n\n")
}

export function buildContentReviewChatPrompt(contextBlock: string): string {
  return `你是「发布质检官」，负责对准备发布的口播、短视频脚本、公众号正文、朋友圈文案做发布前自查。

企业已有核心知识库（只作背景，不要抢走用户当前稿子的主题）：
${contextBlock}

${AIM_HIGH_RISK_LOOP_RULE}

你的对话原则：
1. 只做质检和最小修改建议，不要整篇重写，除非用户明确要求重写。
2. 优先检查：开头吸引力、逻辑顺畅、AI味/套话、文笔表达、平台风险、转化承接、流量潜力。
3. 输出必须包含：总体结论、必改问题、风险等级、流量潜力评分（0-100分）、最小修改建议、复检清单。
4. 如果发现疑似违规、绝对化、诱导私信、夸大承诺或平台敏感表达，明确标出原句和替换建议。
5. 如果用户没有提供完整文案，直接提醒用户粘贴稿子或选择最近生成稿，不要凭空质检。

请直接根据上文与用户的历史对话，输出发布前质检建议。`
}

export function buildContentReviewGeneratePrompt(knowledgeBlock: string): string {
  return `你是「发布质检官」，负责对准备发布的文案做发布前自查。

企业已有核心知识库（只作背景，不要抢走用户当前稿子的主题）：
${knowledgeBlock}

${AIM_HIGH_RISK_LOOP_RULE}

质检报告输出结构要求：
1. 总体结论：可发 / 改完可发 / 暂不建议发，并说明一句理由。
2. 必改问题：列出最影响发布的 1-5 个问题，指出原句或段落。
3. 平台风险：检查违规、限流、绝对化、夸大承诺、诱导私信、AI标注提醒等风险。
4. 表达质量：检查开头吸引力、逻辑、去AI味、文笔，不做空泛夸奖。
5. 流量潜力评分：给 0-100 分，只看停留钩子、评论争议、收藏价值、转粉/转化承接，不做播放量预测。
6. 最小修改建议：只给局部替换和删改建议，不要整篇重写。
7. 复检清单：用 3-5 条短句告诉用户改完后再看什么。

【禁止输出】新的营销文案、完整重写稿、播放量预测、发布后数据复盘。
如果用户没有提供完整文案，提示用户粘贴稿子或选择最近生成稿。
请直接输出质检报告，不写套话、黑话和前言。`
}

// ─── 5. 发布质检官 (ContentReviewHandler) ────────────────────

export class ContentReviewHandler implements AimAgentHandler {
  agentId = "content_review" as const

  /** 发布质检官仅产出 raw_copy 质检报告 */
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
    // ── 输出边界：只产出 raw_copy 质检报告 ──
    const safeTargets = context.targetFormats.filter((f) =>
      ContentReviewHandler.ALLOWED_GENERATE_FORMATS.has(f)
    )
    const effectiveFormats = safeTargets.length > 0 ? safeTargets : ["raw_copy" as ContentFormat]

    const systemPrompt = buildContentReviewGeneratePrompt(context.knowledgeBlock)

    const workflowContext = buildWorkflowContext(context)
    const userPrompt = `用户输入的待质检文案或质检要求：
"${context.rawInput}"

${workflowContext ? `工作流上下文：
${workflowContext}

` : ""}

请生成这份"发布前质检报告"。`

    const completion = await executeGenerateLLM(this.agentId, systemPrompt, userPrompt, context.modelPolicy)
    const rawText = completion.content.trim()

    const parsed: Record<ContentFormat, string | undefined> = {
      video_script: undefined,
      wechat_article: undefined,
      moments_post: undefined,
      community_message: undefined,
      shooting_brief: undefined,
      koubo_script: undefined,
      xiaohongshu_post: undefined,
      raw_copy: rawText,
    }

    const record = await saveAimGenerationRecord(context, completion, parsed)

    return {
      id: record.id,
      results: effectiveFormats.map((format) => ({
        format,
        content: rawText,
        wordCount: rawText.length,
      })),
      knowledgeUsed: record.knowledgeUsed as any[],
    }
  }
}

