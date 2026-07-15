/**
 * AIM 聊天上下文装配服务（WP-12 Commit B）。
 *
 * 从 api/aim/chat/route.ts 原样迁出：消息规范化、流式响应封装、以及普通聊天路径的
 * 上下文装配。路由瘦身到只保留：认证 → 限额 → 输入校验 → trace 起 → toolAction 分支
 * → 调本模块装配上下文 → streamAimRun/executeAimRun → 响应。
 *
 * 不可变契约（与原 route 字节一致）：
 *  - 所有 runAimTraceStep 的 key/label/顺序/summary/metadata 一字不改；
 *  - 上下文块拼接顺序 [editor, memory, baseKnowledge, style, competitor] 不变；
 *  - contextManifest 的构建顺序（raw_input → knowledge entries → contextBlocks）不变；
 *  - 知识库/竞品/记忆召回的 .catch 回退值不变。
 */
import { buildAimKnowledgeContext } from "@/lib/aim-knowledge-context"
import { buildAimCompetitorWatchContext } from "@/lib/aim-competitor-watch-context"
import { handleLarkToolAction } from "@/lib/aim-tool-actions"
import {
  resolveAimRuntimeTask,
  shouldUseKnowledgeContextForTask,
  shouldUseMarketViralContextForTask,
} from "@/lib/aim-knowledge-strategy"
import { getStyleProfileBlock } from "@/lib/style-profile"
import { formatEditorContextForPrompt, type AimEditorContext } from "@/lib/aim-editor"
import { resolveAimConversationIntent } from "@/lib/aim-conversation-intent"
import {
  addAimTraceStep,
  failAimTrace,
  finishAimTrace,
  runAimTraceStep,
  summarizeText,
  type AimTraceRecorder,
} from "@/lib/aim-observability"
import {
  retrieveAimMemory,
  retrieveLayeredAimMemory,
  formatAimMemoryBlock,
  persistMemoriesFromConversation,
  type AimMemoryMessage,
} from "@/lib/aim-memory"
import { NextResponse } from "next/server"
import { streamAimChatDomain } from "@/lib/aim-harness/domain-executor"
import { sha256 } from "@/lib/aim-harness/hashing"
import type { AimContextSource } from "@/lib/aim-harness/types"

/** 把 chat 请求里的 messages 规范化为记忆提炼所需格式（只保留 user/assistant 的文本内容）。 */
export function normalizeMemoryMessages(messages: unknown): AimMemoryMessage[] {
  if (!Array.isArray(messages)) return []
  return messages
    .map((item) => {
      const role = (item as { role?: unknown })?.role
      const content = (item as { content?: unknown })?.content
      if (role !== "user" && role !== "assistant") return null
      const trimmed = extractTextContent(content).trim()
      if (!trimmed) return null
      return { role, content: trimmed } as AimMemoryMessage
    })
    .filter((item): item is AimMemoryMessage => item !== null)
}

export function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return ""
      const item = part as { type?: unknown; text?: unknown }
      return item.type === "text" && typeof item.text === "string" ? item.text : ""
    })
    .filter(Boolean)
    .join("\n")
}

export function streamChatContent(
  chunks: AsyncIterable<string>,
  trace?: AimTraceRecorder,
  options?: { runId?: string; finalize?: (output: string, ok: boolean) => Promise<void> }
) {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream({
      async start(controller) {
        const startedAt = Date.now()
        let output = ""
        try {
          for await (const chunk of chunks) {
            output += chunk
            controller.enqueue(encoder.encode(chunk))
          }
          await addAimTraceStep(trace, {
            key: "llm_stream_chat",
            label: "LLM 流式聊天生成",
            status: "success",
            durationMs: Date.now() - startedAt,
            outputSummary: summarizeText(output),
          })
          await finishAimTrace(trace, { outputSummary: summarizeText(output) })
          await options?.finalize?.(output, true)
          controller.close()
        } catch (error) {
          await addAimTraceStep(trace, {
            key: "llm_stream_chat",
            label: "LLM 流式聊天生成",
            status: "failed",
            durationMs: Date.now() - startedAt,
            error: error instanceof Error ? error.message : String(error),
          })
          await failAimTrace(trace, error)
          await options?.finalize?.(output, false)
          controller.error(error)
        }
      },
    }),
    {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        // 关闭 nginx 代理缓冲，确保流式 token 即时下发到客户端，
        // 否则 nginx 会攒齐整个响应，长耗时时易触发 504。
        "X-Accel-Buffering": "no",
        // aim-harness-v1: expose the execution number on the stream response.
        ...(options?.runId ? { "X-AIM-Run-Id": options.runId } : {}),
      },
    },
  )
}

