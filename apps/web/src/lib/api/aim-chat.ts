"use client"

import { ApiError, getApiErrorMessage, request } from "./core"
import { useAuthStore } from "@/lib/store"
import type { KnowledgeEntry } from "./knowledge"
import type { HotTopic } from "@/types/content-template"
import type { StyleGuideId } from "@/lib/style-guide-config"
import type { AimChatBody } from "@/features/aim/contracts/api"
import type { CopyStudioModule } from "@/lib/copy-studio"
import { serializeAimChatRequestBody } from "@/lib/aim/chat-payload-budget"
import type {
  ApiAsset, ApiContentGenerationRun, ApiHotTopicFit, ApiHotTopicInsight,
  ApiTopicRecommendationMode, ApiScript, ApiUser,
  ApiVideoStructure,
  AuthResponse,
  HotTopicsResponse, PaginatedResponse,
  PublicTemplateDetail, PublicTemplateListItem, ApiTopicGenerateResponse, ApiTopicSelectResponse,
  ApiOpeningType, ApiCopyStructure, ApiEndingType, ApiCompetitorAnalysis,
  CompetitorReportsResponse, ApiCompetitorWebResearch, ApiAccountHotSources,
  ApiAiHotBriefing, ApiHotDecisionResponse, ApiHotDecisionSource, ApiMarketHotSnapshot,
  ApiVideoCopyExtraction, ApiAgentApiKeySummary, ApiTopicCard,
} from "@/types/api"

/**
 * @description transcribeaudio
 * @param audioBlob - audioBlob
 * @returns Promise<
 */
export async function transcribeAudio(audioBlob: Blob): Promise<{ text: string }> {
  return request<{ text: string }>("/api/aim/transcribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
    },
    body: audioBlob,
  })
}

/**
 * @description 用户侧上传文档入库（必须绑定项目）
 * @param file - 文件
 * @param category - 分类
 * @param projectId - 归属项目
 */
export async function uploadKnowledgeDocument(
  file: File,
  category: string,
  projectId: string,
): Promise<{ created: number; entries: KnowledgeEntry[] }> {
  if (!projectId.trim()) {
    throw new ApiError("请选择归属全案", 400, { code: "PROJECT_REQUIRED" })
  }
  const formData = new FormData()
  formData.append("file", file)
  formData.append("category", category)
  formData.append("projectId", projectId)

  const response = await fetch("/api/knowledge/upload", {
    method: "POST",
    credentials: "same-origin",
    body: formData,
    // 不设置 Content-Type，让浏览器自动处理 multipart boundary
  })

  if (!response.ok) {
    if (response.status === 401) {
      useAuthStore.getState().clearSession()
    }
    const payload = await response.json().catch(() => null)
    throw new ApiError(
      typeof payload?.error === "string" ? payload.error : `上传失败: ${response.status}`,
      response.status,
      payload
    )
  }

  return response.json().catch(() => ({ created: 0, entries: [] }))
}

export type AimChatMessage = AimChatBody["messages"][number]
export type AimChatContent = AimChatMessage["content"]
export type AimEditorContext = NonNullable<AimChatBody["editorContext"]>

export type AimChatToolAction =
  | "import_lark_topics"
  | "import_lark_project_data"
  | "import_lark_archive_data"
  | "export_lark_generation"

/**
 * @description chataim
 * @param messages - 消息列表
 * @param options? - options?
 * @returns Promise<
 */
export async function chatAim(
  messages: AimChatMessage[],
  options?: {
    agentId?: string
    projectId?: string
    toolAction?: AimChatToolAction
    resultId?: string
    editorContext?: AimEditorContext
    agentModule?: CopyStudioModule
    writerModule?: CopyStudioModule
    signal?: AbortSignal
    /** 本轮委托执行引擎；与会话 agentId 平级，缺省不写入请求体 */
    executionAgentId?: string
  },
): Promise<{ content: string; toolResult?: unknown }> {
  const { signal, ...bodyOptions } = options ?? {}
  return request<{ content: string; toolResult?: unknown }>("/api/aim/chat", {
    method: "POST",
    body: serializeAimChatRequestBody({ messages, ...bodyOptions }),
    timeout: 30000,
    signal,
  })
}

