import { executeChatLLM, executeChatLLMStream } from "@/lib/aim-agent-model"
import { saveAimGenerationRecord } from "@/lib/aim-harness/persistence"
import {
  CONTENT_CREATION_TRACE_RULE,
  buildCompactWorkflowContext,
  ensureContentCreationTrace,
  executeGenerateLLMWithBenchmarkRetry,
} from "@/lib/aim-generation-prompts"
import { splitGenerationReasoning } from "@/lib/aim-generation-text"
import { AIM_NORTH_STAR_GOAL, LIGHT_EDIT_OUTPUT_BOUNDARY } from "@/lib/aim-intent-boundaries"
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

function latestUserText(messages: AimChatParams["messages"] | undefined): string {
  if (!messages?.length) return ""
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i]
    if (m?.role === "user" && typeof m.content === "string") return m.content
  }
  return ""
}

export class FreeCopywriterHandler implements AimAgentHandler {
  agentId = "free_copywriter" as const

  private buildPrompt(params: {
    knowledgeBlock: string
    conversationBlock?: string
    ipWikiBlock: string
    taskSpec?: AimGenerateContext["taskSpec"] | AimChatParams["taskSpec"]
    rawInput?: string
    runtimeTask?: AimGenerateContext["runtimeTask"] | AimChatParams["runtimeTask"]
  }, includeCreationTrace = false): string {
    const contextBlock = [params.conversationBlock, params.knowledgeBlock].filter(Boolean).join("\n\n")
    const backgroundSection = contextBlock.trim()
      ? `可参考的业务背景：\n${contextBlock}`
      : `当前无业务背景资料，完全基于用户输入和通用创作能力完成。`
    const compactTask = buildCompactWorkflowContext(params.taskSpec, {
      rawInput: params.rawInput,
      runtimeTask: params.runtimeTask,
    })
    const lightEditBoundary = params.runtimeTask === "light_edit"
      ? `\n${LIGHT_EDIT_OUTPUT_BOUNDARY}`
      : ""
    return fillPromptTemplate(
      promptRegistry.get(PROMPT_KEYS.freeCopywriterSystem).content,
      {
        northStarGoal: AIM_NORTH_STAR_GOAL,
        backgroundSection,
        ipWikiBlock: params.ipWikiBlock ? `\n${params.ipWikiBlock}` : "",
        compactTask: compactTask ? `\n${compactTask}` : "",
        lightEditBoundary,
        creationTrace: includeCreationTrace ? `\n${CONTENT_CREATION_TRACE_RULE}` : "",
      },
    )
  }

  async chat(params: AimChatParams): Promise<AimChatResponse> {
    return executeChatLLM(
      this.agentId,
      this.buildPrompt({
        ...params,
        rawInput: latestUserText(params.messages),
        runtimeTask: params.runtimeTask,
      }),
      params.messages,
      params.modelPolicy,
    )
  }

  streamChat(params: AimChatParams): AsyncIterable<string> {
    return executeChatLLMStream(
      this.agentId,
      this.buildPrompt({
        ...params,
        rawInput: latestUserText(params.messages),
        runtimeTask: params.runtimeTask,
      }),
      params.messages,
      params.modelPolicy,
    )
  }

  async generate(context: AimGenerateContext): Promise<AimGenerateResponse> {
    const format = "raw_copy" as ContentFormat
    const systemPrompt = this.buildPrompt({
      ...context,
      rawInput: context.rawInput,
      runtimeTask: context.runtimeTask,
    }, true)
    const compactTask = buildCompactWorkflowContext(context.taskSpec, {
      rawInput: context.rawInput,
      runtimeTask: context.runtimeTask,
      confirmedTurnIntent: context.confirmedTurnIntent,
    })
    const userPrompt = fillPromptTemplate(
      promptRegistry.get(PROMPT_KEYS.freeCopywriterGenerateUser).content,
      {
        rawInput: context.rawInput,
        polishLine: context.polishInstruction ? `修改要求：${context.polishInstruction}` : "",
        compactTask: compactTask ? `\n${compactTask}` : "",
      },
    )
    const { completion, parsed, safetyWarning } = await executeGenerateLLMWithBenchmarkRetry(
      this.agentId,
      systemPrompt,
      userPrompt,
      context,
      [format],
    )
    const content = ensureContentCreationTrace(
      parsed[format] || completion.content,
      context,
      safetyWarning,
    )
    const record = await saveAimGenerationRecord(context, completion, { [format]: content } as Record<ContentFormat, string | undefined>)

    const split = splitGenerationReasoning(content)
    return {
      id: record.id,
      results: [{ format, content: split.content, reasoningSummary: split.reasoningSummary, wordCount: split.content.length }],
      knowledgeUsed: record.knowledgeUsed as any[],
      taskSpec: (record as { taskSpec?: import("@/lib/task-spec").TaskSpec }).taskSpec,
    }
  }
}
