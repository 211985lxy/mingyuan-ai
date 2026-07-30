/**
 * AIM chat execution preparation.
 *
 * Builds the objects needed by the harness (chatParams, runRequest,
 * streamRequest) and the post-execution memory persistence closure.
 * Extracted from chat-context.ts (WP-3).
 */
import {
  addAimTraceStep,
  finishAimTrace,
  type AimTraceRecorder,
} from "@/lib/aim-observability"
import {
  persistMemoriesFromConversation,
} from "@/lib/aim-memory"
import type { AssembledAimChatContext } from "./context-assembly"
import type { CopyStudioModule } from "@/lib/copy-studio"

export type AimChatExecutionInput = ReturnType<typeof prepareAimChatExecution>

/**
 * Prepare all objects needed for chat execution (without calling Harness).
 *
 * Returns chatParams, a context_summary trace step, non-streaming runRequest,
 * streaming streamRequest, and a fire-and-forget memory persistence closure.
 *
 * All values match the original route fields exactly — this is a pure move.
 */
/**
 * @description prepareaimchatexecution
 * @param input - 输入数据
 * @returns 无返回值
 */
export function prepareAimChatExecution(input: {
  context: AssembledAimChatContext
  userId: string
  projectId: string
  agentId: string
  /** 本轮执行引擎（技能跨引擎委托）。缺省等于 agentId。 */
  executionAgentId?: string
  shouldStream: boolean
  trace?: AimTraceRecorder
  agentModule?: CopyStudioModule
  writerModule?: CopyStudioModule
}) {
  const { context, userId, projectId, agentId, trace } = input
  const { query, normalizedMessages, runtimeTask, conversationIntent, knowledgeBlock } = context
  const executionAgentId = input.executionAgentId ?? agentId
  const delegated = executionAgentId !== agentId
  // 创作台模块会把 modelPolicy.routeKey 改写成 copy_studio.*，覆盖目标引擎自己的
  // provider 链；它属于会话智能体的控件状态，委托轮不带过去。
  const agentModule = delegated ? undefined : input.agentModule
  const writerModule = delegated ? undefined : input.writerModule

  const chatParams = {
    userId,
    projectId: projectId || undefined,
    messages: normalizedMessages,
    knowledgeBlock,
    conversationIntent,
    runtimeTask,
    trace,
    // ADR-002：命名方法论块透传到 handler（buildAimChatRuntime 会纳入预算）
    selectedMethodologyBlock: context.selectedMethodologyBlock,
    publishOutcomeBlock: context.publishOutcomeBlock,
  }

  const summaryStep = {
    key: "context_summary",
    label: "上下文汇总",
    status: "success" as const,
    summary: "聊天上下文已汇总",
    metadata: {
      runtimeTask,
      conversationMode: conversationIntent.mode,
      knowledgeEntries: context.knowledgeEntries,
      knowledgeSource: context.knowledgeSource,
      knowledgeChars: knowledgeBlock.length,
      executionAgentId,
      delegatedExecution: delegated,
    },
  }

  const runRequest = {
    entrypoint: "chat" as const,
    rawInput: query,
    // Harness 的 agentId 就是"本轮谁来执行"：planner 据此定 modelPolicy.routeKey，
    // domain-executor 据此取 handler。会话归属另由 persistMemory / trace 保持。
    agentId: executionAgentId,
    messages: normalizedMessages,
    trace,
    actorId: userId,
    projectId: projectId || undefined,
    runtimeTask,
    conversationMode: conversationIntent.mode,
    agentModule,
    writerModule,
  }

  const streamRequest = { ...runRequest, contextManifest: context.contextManifest, stream: true }

  const persistMemory = () => {
    if (!projectId || !agentId) return
    persistMemoriesFromConversation(normalizedMessages, { userId, projectId, agentId }).catch(() => {})
  }

  return { chatParams, summaryStep, runRequest, streamRequest, persistMemory }
}
