import { LLMClient } from "@/lib/llm/client"
import type { ChatMessage } from "@/lib/llm/types"

export type AimEvolutionMessage = {
  role: "user" | "assistant"
  content: string
}

export type AimEvolutionSuggestion = {
  category: "user_insight"
  title: string
  content: string
  tags: string[]
}

type RawSuggestion = {
  type?: string
  title?: string
  content?: string
  evidence?: string
}

const DEFAULT_TAGS = [
  "kb_scope:project",
  "asset_role:preference",
  "usable_for:video",
  "usable_for:wechat",
  "confidence:user_claim",
]

/**
 * @description 构建客户偏好提炼提示词
 * @param messages - 对话消息列表
 * @returns 提炼偏好的提示词文本
 */
export function buildEvolutionPrompt(messages: AimEvolutionMessage[]): string {
  const recent = messages
    .slice(-12)
    .map((message) => `${message.role === "user" ? "用户" : "助手"}：${message.content}`)
    .join("\n\n")
    .slice(0, 3500)

  return `你是 AIM 的客户偏好提炼器。只提炼长期有用的客户偏好，不要总结一次性任务。

可提炼类型：
- 表达偏好：用户喜欢/讨厌的语气、结构、长度、风格
- 禁忌表达：用户明确要求少用或不用的词、句式、套路
- 稳定观点：用户反复坚持的判断、立场、方法
- 业务偏好：用户对客户、场景、交付、成交方式的稳定选择

不要提炼：
- 一次性改稿指令
- 助手自己的建议
- 没有用户证据的猜测

输出 JSON，格式严格如下：
{
  "suggestions": [
    {
      "type": "style_preference",
      "title": "偏好：短句、少术语",
      "content": "一句可长期复用的偏好描述",
      "evidence": "用户原话或近似原话"
    }
  ]
}

如果没有值得长期沉淀的偏好，返回 {"suggestions": []}。

对话：
${recent}`
}

/**
 * @description 解析 LLM 返回的偏好提炼 JSON
 * @param raw - LLM 返回的原始 JSON 字符串
 * @returns 解析后的偏好建议数组
 */
export function parseEvolutionJson(raw: string): AimEvolutionSuggestion[] {
  try {
    const parsed = JSON.parse(raw) as { suggestions?: RawSuggestion[] }
    if (!Array.isArray(parsed.suggestions)) return []

    return parsed.suggestions
      .map((item) => {
        const title = typeof item.title === "string" ? item.title.trim() : ""
        const content = typeof item.content === "string" ? item.content.trim() : ""
        const evidence = typeof item.evidence === "string" ? item.evidence.trim() : ""
        if (!title || !content) return null
        return {
          category: "user_insight" as const,
          title: title.slice(0, 80),
          content: evidence ? `${content}\n证据：${evidence}` : content,
          tags: DEFAULT_TAGS,
        }
      })
      .filter((item): item is AimEvolutionSuggestion => item !== null)
      .slice(0, 5)
  } catch {
    return []
  }
}

/**
 * @description 将未知输入规范化为 AIM 对话消息数组
 * @param value - 待规范化的输入值
 * @returns 规范化后的对话消息数组
 */
export function normalizeEvolutionMessages(value: unknown): AimEvolutionMessage[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      const role = (item as { role?: unknown }).role
      const content = (item as { content?: unknown }).content
      if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null
      const trimmed = content.trim()
      if (!trimmed) return null
      return { role, content: trimmed }
    })
    .filter((item): item is AimEvolutionMessage => item !== null)
}

/**
 * @description 从对话中提取 AIM 客户偏好建议
 * @param input - 提取输入（消息列表和最大建议数）
 * @returns 提取的偏好建议数组
 */
export async function extractAimEvolutionSuggestions(input: {
  messages: AimEvolutionMessage[]
  maxSuggestions?: number
}): Promise<AimEvolutionSuggestion[]> {
  const prompt = buildEvolutionPrompt(input.messages)
  const completion = await LLMClient.shared().complete({
    messages: [{ role: "user", content: prompt } satisfies ChatMessage],
    maxTokens: 900,
    temperature: 0.2,
    responseFormat: { type: "json_object" },
  })

  return parseEvolutionJson(completion.content).slice(0, input.maxSuggestions ?? 5)
}