/**
 * 检索并拼接聊天上下文的各个块（knowledge / style / competitor / editor / memory）。
 *
 * 这是 assembleAimChatContext 的一个真实子职责：intent 已知后，按原 route 的门控与
 * 顺序逐块召回（每个块经 runAimTraceStep 包裹），再按固定顺序 [editor, memory,
 * baseKnowledge, style, competitor] 拼成 knowledgeBlock。顺序、门控、catch 回退一字不改。
 */
type RetrievedChatContextBlocks = {
  knowledgeBlock: string
  knowledgeContext: { entries: Array<{ id: string; content: string }>; source: string }
  styleBlock: string
  competitorWatchBlock: string
  editorBlock: string
  memoryBlock: string
}

async function retrieveChatContextBlocks(input: {
  userId: string
  projectId: string
  agentId: string
  query: string
  editorContext?: AimEditorContext
  conversationIntent: Awaited<ReturnType<typeof resolveAimConversationIntent>>
  runtimeTask: ReturnType<typeof resolveAimRuntimeTask>
  trace?: AimTraceRecorder
}): Promise<RetrievedChatContextBlocks> {
  const { userId, projectId, agentId, query, editorContext, conversationIntent, runtimeTask, trace } = input
  const shouldUseKnowledgeContext = conversationIntent.useKnowledge || shouldUseKnowledgeContextForTask(runtimeTask)
  const shouldUseMarketContext =
    conversationIntent.useKnowledge && shouldUseMarketViralContextForTask(runtimeTask)
  const knowledgeContext = shouldUseKnowledgeContext
    ? await runAimTraceStep(
        trace,
        "knowledge_context",
        "知识库召回",
        () => buildAimKnowledgeContext({
          userId,
          projectId: projectId || "<no-project>",
          agentId,
          query,
        }).catch(() => ({ knowledgeBlock: "", entries: [], source: "raw" as const })),
        (result) => ({
          summary: `命中 ${result.entries.length} 条知识`,
          metadata: { entries: result.entries.length, source: result.source },
        }),
      )
    : { knowledgeBlock: "", entries: [], source: "skipped" as const }

  // 用户级全局写作风格档案：独立检索，绕开 buildAimKnowledgeContext 的 projectId 硬过滤
  const styleBlock = conversationIntent.useStyleProfile
    ? await runAimTraceStep(
        trace,
        "style_profile",
        "风格档案召回",
        () => getStyleProfileBlock(userId, projectId || null).catch(() => ""),
        (block) => ({ summary: block ? "已召回" : "无风格档案", metadata: { chars: block.length } }),
      )
    : ""
  const competitorWatchBlock =
    agentId === "business_diagnosis" && shouldUseMarketContext
      ? await runAimTraceStep(
          trace,
          "competitor_context",
          "竞品上下文召回",
          () => buildAimCompetitorWatchContext(userId, query).catch(() => ""),
          (block) => ({ summary: block ? "已召回竞品上下文" : "无竞品上下文", metadata: { chars: block.length } }),
        )
      : ""
  const editorBlock = await runAimTraceStep(
    trace,
    "editor_context",
    "编辑器上下文注入",
    () => formatEditorContextForPrompt(editorContext),
    (block) => ({ summary: block ? "已注入选中文案" : "无编辑器上下文", metadata: { chars: block.length } }),
  )
  // 历史记忆召回：此前对话沉淀的决策/偏好/事实，注入以保持一致性
  const memoryRows = conversationIntent.useLongTermMemory
    ? await runAimTraceStep(
        trace,
        "aim_memory",
        "历史记忆召回",
        () => projectId
          ? retrieveAimMemory({ userId, projectId, agentId }).catch(() => [])
          : retrieveLayeredAimMemory({ userId, projectId, agentId }).catch(() => []),
        (rows) => ({ summary: `召回 ${rows.length} 条记忆`, metadata: { count: rows.length } }),
      )
    : []
  const memoryBlock = formatAimMemoryBlock(memoryRows)
  // Current editor selection and explicit memory are highest-signal when the
  // downstream runtime budget truncates this combined context block.
  const knowledgeBlock = [editorBlock, memoryBlock, knowledgeContext.knowledgeBlock, styleBlock, competitorWatchBlock].filter(Boolean).join("\n")

  return { knowledgeBlock, knowledgeContext, styleBlock, competitorWatchBlock, editorBlock, memoryBlock }
}

/**
 * 用召回的块构建 contextManifest（来源清单）。
 *
 * 顺序与原 route 一致：raw_input → knowledge entries → contextBlocks（memory /
 * competitor / style / editor / conversation_history），非空块才入清单。
 */
