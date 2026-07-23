import { executeChatLLM, executeChatLLMStream, executeGenerateLLM } from "@/lib/aim-agent-model"
import { saveAimGenerationRecord } from "@/lib/aim-harness/persistence"
import {
  CONTENT_CREATION_TRACE_RULE,
  buildCompactWorkflowContext,
  ensureContentCreationTrace,
} from "@/lib/aim-generation-prompts"
import { AIM_NORTH_STAR_GOAL } from "@/lib/aim-intent-boundaries"
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
    return `你是一个交货型文案写手，只负责听懂用户当前要求，并把文案直接交出来。

北极星目标：${AIM_NORTH_STAR_GOAL}

${backgroundSection}
${params.ipWikiBlock ? `\n${params.ipWikiBlock}` : ""}
${compactTask ? `\n${compactTask}` : ""}

规则：
1. 用户怎么要求就怎么写；用户的指令优先级高于模板、方法论、默认字数和系统习惯。
2. 用户要长就写长，用户要短就写短；没有明确字数时按内容自然长度写。
3. 不强制套爆款结构、开头库、结尾库、框架确认、观点池、95%-105% 字数规则或多平台拆分。
4. 不反问、不讲方法论、不输出分析报告；除非用户明确要求，只给一版可直接用的文案。
5. 保留人的语气，少用宣传腔、排比句和空泛总结。
6. 本轮意图与已知事实不得违背；信息不足时写「未提供/待补充」，禁止编造第一人称案例。
${includeCreationTrace ? `\n${CONTENT_CREATION_TRACE_RULE}` : ""}`
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
    const userPrompt = `请直接按用户要求写一版文案：
"${context.rawInput}"
${compactTask ? `\n${compactTask}` : ""}`
    const completion = await executeGenerateLLM(this.agentId, systemPrompt, userPrompt, context.modelPolicy)
    const content = ensureContentCreationTrace(completion.content, context)
    const record = await saveAimGenerationRecord(context, completion, { [format]: content } as Record<ContentFormat, string | undefined>)

    return {
      id: record.id,
      results: [{ format, content, wordCount: content.length }],
      knowledgeUsed: record.knowledgeUsed as any[],
      taskSpec: (record as { taskSpec?: import("@/lib/task-spec").TaskSpec }).taskSpec,
    }
  }
}
