import { executeChatLLM, executeChatLLMStream, executeGenerateLLM } from "@/lib/aim-agent-model"
import { saveAimGenerationRecord } from "@/lib/aim-harness/persistence"
import { AIM_HIGH_RISK_LOOP_RULE } from "@/lib/aim-agent-prompts"
import { buildWorkflowContext } from "@/lib/aim-generation-prompts"
import { promptRegistry } from "@/lib/prompt/registry"
import { fillPromptTemplate } from "@/lib/prompt/template"
import { PROMPT_KEYS } from "@/lib/prompt/types"
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
export class BusinessSystemDiagnosisHandler implements AimAgentHandler {
  agentId = "business_system_diagnosis" as const

  /** 商业诊断官仅产出诊断报告 */
  private static readonly ALLOWED_GENERATE_FORMATS = new Set<ContentFormat>(["raw_copy"])

  private buildChatPrompt(params: AimChatParams): string {
    return fillPromptTemplate(
      promptRegistry.get(PROMPT_KEYS.businessSystemDiagnosisChat).content,
      {
        contextBlock: buildChatContextBlock(params),
        businessDiagnosisBlock: params.businessDiagnosisBlock,
        highRiskRule: AIM_HIGH_RISK_LOOP_RULE,
      },
    )
  }

  async chat(params: AimChatParams): Promise<AimChatResponse> {
    return executeChatLLM(this.agentId, this.buildChatPrompt(params), params.messages, params.modelPolicy)
  }

  streamChat(params: AimChatParams): AsyncIterable<string> {
    return executeChatLLMStream(this.agentId, this.buildChatPrompt(params), params.messages, params.modelPolicy)
  }

  async generate(context: AimGenerateContext): Promise<AimGenerateResponse> {
    // ── 输出边界：只产出 raw_copy 诊断报告 ──
    const safeTargets = context.targetFormats.filter((f) =>
      BusinessSystemDiagnosisHandler.ALLOWED_GENERATE_FORMATS.has(f)
    )
    const effectiveFormats = safeTargets.length > 0 ? safeTargets : ["raw_copy" as ContentFormat]

    const systemPrompt = fillPromptTemplate(
      promptRegistry.get(PROMPT_KEYS.businessSystemDiagnosisGenerate).content,
      {
        businessDiagnosisBlock: context.businessDiagnosisBlock,
        knowledgeBlock: context.knowledgeBlock,
        highRiskRule: AIM_HIGH_RISK_LOOP_RULE,
      },
    )

    const workflowContext = buildWorkflowContext(context)
    const userPrompt = fillPromptTemplate(
      promptRegistry.get(PROMPT_KEYS.businessSystemDiagnosisGenerateUser).content,
      {
        rawInput: context.rawInput,
        workflowSection: workflowContext ? `工作流上下文：\n${workflowContext}\n\n` : "",
      },
    )

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
