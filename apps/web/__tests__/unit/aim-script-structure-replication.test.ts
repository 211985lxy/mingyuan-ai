import { describe, expect, it } from "vitest"

import { LLMClient } from "@/lib/llm/client"
import type { LLMProvider } from "@/lib/llm/types"
import { callLLMJsonWithRetry } from "@/lib/aim/llm-json-retry"
import {
  BatchTooLargeError,
  MAX_BATCH_INPUT,
  extractStructuresFromBatch,
  isBatchTooLargeError,
} from "@/lib/aim/script-structure-extractor"
import { clampCount, coerceGeneratedScripts } from "@/lib/aim/script-structure-generator"

/** 构造一个按预设响应序列返回的 LLMProvider，并暴露调用次数。 */
function makeProvider(responses: string[]): { provider: LLMProvider; calls: () => number } {
  const state = { count: 0 }
  const provider: LLMProvider = {
    name: "test",
    defaultModel: "test-model",
    isAvailable: () => true,
    async complete() {
      const content = responses[Math.min(state.count, responses.length - 1)]
      state.count += 1
      return { content, model: "test-model", provider: "test" }
    },
  }
  return { provider, calls: () => state.count }
}

// ─── 5.1: callLLMJsonWithRetry 重试逻辑 ────────────────────

describe("callLLMJsonWithRetry", () => {
  it("首次返回合法 JSON 时不重试", async () => {
    const { provider, calls } = makeProvider(['{"ok":1}'])
    const llm = new LLMClient([provider])
    const { data, model } = await callLLMJsonWithRetry(
      llm,
      { system: "s", user: "u", temperature: 0.5, maxTokens: 100 },
      "ctx",
    )
    expect(data).toEqual({ ok: 1 })
    expect(model).toBe("test-model")
    expect(calls()).toBe(1)
  })

  it("首次返回非法 JSON 时重试一次后成功", async () => {
    const { provider, calls } = makeProvider(["not json", '{"ok":2}'])
    const llm = new LLMClient([provider])
    const { data } = await callLLMJsonWithRetry(
      llm,
      { system: "s", user: "u", temperature: 0.5, maxTokens: 100 },
      "ctx",
    )
    expect(data).toEqual({ ok: 2 })
    expect(calls()).toBe(2)
  })

  it("两次都返回非法 JSON 时抛错且错误信息含「已重试一次」", async () => {
    const { provider, calls } = makeProvider(["still not json", "again not json"])
    const llm = new LLMClient([provider])
    await expect(
      callLLMJsonWithRetry(
        llm,
        { system: "s", user: "u", temperature: 0.5, maxTokens: 100 },
        "结构提取结果解析失败",
      ),
    ).rejects.toThrow(/已重试一次/)
    expect(calls()).toBe(2)
  })
})

// ─── 5.2: BatchTooLargeError 与 oversized 拒绝 ─────────────

describe("BatchTooLargeError", () => {
  it("isBatchTooLargeError 正确识别", () => {
    expect(isBatchTooLargeError(new BatchTooLargeError(10, 15))).toBe(true)
    expect(isBatchTooLargeError(new Error("other"))).toBe(false)
    expect(isBatchTooLargeError(null)).toBe(false)
    expect(isBatchTooLargeError(undefined)).toBe(false)
  })

  it("错误信息含上限与实际数量", () => {
    const err = new BatchTooLargeError(10, 15)
    expect(err.limit).toBe(10)
    expect(err.actual).toBe(15)
    expect(err.message).toContain("10")
    expect(err.message).toContain("15")
  })
})

describe("extractStructuresFromBatch oversized 拒绝", () => {
  it("超过 MAX_BATCH_INPUT 时抛 BatchTooLargeError（不触发 LLM）", async () => {
    const tooMany = Array.from({ length: MAX_BATCH_INPUT + 1 }, (_, i) => `文案${i} 内容`)
    await expect(extractStructuresFromBatch(tooMany)).rejects.toBeInstanceOf(BatchTooLargeError)
  })

  it("空输入抛普通错误（非 BatchTooLargeError）", async () => {
    await expect(extractStructuresFromBatch(["  ", ""])).rejects.not.toBeInstanceOf(BatchTooLargeError)
  })
})

// ─── 数量参数 clamp 与生成结果截断 ─────────────────────────

describe("clampCount", () => {
  it("范围内原样返回（向下取整）", () => {
    expect(clampCount(5)).toBe(5)
    expect(clampCount(3.7)).toBe(3)
  })

  it("低于下限 clamp 到 1", () => {
    expect(clampCount(0)).toBe(1)
    expect(clampCount(-3)).toBe(1)
  })

  it("高于上限 clamp 到 10", () => {
    expect(clampCount(20)).toBe(10)
    expect(clampCount(100)).toBe(10)
  })

  it("非数字 clamp 到 1", () => {
    expect(clampCount(Number.NaN)).toBe(1)
    expect(clampCount(Number.POSITIVE_INFINITY)).toBe(1)
  })
})

describe("coerceGeneratedScripts", () => {
  it("模型多生成时截断到 expectedCount", () => {
    const raw = {
      scripts: Array.from({ length: 20 }, (_, i) => ({
        title: `t${i}`,
        content: `内容${i}`,
        segmentOrder: ["hook"],
      })),
    }
    const result = coerceGeneratedScripts(raw, 5)
    expect(result).toHaveLength(5)
    expect(result[0].title).toBe("t0")
    expect(result[4].title).toBe("t4")
  })

  it("输入畸形时返回空数组", () => {
    expect(coerceGeneratedScripts(null, 5)).toEqual([])
    expect(coerceGeneratedScripts({}, 5)).toEqual([])
    expect(coerceGeneratedScripts({ scripts: "not array" }, 5)).toEqual([])
  })

  it("过滤掉 content 为空的条目", () => {
    const raw = {
      scripts: [
        { title: "a", content: "ok", segmentOrder: [] },
        { title: "b", content: "", segmentOrder: [] },
        { title: "c" },
      ],
    }
    const result = coerceGeneratedScripts(raw, 5)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe("a")
  })
})
