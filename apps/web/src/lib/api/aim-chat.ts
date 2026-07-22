"use client"

import { ApiError, getApiErrorMessage, request } from "./core"
import { useAuthStore } from "@/lib/store"
import type { KnowledgeEntry } from "./knowledge"
import type { HotTopic } from "@/types/content-template"
import type { StyleGuideId } from "@/lib/style-guide-config"
import type { AimChatBody } from "@/features/aim/contracts/api"
import type { CopyStudioModule } from "@/lib/copy-studio"
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
 * @description 上传knowledgedocument
 * @param file - 文件
 * @param category - 分类
 * @returns Promise<
 */
export async function uploadKnowledgeDocument(
  file: File,
  category: string
): Promise<{ created: number; entries: KnowledgeEntry[] }> {
  const formData = new FormData()
  formData.append("file", file)
  formData.append("category", category)

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
  },
): Promise<{ content: string; toolResult?: unknown }> {
  const { signal, ...bodyOptions } = options ?? {}
  return request<{ content: string; toolResult?: unknown }>("/api/aim/chat", {
    method: "POST",
    body: JSON.stringify({ messages, ...bodyOptions }),
    timeout: 30000,
    signal,
  })
}

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
  },
): Promise<{ content: string }> {
  const { signal, onDelta, traceId, ...bodyOptions } = options
  let response: Response
  try {
    response = await fetch("/api/aim/chat", {
      method: "POST",
      credentials: "same-origin",
      signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages, ...bodyOptions, stream: true, traceId }),
    })
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError("请求已停止", 499, { code: "ABORTED", originalPath: "/api/aim/chat" })
    }
    throw error
  }

  if (!response.ok) {
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
      throw new ApiError("请求已停止", 499, { code: "ABORTED", originalPath: "/api/aim/chat" })
    }
    throw error
  } finally {
    reader.releaseLock()
  }

  return { content }
}
