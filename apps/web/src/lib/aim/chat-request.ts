import {
  chatAim,
  chatAimStream,
  type AimChatContent,
  type AimChatMessage,
  type AimChatToolAction,
  type AimEditorContext,
} from "@/lib/api/client"

interface ChatImage {
  readUrl: string
}

interface ChatThreadMessage {
  role: "user" | "assistant"
  content: string
  images?: ChatImage[]
}

/**
 * @description 构建 AIM 聊天内容（支持多模态图片）
 * @param text - 文本内容
 * @param images - 图片列表
 * @returns 聊天内容（字符串或多模态数组）
 */
export function buildAimChatContent(text: string, images: ChatImage[]): AimChatContent {
  if (images.length === 0) return text
  return [
    { type: "text", text: text.trim() || "请分析这张图片。" },
    ...images.map((image) => ({ type: "image_url" as const, image_url: { url: image.readUrl } })),
  ]
}

/**
 * @description 构建 AIM 聊天消息列表
 * @param thread - 聊天线程消息
 * @returns AIM 聊天消息数组
 */
export function buildAimChatMessages(thread: ChatThreadMessage[]): AimChatMessage[] {
  return thread.map((message) => ({
    role: message.role,
    content: message.role === "user" && message.images?.length
      ? buildAimChatContent(message.content, message.images)
      : message.content,
  }))
}

/**
 * @description 执行 AIM 聊天请求（流式响应）
 * @param input - 请求输入（消息、智能体 ID、项目 ID、回调等）
 * @returns 是否有内容返回
 */
export async function runAimChatRequest(input: {
  messages: AimChatMessage[]
  agentId: string
  projectId?: string
  toolAction?: AimChatToolAction | null
  resultId?: string
  editorContext?: AimEditorContext
  signal: AbortSignal
  onContent: (content: string) => void
  agentModule?: "social" | "longform" | "free"
  writerModule?: "social" | "longform" | "free"
  traceId?: string
}): Promise<{ hasContent: boolean }> {
  const options = {
    agentId: input.agentId,
    projectId: input.projectId,
    editorContext: input.editorContext,
    agentModule: input.agentModule,
    writerModule: input.writerModule,
    signal: input.signal,
    traceId: input.traceId,
  }
  if (input.toolAction) {
    const { content } = await chatAim(input.messages, {
      ...options,
      toolAction: input.toolAction,
      resultId: input.resultId,
    })
    input.onContent(content)
    return { hasContent: content.length > 0 }
  }
  let hasContent = false
  await chatAimStream(input.messages, {
    ...options,
    onDelta: (_delta, content) => {
      hasContent = content.length > 0
      input.onContent(content)
    },
  })
  return { hasContent }
}