/**
 * 流式对话最长等待：连接或读流卡住时主动中止，避免工作台一直 busy。
 * 正常长文生成通常远短于此；超时后用户可重试。
 */
const AIM_CHAT_STREAM_TIMEOUT_MS = 180_000

/**
 * @description chataimstream
 * @param messages - 消息列表
 * @param options - 配置选项
 * @returns Promise<
 */
export async function chatAimStream(
  messages: AimChatMessage[],
  options: {
    agentId?: string
    projectId?: string
    editorContext?: AimEditorContext
    agentModule?: CopyStudioModule
    writerModule?: CopyStudioModule
    signal?: AbortSignal
    onDelta: (delta: string, content: string) => void
    traceId?: string
    /** 本轮委托执行引擎；与会话 agentId 平级，缺省不写入请求体 */
    executionAgentId?: string
    /** 覆盖默认流式超时（毫秒） */
    timeoutMs?: number
  },
): Promise<{ content: string }> {
  const { signal, onDelta, traceId, timeoutMs = AIM_CHAT_STREAM_TIMEOUT_MS, ...bodyOptions } = options
  const timeoutController = new AbortController()
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs)
  const onExternalAbort = () => timeoutController.abort()
  if (signal) {
    if (signal.aborted) timeoutController.abort()
    else signal.addEventListener("abort", onExternalAbort, { once: true })
  }

  let response: Response
  try {
    response = await fetch("/api/aim/chat", {
      method: "POST",
      credentials: "same-origin",
      signal: timeoutController.signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: serializeAimChatRequestBody({ messages, ...bodyOptions, stream: true, traceId }),
    })
  } catch (error) {
    clearTimeout(timeoutId)
    if (signal) signal.removeEventListener("abort", onExternalAbort)
    if (error instanceof Error && error.name === "AbortError") {
      const timedOut = !signal?.aborted
      throw new ApiError(
        timedOut ? "回复超时，请重试或缩短输入后再试" : "请求已停止",
        timedOut ? 408 : 499,
        { code: timedOut ? "TIMEOUT" : "ABORTED", originalPath: "/api/aim/chat" },
      )
    }
    throw error
  }

  if (!response.ok) {
    clearTimeout(timeoutId)
    if (signal) signal.removeEventListener("abort", onExternalAbort)
    const text = await response.text().catch(() => "")
    const payload = text
      ? (() => {
          try {
            return JSON.parse(text) as unknown
          } catch {
            return { error: text }
          }
        })()
      : null

    if (response.status === 401) {
      useAuthStore.getState().clearSession()
    }

    throw new ApiError(
      getApiErrorMessage(payload, response.status, response.statusText),
      response.status,
      payload
    )
  }

  if (!response.body) {
    clearTimeout(timeoutId)
    if (signal) signal.removeEventListener("abort", onExternalAbort)
    throw new ApiError("当前浏览器不支持流式输出", 500, { code: "NO_STREAM_BODY" })
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let content = ""

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const delta = decoder.decode(value, { stream: true })
      if (!delta) continue
      content += delta
      onDelta(delta, content)
    }
    const tail = decoder.decode()
    if (tail) {
      content += tail
      onDelta(tail, content)
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      const timedOut = !signal?.aborted
      throw new ApiError(
        timedOut ? "回复超时，请重试或缩短输入后再试" : "请求已停止",
        timedOut ? 408 : 499,
        { code: timedOut ? "TIMEOUT" : "ABORTED", originalPath: "/api/aim/chat" },
      )
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
    if (signal) signal.removeEventListener("abort", onExternalAbort)
    reader.releaseLock()
  }

  return { content }
}