function buildChatContextManifest(input: {
  query: string
  blocks: RetrievedChatContextBlocks
  normalizedMessages: AimMemoryMessage[]
}): AimContextSource[] {
  const { query, blocks, normalizedMessages } = input
  const manifest: AimContextSource[] = [
    {
      kind: "request",
      id: "raw_input",
      charCount: query.length,
      contentHash: sha256(query),
    },
    ...blocks.knowledgeContext.entries.map((entry) => ({
      kind: "knowledge" as const,
      id: entry.id,
      charCount: entry.content.length,
      contentHash: sha256(entry.content),
    })),
  ]
  const contextBlocks: Array<[AimContextSource["kind"], string, string]> = [
    ["memory", "long_term_memory", blocks.memoryBlock],
    ["competitor_watch", "competitor_watch", blocks.competitorWatchBlock],
    ["methodology", "style_profile", blocks.styleBlock],
    ["history", "editor_context", blocks.editorBlock],
    ["history", "conversation_history", JSON.stringify(normalizedMessages)],
  ]
  for (const [kind, id, content] of contextBlocks) {
    if (content) manifest.push({ kind, id, charCount: content.length, contentHash: sha256(content) })
  }
  return manifest
}

export type AssembledAimChatContext = {
  /** 透传给 chatParams / streamAimRun 的运行任务标签 */
  runtimeTask: ReturnType<typeof resolveAimRuntimeTask>
  /** 透传给 chatParams / streamAimRun 的对话意图 */
  conversationIntent: Awaited<ReturnType<typeof resolveAimConversationIntent>>
  /** 拼接后的知识上下文块（editor + memory + knowledge + style + competitor） */
  knowledgeBlock: string
  /** 用于 streamAimRun / snapshot 的来源清单 */
  contextManifest: AimContextSource[]
  /** 归一化后的消息（用于记忆提炼与 snapshot） */
  normalizedMessages: AimMemoryMessage[]
  /** 截断到 500 字的用户查询（snapshot 原始输入用） */
  query: string
  /** 知识库命中的条目数（透传到 context_summary trace，保持原可观测性） */
  knowledgeEntries: number
  /** 知识上下文来源标签（raw / skipped / …，保持原可观测性） */
  knowledgeSource: string
}

/**
 * 普通聊天路径的上下文装配：意图识别 → 知识/风格/竞品/编辑器/记忆块召回
 * → knowledgeBlock 拼接 → contextManifest 构建。
 *
 * 顺序、门控、catch 回退、trace step 全部与原 route 字节一致。
 */
export async function assembleAimChatContext(input: {
  userId: string
  projectId: string
  agentId: string
  messages: unknown[]
  editorContext?: AimEditorContext
  trace?: AimTraceRecorder
}): Promise<AssembledAimChatContext> {
  const { userId, projectId, agentId, messages, editorContext, trace } = input
  const lastMessage = messages[messages.length - 1] as { content?: unknown } | undefined
  const query = extractTextContent(lastMessage?.content).slice(0, 500)
  const runtimeTask = resolveAimRuntimeTask({
    agentId,
    input: query,
  })
  const conversationIntent = await runAimTraceStep(
    trace,
    "conversation_intent",
    "对话意图识别",
    () => resolveAimConversationIntent({ agentId, messages: messages as never }),
    (intent) => ({
      summary: `${intent.mode} (${intent.reason})`,
      metadata: {
        confidence: intent.confidence,
        useKnowledge: intent.useKnowledge,
        useMethodology: intent.useMethodology,
        useLongTermMemory: intent.useLongTermMemory,
        useStyleProfile: intent.useStyleProfile,
      },
    }),
  )

  const blocks = await retrieveChatContextBlocks({
    userId,
    projectId,
    agentId,
    query,
    editorContext,
    conversationIntent,
    runtimeTask,
    trace,
  })
  const normalizedMessages = normalizeMemoryMessages(messages)
  const contextManifest = buildChatContextManifest({ query, blocks, normalizedMessages })

  return {
    runtimeTask,
    conversationIntent,
    knowledgeBlock: blocks.knowledgeBlock,
    contextManifest,
    normalizedMessages,
    query,
    knowledgeEntries: blocks.knowledgeContext.entries.length,
    knowledgeSource: blocks.knowledgeContext.source,
  }
}

export type AimChatExecutionParams = {
  userId: string
  projectId: string
  agentId: string
  shouldStream: boolean
}

/** 解析后的 aim/chat 请求体字段（route 层输入校验，逐字迁出原 POST）。 */
export type AimChatRequestBody = {
  messages: unknown[]
  agentId: string
  projectId: string
  toolAction: string
  resultId: string
  shouldStream: boolean
  editorContext?: AimEditorContext
}

