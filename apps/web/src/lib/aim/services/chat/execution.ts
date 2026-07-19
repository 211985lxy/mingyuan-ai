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

export type AimChatExecutionInput = ReturnType<typeof prepareAimChatExecution>

/**
 * Prepare all objects needed for chat execution (without calling Harness).
 *
 * Returns chatParams, a context_summary trace step, non-streaming runRequest,
 * streaming streamRequest, and a fire-and-forget memory persistence closure.
 *
 * All values match the original route fields exactly — this is a pure move.
 */
export function prepareAimChatExecution(input: {
  context: AssembledAimChatContext
  userId: string
  projectId: string
  agentId: string
  shouldStream: boolean
  trace?: AimTraceRecorder
  agentModule?: "social" | "longform" | "free"
  writerModule?: "social" | "longform" | "free"
}) {
  const { context, userId, projectId, agentId, trace } = input
  const { query, normalizedMessages, runtimeTask, conversationIntent, knowledgeBlock } = context

  const chatParams = {
    userId,
    projectId: projectId || undefined,
    messages: normalizedMessages,
    knowledgeBlock,
    conversationIntent,
    runtimeTask,
    trace,
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
    },
  }

  const runRequest = {
    entrypoint: "chat" as const,
    rawInput: query,
    agentId,
    messages: normalizedMessages,
    trace,
    actorId: userId,
    projectId: projectId || undefined,
    runtimeTask,
    conversationMode: conversationIntent.mode,
    agentModule: input.agentModule,
    writerModule: input.writerModule,
  }

  const streamRequest = { ...runRequest, contextManifest: context.contextManifest, stream: true }

  const persistMemory = () => {
    if (!projectId || !agentId) return
    persistMemoriesFromConversation(normalizedMessages, { userId, projectId, agentId }).catch(() => {})
  }

  return { chatParams, summaryStep, runRequest, streamRequest, persistMemory }
}
