import { executeChatLLM, executeChatLLMStream } from "@/lib/aim-agent-model"
import { saveAimGenerationRecord } from "@/lib/aim-harness/persistence"
import {
  AIM_HIGH_RISK_LOOP_RULE,
  PUBLISH_PACKAGE_CHAT_RULE,
} from "@/lib/aim-agent-prompts"
import {
  buildWorkflowContext,
  ensureContentCreationTrace,
  executeGenerateLLMWithBenchmarkRetry,
} from "@/lib/aim-generation-prompts"
import { splitGenerationReasoning } from "@/lib/aim-generation-text"
import { AIM_NORTH_STAR_GOAL, AIM_SESSION_PRIORITY_RULES, LIGHT_EDIT_OUTPUT_BOUNDARY } from "@/lib/aim-intent-boundaries"
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

/**
 * 作品编辑：只做文字二改/润色、公众号排版、小红书图文改写。
 * 深度长文 / 从零写稿已并入 content_producer，不要在这里抢活。
 */
export class WorkEditorHandler implements AimAgentHandler {
  agentId = "work_editor" as const

  /** 作品编辑产出以成稿正文为主；排版/图文也落在 raw_copy */
  private static readonly ALLOWED_GENERATE_FORMATS = new Set<ContentFormat>(["raw_copy", "wechat_article"])

  private buildChatPrompt(params: AimChatParams): string {
    const contextBlock = buildChatContextBlock(params)
    const latestUser = [...(params.messages ?? [])]
      .reverse()
      .find((m) => m?.role === "user" && typeof m?.content === "string")?.content || ""
    const workflowContext = buildWorkflowContext({
      taskSpec: params.taskSpec,
      rawInput: latestUser,
      runtimeTask: params.runtimeTask,
    })

    const isLightEdit = params.runtimeTask === "light_edit"
    const lightEditBlock = isLightEdit ? `\n${LIGHT_EDIT_OUTPUT_BOUNDARY}\n` : ""
    // 互斥约束：light_edit（局部润色）不注入「高风险任务验证规则 / 验证结果区块」。
    // 该规则自身声明「局部润色、单句改写不要追加验证结果区块」；若在 light_edit 下注入，
    // 模型会同时收到「保留原文、只改局部」与「追加验证结果区块」两个相反指令。
    const highRiskBlock = isLightEdit ? "" : `\n${AIM_HIGH_RISK_LOOP_RULE}`
    return fillPromptTemplate(
      promptRegistry.get(PROMPT_KEYS.workEditorChat).content,
      {
        northStarGoal: AIM_NORTH_STAR_GOAL,
        contextBlock,
        workflowBlock: workflowContext ? `\n工作流任务单：\n${workflowContext}\n` : "",
        methodologyBlock: params.methodologyBlock,
        ipWikiBlock: params.ipWikiBlock ? `\n${params.ipWikiBlock}` : "",
        lightEditBlock,
        highRiskBlock,
        publishPackageRule: PUBLISH_PACKAGE_CHAT_RULE,
        sessionPriorityRules: AIM_SESSION_PRIORITY_RULES,
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
    const allowed = context.targetFormats.filter((f) =>
      WorkEditorHandler.ALLOWED_GENERATE_FORMATS.has(f)
    )
    const safeTargets = allowed.length > 0 ? allowed : ["raw_copy" as ContentFormat]

    const knowledgeSection = context.knowledgeBlock?.trim()
      ? context.knowledgeBlock
      : `【知识库状态】当前未检索到与本次编辑相关的知识库内容。
降级策略：完全基于用户提供的成稿/素材完成编辑，不要编造企业案例或事实。`

    const systemPrompt = fillPromptTemplate(
      promptRegistry.get(PROMPT_KEYS.workEditorGenerate).content,
      {
        knowledgeSection,
        methodologyBlock: context.methodologyBlock
          ? `IP操盘方法论（编辑时参考）：\n${context.methodologyBlock}`
          : "",
        eventStorytellingBlock: context.eventStorytellingBlock,
        ipWikiBlock: context.ipWikiBlock ? `${context.ipWikiBlock}\n` : "",
        lightEditBlock: context.runtimeTask === "light_edit" ? `${LIGHT_EDIT_OUTPUT_BOUNDARY}\n` : "",
      },
    )

    const workflowContext = buildWorkflowContext(context)
    const userPrompt = fillPromptTemplate(
      promptRegistry.get(PROMPT_KEYS.workEditorGenerateUser).content,
      {
        rawInput: context.rawInput,
        workflowBlock: workflowContext ? `工作流上下文：\n${workflowContext}\n\n` : "",
      },
    )

    const { completion, parsed, safetyWarning } = await executeGenerateLLMWithBenchmarkRetry(
      this.agentId,
      systemPrompt,
      userPrompt,
      context,
      safeTargets,
    )

    const rawText = ensureContentCreationTrace(parsed.raw_copy || parsed.wechat_article || completion.content, context, safetyWarning)
    const traced = { ...parsed, raw_copy: rawText }
    const record = await saveAimGenerationRecord(context, completion, traced)

    const split = splitGenerationReasoning(rawText)
    return {
      id: record.id,
      results: safeTargets.map((format) => ({
        format,
        content: split.content,
        reasoningSummary: split.reasoningSummary,
        wordCount: split.content.length,
      })),
      knowledgeUsed: record.knowledgeUsed as any[],
      taskSpec: (record as { taskSpec?: import("@/lib/task-spec").TaskSpec }).taskSpec,
    }
  }
}
