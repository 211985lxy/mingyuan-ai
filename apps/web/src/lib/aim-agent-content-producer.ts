import { executeChatLLM, executeChatLLMStream } from "@/lib/aim-agent-model"
import { saveAimGenerationRecord } from "@/lib/aim-harness/persistence"
import { buildScenarioPromptBlock } from "@/lib/content-scenario-config"
import { FORMAT_INSTRUCTIONS, buildContentProducerChatPrompt } from "@/lib/aim-agent-prompts"
import {
  buildProducerSystemPrompt,
  buildUserPrompt,
  executeGenerateLLMWithBenchmarkRetry,
} from "@/lib/aim-generation-prompts"
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
    return buildContentProducerChatPrompt(params)
  }

  async chat(params: AimChatParams): Promise<AimChatResponse> {
    return executeChatLLM(this.agentId, this.buildChatPrompt(params), params.messages, params.modelPolicy)
  }

  streamChat(params: AimChatParams): AsyncIterable<string> {
    return executeChatLLMStream(this.agentId, this.buildChatPrompt(params), params.messages, params.modelPolicy)
  }

  async generate(context: AimGenerateContext): Promise<AimGenerateResponse> {
    const agentPrompt = "你是一个企业营销内容专家。根据用户提供的信息，选择性结合企业知识库素材，生成高质量的营销内容。"
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
    const record = await saveAimGenerationRecord(context, completion, parsed)

    return {
      id: record.id,
      results: context.targetFormats.map((format) => ({
        format,
        content: parsed[format] || "",
        wordCount: (parsed[format] || "").length,
      })),
      knowledgeUsed: record.knowledgeUsed as any[],
    }
  }
}
