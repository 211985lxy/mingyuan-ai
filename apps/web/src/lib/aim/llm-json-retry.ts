import type { LLMClient } from "@/lib/llm/client"

/** LLM JSON 调用结果：解析后的数据 + 模型名（用于透明度/审计）。 */
export interface LLMJsonResult {
  data: unknown
  model: string
}

/** 调用 LLM 并解析 JSON。模型返回非法 JSON 时重试一次，仍失败则抛错。
 *  - maxAttempts = 2（1 次正常 + 1 次重试）
 *  - 重试只覆盖 JSON 解析失败，不覆盖网络/模型抛错（那些由 llm.complete 直接抛） */
export async function callLLMJsonWithRetry(
  llm: LLMClient,
  args: { system: string; user: string; temperature: number; maxTokens: number },
  errorContext: string,
): Promise<LLMJsonResult> {
  let lastDetail = ""
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await llm.complete({
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
      temperature: args.temperature,
      maxTokens: args.maxTokens,
      responseFormat: { type: "json_object" },
    })
    try {
      return { data: JSON.parse(result.content), model: result.model }
    } catch (err) {
      lastDetail = err instanceof Error ? err.message : String(err)
    }
  }
  throw new Error(`${errorContext}：模型未返回合法 JSON（已重试一次，${lastDetail}）`)
}
