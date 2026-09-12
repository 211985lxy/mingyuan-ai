/**
 * LLM 客户端截断语义测试。
 *
 * 背景（2026-09-12 实测）：思考型模型（deepseek-v4-flash）的 reasoning 计入
 * completion tokens，长生成任务会用光预算并返回 finish_reason="length" 的半截
 * 正文。此前客户端把"有非空正文"一律当成功返回，导致半截拆解被静默落库
 * （实测：四维拆解只剩「结构拆解」一章）。
 *
 * 正确语义：finishReason="length" 不算成功 → 换路拿完整输出；仅当所有线路
 * 都截断时才兜底返回截断结果，避免从"部分可用"退化成硬失败。
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import type { CompletionOptions, LLMProvider } from "@/lib/llm/types"

afterEach(() => {
  vi.resetModules()
})

function truncatedProvider(name: string, content: string): LLMProvider {
  return {
    name,
    defaultModel: `${name}-model`,
    isAvailable: () => true,
    async complete() {
      return { content, model: `${name}-model`, provider: name, finishReason: "length" }
    },
  }
}

function completeProvider(name: string, content: string): LLMProvider {
  return {
    name,
    defaultModel: `${name}-model`,
    isAvailable: () => true,
    async complete() {
      return { content, model: `${name}-model`, provider: name, finishReason: "stop" }
    },
  }
}

const messages: CompletionOptions["messages"] = [{ role: "user", content: "写四节拆解" }]

describe("LLMClient 截断不再当成功", () => {
  it("首跳返回 length 截断时换路，采用后一跳的完整输出", async () => {
    const calls: string[] = []
    const first = truncatedProvider("deepseek", "## 结构拆解\n只有半截内容")
    const second = completeProvider("zenmux", "## 结构拆解\n## 心理拆解\n## 商业拆解\n## 迁移应用")
    const spyFirst: LLMProvider = { ...first, async complete() { calls.push("deepseek"); return first.complete({ messages, maxTokens: 8192 }) } }
    const spySecond: LLMProvider = { ...second, async complete() { calls.push("zenmux"); return second.complete({ messages, maxTokens: 8192 }) } }

    const { LLMClient } = await import("@/lib/llm/client")
    const result = await new LLMClient([spyFirst, spySecond]).complete({ messages, maxTokens: 8192 })

    expect(calls).toEqual(["deepseek", "zenmux"])
    expect(result.provider).toBe("zenmux")
    expect(result.content).toContain("## 迁移应用")
  })

  it("所有线路都截断时兜底返回截断结果，不硬失败", async () => {
    const { LLMClient } = await import("@/lib/llm/client")
    const result = await new LLMClient([
      truncatedProvider("a", "半截A"),
      truncatedProvider("b", "半截B"),
    ]).complete({ messages, maxTokens: 8192 })

    expect(result.finishReason).toBe("length")
    expect(result.content).toBe("半截A")
  })

  it("正常完成（finishReason=stop）直接采用，不额外换路", async () => {
    const calls: string[] = []
    const ok = completeProvider("deepseek", "完整内容")
    const spy: LLMProvider = { ...ok, async complete() { calls.push("deepseek"); return ok.complete({ messages }) } }
    const never: LLMProvider = { ...completeProvider("zenmux", "不该被调用"), async complete() { calls.push("zenmux"); return { content: "x", model: "m", provider: "zenmux" } } }

    const { LLMClient } = await import("@/lib/llm/client")
    const result = await new LLMClient([spy, never]).complete({ messages })

    expect(calls).toEqual(["deepseek"])
    expect(result.provider).toBe("deepseek")
  })
})
