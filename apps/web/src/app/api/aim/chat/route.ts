import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { buildAimChatResponse, buildAimChatResponseStream } from "@/lib/aim-agent-handlers"
import { handleLarkToolAction } from "@/lib/aim-tool-actions"
import { buildAimKnowledgeContext } from "@/lib/aim-knowledge-context"
import { buildAimCompetitorWatchContext } from "@/lib/aim-competitor-watch-context"
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
  createAimTrace,
  failAimTrace,
  finishAimTrace,
  runAimTraceStep,
  summarizeText,
  type AimTraceRecorder,
} from "@/lib/aim-observability"
import { enforceDailyBetaLimit } from "@/lib/internal-beta-limits"
import {
  retrieveLayeredAimMemory,
  formatAimMemoryBlock,
  persistMemoriesFromConversation,
  type AimMemoryMessage,
} from "@/lib/aim-memory"

/** 把 chat 请求里的 messages 规范化为记忆提炼所需格式（只保留 user/assistant 的文本内容）。 */
function normalizeMemoryMessages(messages: unknown): AimMemoryMessage[] {
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

function extractTextContent(content: unknown): string {
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

function streamChatContent(chunks: AsyncIterable<string>, trace?: AimTraceRecorder) {
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
      },
    },
  )
}

export async function POST(request: NextRequest) {
  let trace: AimTraceRecorder | undefined
  try {
    const user = await authenticateRequest(request)
    const quotaResponse = await enforceDailyBetaLimit(user.id, "aim_chat")
    if (quotaResponse) return quotaResponse

    const body = await request.json()
    const messages = body.messages
    const agentId = typeof body.agentId === "string" ? body.agentId : ""
    const projectId = typeof body.projectId === "string" ? body.projectId.trim() : ""
    const toolAction = typeof body.toolAction === "string" ? body.toolAction : ""
    const resultId = typeof body.resultId === "string" ? body.resultId.trim() : ""
    const shouldStream = body.stream === true
    const editorContext = typeof body.editorContext === "object" && body.editorContext
      ? body.editorContext as AimEditorContext
      : undefined

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "请求格式不正确，缺少 messages 数组" }, { status: 400 })
    }
    trace = await createAimTrace({
      userId: user.id,
      projectId: projectId || null,
      agentId: agentId || null,
      action: toolAction ? "tool_action" : "chat",
      inputSummary: extractTextContent(messages[messages.length - 1]?.content),
    })
    await addAimTraceStep(trace, {
      key: "route_request",
      label: "路由请求识别",
      status: "success",
      summary: toolAction ? "工具动作" : "普通聊天",
      metadata: { agentId, projectId: projectId || null, stream: shouldStream, messageCount: messages.length },
    })

    // ── 飞书工具动作（委托给共享模块）──
    if (toolAction) {
      if (!projectId) {
        return NextResponse.json({ error: "请先选择 IP 营销全案" }, { status: 400 })
      }
      const result = await runAimTraceStep(
        trace,
        "tool_action",
        "工具动作执行",
        () => handleLarkToolAction(toolAction, { userId: user.id, projectId, resultId }),
        (res) => ({ outputSummary: summarizeText(res) }),
      )
      await finishAimTrace(trace, { outputSummary: summarizeText(result) })
      return NextResponse.json(result)
    }

    // ── 普通聊天：使用统一知识上下文 ──
    const lastMessage = messages[messages.length - 1]
    const query = extractTextContent(lastMessage?.content).slice(0, 500)
    const runtimeTask = resolveAimRuntimeTask({
      agentId,
      input: query,
    })
    const conversationIntent = await runAimTraceStep(
      trace,
      "conversation_intent",
      "对话意图识别",
      () => resolveAimConversationIntent({ agentId, messages }),
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

    const shouldUseKnowledgeContext = conversationIntent.useKnowledge || shouldUseKnowledgeContextForTask(runtimeTask)
    const shouldUseMarketContext =
      conversationIntent.useKnowledge && shouldUseMarketViralContextForTask(runtimeTask)
    const knowledgeContext = shouldUseKnowledgeContext
      ? await runAimTraceStep(
          trace,
          "knowledge_context",
          "知识库召回",
          () => buildAimKnowledgeContext({
            userId: user.id,
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
    const baseKnowledgeBlock = knowledgeContext.knowledgeBlock

    // 用户级全局写作风格档案：独立检索，绕开 buildAimKnowledgeContext 的 projectId 硬过滤
    const styleBlock = conversationIntent.useStyleProfile
      ? await runAimTraceStep(
          trace,
          "style_profile",
          "风格档案召回",
          () => getStyleProfileBlock(user.id).catch(() => ""),
          (block) => ({ summary: block ? "已召回" : "无风格档案", metadata: { chars: block.length } }),
        )
      : ""
    const competitorWatchBlock =
      agentId === "business_diagnosis" && shouldUseMarketContext
        ? await runAimTraceStep(
            trace,
            "competitor_context",
            "竞品上下文召回",
            () => buildAimCompetitorWatchContext(user.id, query).catch(() => ""),
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
          () => retrieveLayeredAimMemory({ userId: user.id, projectId, agentId }).catch(() => []),
          (rows) => ({ summary: `召回 ${rows.length} 条记忆`, metadata: { count: rows.length } }),
        )
      : []
    const memoryBlock = formatAimMemoryBlock(memoryRows)
    const knowledgeBlock = [memoryBlock, baseKnowledgeBlock, competitorWatchBlock, styleBlock, editorBlock].filter(Boolean).join("\n")

    const chatParams = {
      userId: user.id,
      projectId: projectId || undefined,
      messages,
      knowledgeBlock,
      conversationIntent,
      trace,
    }
    await addAimTraceStep(trace, {
      key: "context_summary",
      label: "上下文汇总",
      status: "success",
      summary: "聊天上下文已汇总",
      metadata: {
        runtimeTask,
        conversationMode: conversationIntent.mode,
        knowledgeEntries: knowledgeContext.entries.length,
        knowledgeSource: knowledgeContext.source,
        knowledgeChars: knowledgeBlock.length,
      },
    })

    if (shouldStream) {
      // Fire-and-forget: 从已有对话沉淀长期记忆（不等流式输出完成）
      if (projectId && agentId) {
        const memoryMessages = normalizeMemoryMessages(messages)
        persistMemoriesFromConversation(memoryMessages, {
          userId: user.id,
          projectId,
          agentId,
        }).catch(() => {})
      }
      return streamChatContent(buildAimChatResponseStream(agentId, chatParams), trace)
    }

    const chatResponse = await buildAimChatResponse(agentId, chatParams)
    await finishAimTrace(trace, { outputSummary: summarizeText(chatResponse.content) })

    // Fire-and-forget: 从本次对话沉淀长期记忆（决策/偏好/事实）
    if (projectId && agentId) {
      const memoryMessages = normalizeMemoryMessages(messages)
      persistMemoriesFromConversation(memoryMessages, {
        userId: user.id,
        projectId,
        agentId,
      }).catch(() => {})
    }

    return NextResponse.json({
      content: chatResponse.content,
    })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse

    console.error("[aim/chat] Error:", error)
    await failAimTrace(trace, error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "对话失败，请稍后重试" },
      { status: 500 }
    )
  }
}