/** 把原始 body 规整成 aim/chat 需要的强类型字段（route 层只做输入校验）。 */
export function parseAimChatBody(body: unknown): AimChatRequestBody {
  const record = (body ?? {}) as Record<string, unknown>
  return {
    messages: record.messages as unknown[],
    agentId: typeof record.agentId === "string" ? record.agentId : "",
    projectId: typeof record.projectId === "string" ? (record.projectId as string).trim() : "",
    toolAction: typeof record.toolAction === "string" ? record.toolAction : "",
    resultId: typeof record.resultId === "string" ? (record.resultId as string).trim() : "",
    shouldStream: record.stream === true,
    editorContext: typeof record.editorContext === "object" && record.editorContext
      ? (record.editorContext as AimEditorContext)
      : undefined,
  }
}

/**
 * 飞书工具动作分支：校验项目归属后委托 handleLarkToolAction，并盖 trace。
 * 从原 POST 逐字迁出（含「请先选择 IP 营销全案」400 与 finishAimTrace 顺序）。
 */
export async function handleToolActionBranch(input: {
  trace?: AimTraceRecorder
  toolAction: string
  userId: string
  projectId: string
  resultId: string
}): Promise<NextResponse> {
  const { trace, toolAction, userId, projectId, resultId } = input
  if (!projectId) {
    return NextResponse.json({ error: "请先选择 IP 营销全案" }, { status: 400 })
  }
  const result = await runAimTraceStep(
    trace,
    "tool_action",
    "工具动作执行",
    () => handleLarkToolAction(toolAction, { userId, projectId, resultId }),
    (res) => ({ outputSummary: summarizeText(res) }),
  )
  await finishAimTrace(trace, { outputSummary: summarizeText(result) })
  return NextResponse.json(result)
}

/**
 * 准备聊天执行所需的全部对象（不调用 Harness —— Harness 调用留在 route，满足
 * 架构护栏 R1「正式入口必须调用 executeAimRun/streamAimRun」）。
 *
 * 返回：chatParams（喂 executeAimChatDomain）、非流式 executeAimRun 请求、流式
 * streamAimRun 请求、context_summary trace step、fire-and-forget 记忆沉淀闭包。
 * 所有值与原 route 字段一致，只是搬运到调用方。
 */
export type AimChatExecutionInput = ReturnType<typeof prepareAimChatExecution>

export function prepareAimChatExecution(input: {
  context: AssembledAimChatContext
  userId: string
  projectId: string
  agentId: string
  shouldStream: boolean
  trace?: AimTraceRecorder
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
  }

  const streamRequest = { ...runRequest, contextManifest: context.contextManifest, stream: true }

  // Fire-and-forget 沉淀长期记忆：仅当 projectId 与 agentId 同时存在时触发。
  // 调用方在 Harness 触发后调用本闭包，行为与原 route 的两条分支一致。
  const persistMemory = () => {
    if (!projectId || !agentId) return
    persistMemoriesFromConversation(normalizedMessages, { userId, projectId, agentId }).catch(() => {})
  }

  return { chatParams, summaryStep, runRequest, streamRequest, persistMemory }
}

/**
 * 流式聊天分支的响应封装：注入 streamRun 的流后，用 streamChatContent 产出
 * text/plain 流式响应。从原 route 逐字迁出（含 X-AIM-Run-Id 头与 finalize）。
 *
 * 注意：本函数不调用 streamAimRun —— 调用方（route）持有 streamRun 以满足架构
 * 护栏 R1。本函数只负责把 handler 的 async iterable 包成流式 Response。
 */
export function buildAimChatStreamResponse(
  streamRun: {
    spec: unknown
    runId: string
    stream: (chunks: AsyncIterable<string>) => AsyncIterable<string>
    finalize: (output: string, ok: boolean) => Promise<void>
  },
  chatParams: unknown,
  trace?: AimTraceRecorder,
) {
  return streamChatContent(
    streamRun.stream(streamAimChatDomain(streamRun.spec as never, chatParams as never)),
    trace,
    { runId: streamRun.runId, finalize: streamRun.finalize },
  )
}

/** 非流式聊天分支的 JSON 响应转换（route 层响应转换职责）。 */
export function buildAimChatJsonResponse(chatRun: {
  output: string
  metadata: { runId: string; degraded: boolean; provider: string; model: string }
}) {
  return NextResponse.json({
    content: chatRun.output,
    runId: chatRun.metadata.runId,
    degraded: chatRun.metadata.degraded,
    provider: chatRun.metadata.provider,
    model: chatRun.metadata.model,
  })
}
