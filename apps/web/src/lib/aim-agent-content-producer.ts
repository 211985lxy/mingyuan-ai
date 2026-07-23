import { executeChatLLM, executeChatLLMStream } from "@/lib/aim-agent-model"
import { saveAimGenerationRecord } from "@/lib/aim-harness/persistence"
import { buildScenarioPromptBlock } from "@/lib/content-scenario-config"
import { FORMAT_INSTRUCTIONS, buildContentProducerChatPrompt } from "@/lib/aim-agent-prompts"
import {
  buildProducerSystemPrompt,
  buildUserPrompt,
  buildWorkflowContext,
  ensureContentCreationTrace,
  executeGenerateLLMWithBenchmarkRetry,
} from "@/lib/aim-generation-prompts"
import { AIM_NORTH_STAR_GOAL } from "@/lib/aim-intent-boundaries"
import type {
  AimAgentHandler,
  AimChatParams,
  AimChatResponse,
  AimGenerateContext,
  AimGenerateResponse,
} from "./aim-agent-handlers"

export class ContentProducerHandler implements AimAgentHandler {
  agentId = "content_producer" as const

  private buildChatPrompt(params: AimChatParams): string {
    const latestUser = [...(params.messages ?? [])]
      .reverse()
      .find((m) => m?.role === "user" && typeof m?.content === "string")?.content || ""
    const workflowContext = buildWorkflowContext({
      taskSpec: params.taskSpec,
      rawInput: latestUser,
      runtimeTask: params.runtimeTask,
    })
    return buildContentProducerChatPrompt({
      conversationBlock: params.conversationBlock,
      knowledgeBlock: params.knowledgeBlock,
      methodologyBlock: params.methodologyBlock,
      ipWikiBlock: params.ipWikiBlock,
      selectedMethodologyBlock: params.selectedMethodologyBlock,
      workflowContext,
      runtimeTask: params.runtimeTask,
      knowledgeStrategy: params.knowledgeStrategy,
    })
  }

  async chat(params: AimChatParams): Promise<AimChatResponse> {
    return executeChatLLM(this.agentId, this.buildChatPrompt(params), params.messages, params.modelPolicy)
  }

  streamChat(params: AimChatParams): AsyncIterable<string> {
    return executeChatLLMStream(this.agentId, this.buildChatPrompt(params), params.messages, params.modelPolicy)
  }

  async generate(context: AimGenerateContext): Promise<AimGenerateResponse> {
    const agentPrompt = `你是企业营销内容专家（内容创作官）。${AIM_NORTH_STAR_GOAL}根据用户提供的信息与客户档案，生成高质量、可拍摄可发布的营销内容。`
    const formatBlocks = context.targetFormats
      .map((format) => FORMAT_INSTRUCTIONS[format])
      .join("\n\n---\n\n")
    const scenarioBlock = buildScenarioPromptBlock(context.contentScenario)
    const systemPrompt = buildProducerSystemPrompt(agentPrompt, context) + scenarioBlock
    const userPrompt = buildUserPrompt(context, formatBlocks)
    const { completion, parsed } = await executeGenerateLLMWithBenchmarkRetry(
      this.agentId,
      systemPrompt,
      userPrompt,
      context,
      context.targetFormats,
    )
    const traced = Object.fromEntries(
      context.targetFormats.map((format) => [
        format,
        ensureContentCreationTrace(parsed[format] || "", context),
      ]),
    ) as Record<(typeof context.targetFormats)[number], string>
    const record = await saveAimGenerationRecord(context, completion, traced)

    return {
      id: record.id,
      results: context.targetFormats.map((format) => ({
        format,
        content: traced[format],
        wordCount: traced[format].length,
      })),
      knowledgeUsed: record.knowledgeUsed as any[],
    }
  }
}
