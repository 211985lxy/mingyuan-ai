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

export function buildAimChatContent(text: string, images: ChatImage[]): AimChatContent {
  if (images.length === 0) return text
  return [
    { type: "text", text: text.trim() || "请分析这张图片。" },
    ...images.map((image) => ({ type: "image_url" as const, image_url: { url: image.readUrl } })),
  ]
}

export function buildAimChatMessages(thread: ChatThreadMessage[]): AimChatMessage[] {
  return thread.map((message) => ({
    role: message.role,
    content: message.role === "user" && message.images?.length
      ? buildAimChatContent(message.content, message.images)
      : message.content,
  }))
}

export async function runAimChatRequest(input: {
  messages: AimChatMessage[]
  agentId: string
  projectId?: string
  toolAction?: AimChatToolAction | null
  resultId?: string
  editorContext?: AimEditorContext
  signal: AbortSignal
  onContent: (content: string) => void
}): Promise<{ hasContent: boolean }> {
  const options = {
    agentId: input.agentId,
    projectId: input.projectId,
    editorContext: input.editorContext,
    signal: input.signal,
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
