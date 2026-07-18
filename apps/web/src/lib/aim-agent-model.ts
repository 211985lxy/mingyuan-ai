import type { AimModelPolicy } from "@/lib/aim-harness/types"
import { getAgentLLM } from "@/lib/llm/agent-router"
import type { ChatMessage } from "@/lib/llm/types"

function hasImageContent(messages: ChatMessage[]): boolean {
  return messages.some((message) =>
    Array.isArray(message.content) && message.content.some((part) => part.type === "image_url"),
  )
}

function normalizeChatContent(content: unknown): ChatMessage["content"] {
  if (!Array.isArray(content)) return String(content || "").trim()
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return null
      const item = part as { type?: unknown; text?: unknown; image_url?: { url?: unknown } }
      if (item.type === "text" && typeof item.text === "string") {
        const text = item.text.trim()
        return text ? { type: "text" as const, text } : null
      }
      if (item.type === "image_url" && typeof item.image_url?.url === "string") {
        return { type: "image_url" as const, image_url: { url: item.image_url.url } }
      }
      return null
    })
    .filter((part): part is Exclude<ChatMessage["content"], string>[number] => part !== null)
}

function formatMessages(systemPrompt: string, messages: any[]): ChatMessage[] {
  return [
    { role: "system", content: systemPrompt },
    ...messages.map((message) => ({
      role: message.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: normalizeChatContent(message.content),
    })),
  ]
}

export async function executeChatLLM(
  agentId: string,
  systemPrompt: string,
  messages: any[],
  policy?: AimModelPolicy,
): Promise<{ content: string }> {
  const formattedMessages = formatMessages(systemPrompt, messages)
  const llm = getAgentLLM(hasImageContent(formattedMessages) ? "vision_analysis" : agentId, policy)
  const completion = await llm.complete({
    messages: formattedMessages,
    temperature: policy?.temperature ?? 0.7,
    ...(policy?.maxTokens ? { maxTokens: policy.maxTokens } : {}),
  })
  return { content: completion.content }
}

export async function* executeChatLLMStream(
  agentId: string,
  systemPrompt: string,
  messages: any[],
  policy?: AimModelPolicy,
): AsyncIterable<string> {
  const formattedMessages = formatMessages(systemPrompt, messages)
  const llm = getAgentLLM(hasImageContent(formattedMessages) ? "vision_analysis" : agentId, policy)
  yield* llm.stream({
    messages: formattedMessages,
    temperature: policy?.temperature ?? 0.7,
    ...(policy?.maxTokens ? { maxTokens: policy.maxTokens } : {}),
  })
}

export async function executeGenerateLLM(
  agentId: string,
  systemPrompt: string,
  userPrompt: string,
  policy?: AimModelPolicy,
) {
  const llm = getAgentLLM(agentId, policy)
  return llm.complete({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: policy?.temperature ?? 0.8,
    // 推理模型（gpt-5 等）会先消耗 reasoning tokens 再产出正文，4000 预算在
    // 复杂生成任务上可能只够推理、正文为空；与客户端默认上限 8192 对齐。
    maxTokens: policy?.maxTokens ?? 8192,
  })
}
