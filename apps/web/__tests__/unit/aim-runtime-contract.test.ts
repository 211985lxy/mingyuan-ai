/**
 * AIM v2 运行时跨切面契约测试（贯穿阶段 1–2）。
 *
 * 直接驱动 executeAimRun / streamAimRun 内核（mock LLM provider，不触达真实模型 /
 * DB 快照用 persistSnapshot:false 关闭），锁定计划要求的改造前后一致契约：
 *
 *   1. AimRunResult 结构兼容现有 HTTP 响应字段（runId / degraded / provider / model /
 *      qualityStatus 作为附加诊断字段，output 仍是 handler 原始形状）
 *   2. 隔离：actorId 透传到 spec，归一化后 agentId 一致；越权 agentId 由 handler 兜底
 *   3. 流式契约：streamAimRun 的 runId 与 executeAimRun 同源前缀（makeRunId）；
 *      stream() 逐字透传 chunks；finalize 是独立收尾
 *   4. 降级一致性：provider fallback 时 metadata.degraded=true 且回标 AimGeneration；
 *      非降级不回标（不重复写）
 *   5. 质检开关：runLlmQuality=false 时 qualityReport=undefined（不编造评分）
 */
import { describe, expect, it, vi } from "vitest"

import { executeAimRun, streamAimRun } from "@/lib/aim-harness/runtime"
import type { AimRunRequest, AimRunResult } from "@/lib/aim-harness/contracts"
import { LLMClient } from "@/lib/llm/client"
import type { LLMProvider } from "@/lib/llm/types"

// mock 持久化层（degraded 回标），用 spy 断言，不触达真实 DB
const flagDegraded = vi.fn(async () => undefined)
vi.mock("@/lib/aim-harness/persistence", () => ({
  flagAimGenerationDegraded: (...args: unknown[]) => flagDegraded(...args),
}))

function fakeProvider(name: string, content?: string): LLMProvider {
  return {
    name,
    isAvailable: () => true,
    async complete() {
      return {
        content: content ?? `${name}-draft`,
        model: `${name}-model`,
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      }
    },
  } as unknown as LLMProvider
}

function failingProvider(name: string, msg = "Request failed with status 503"): LLMProvider {
  return {
    name,
    isAvailable: () => true,
    async complete() {
      throw new Error(msg)
    },
  } as unknown as LLMProvider
}

/** 构造一个 generate 风格的请求（output 似 AimGenerateResponse） */
function generateRequest(overrides: Partial<AimRunRequest> = {}): AimRunRequest {
  return {
    entrypoint: "generate",
    agentId: "content_producer",
    rawInput: "请写一条护肤短视频脚本",
    targetFormats: ["video_script"],
    taskType: "write_script",
    actorId: "user_contract",
    projectId: "proj_1",
    ...overrides,
  }
}

/** generate 风格 adapter：返回似 AimGenerateResponse 的 output + generationId */
function generateAdapter(client: LLMClient) {
  return async () => {
    const c = await client.complete({ messages: [{ role: "user", content: "x" }] })
    const output = {
      id: "gen_contract",
      results: [{ format: "video_script", content: c.content, wordCount: 100 }],
      knowledgeUsed: [] as Array<{ id: string; title: string; category: string }>,
    }
    return { output, generationId: output.id }
  }
}

describe("AIM v2 运行时契约（贯穿阶段 1–2）", () => {
  describe("1. AimRunResult 结构兼容 HTTP 响应", () => {
    it("含 runId/degraded/provider/model 诊断字段，output 为 handler 原始形状", async () => {
      const client = new LLMClient([fakeProvider("p1")])
      const result = await executeAimRun(generateRequest(), generateAdapter(client))

      // 诊断字段（HTTP 响应附加，兼容现有 runId/degraded/provider/model）
      expect(result.metadata.runId).toMatch(/^run_/)
      expect(typeof result.metadata.provider).toBe("string")
      expect(typeof result.metadata.model).toBe("string")
      expect(typeof result.metadata.degraded).toBe("boolean")

      // output 仍是 handler 原始形状（AimGenerateResponse：含 id/results/knowledgeUsed）
      const _typeCheck: AimRunResult = result
      void _typeCheck
      expect(result.output).toMatchObject({ id: "gen_contract", results: expect.any(Array) })
      expect(result.generationId).toBe("gen_contract")
    })
  })

  describe("2. 隔离：actorId 透传 + agentId 归一化", () => {
    it("actorId 透传到 spec，旧别名归一化", async () => {
      const client = new LLMClient([fakeProvider("p1")])
      const result = await executeAimRun(
        generateRequest({ actorId: "user_iso", agentId: "ip_video" }),
        generateAdapter(client),
      )
      expect(result.spec.actorId).toBe("user_iso")
      // ip_video → content_producer
      expect(result.spec.agentId).toBe("content_producer")
    })
  })

  describe("3. 流式契约", () => {
    it("streamAimRun runId 与 executeAimRun 同源前缀（makeRunId）", async () => {
      const client = new LLMClient([fakeProvider("p1")])
      const execResult = await executeAimRun(generateRequest(), generateAdapter(client))
      const streamHandle = await streamAimRun(
        generateRequest({ entrypoint: "chat", agentId: "business_diagnosis", targetFormats: [] }),
      )
      // 二者都走 runner.makeRunId，统一 run_ 前缀
      expect(execResult.metadata.runId).toMatch(/^run_[0-9a-f]+$/)
      expect(streamHandle.runId).toMatch(/^run_[0-9a-f]+$/)
    })

    it("stream() 逐字透传 chunks，不改内容", async () => {
      const handle = await streamAimRun(
        generateRequest({ entrypoint: "chat", agentId: "business_diagnosis", targetFormats: [] }),
      )
      const source = (async function* () {
        yield "片段1"
        yield "-"
        yield "片段2"
      })()
      const out: string[] = []
      for await (const chunk of handle.stream(source)) out.push(chunk)
      expect(out.join("")).toBe("片段1-片段2")
      expect(typeof handle.finalize).toBe("function")
    })
  })

  describe("4. 降级一致性（不重复写、按需回标）", () => {
    it("provider fallback 降级时 metadata.degraded=true 且回标 AimGeneration", async () => {
      flagDegraded.mockClear()
      const client = new LLMClient([failingProvider("p-fail"), fakeProvider("p-ok")])
      const result = await executeAimRun(generateRequest(), generateAdapter(client))
      expect(result.metadata.degraded).toBe(true)
      // 回标按 (generationId, actorId) 隔离
      expect(flagDegraded).toHaveBeenCalledTimes(1)
      expect(flagDegraded).toHaveBeenCalledWith("gen_contract", "user_contract")
    })

    it("非降级运行不回标（不重复写）", async () => {
      flagDegraded.mockClear()
      const client = new LLMClient([fakeProvider("p-ok")])
      await executeAimRun(generateRequest(), generateAdapter(client))
      expect(flagDegraded).not.toHaveBeenCalled()
    })

    it("无 generationId（eval skipPersistence / output 无 id）即使降级也不回标", async () => {
      flagDegraded.mockClear()
      const client = new LLMClient([failingProvider("p-fail"), fakeProvider("p-ok")])
      // adapter 不回传 generationId，且 output 无 id 字段（eval skipPersistence 场景）
      await executeAimRun(generateRequest(), async () => {
        const c = await client.complete({ messages: [{ role: "user", content: "x" }] })
        return { output: { results: [{ format: "video_script", content: c.content }] } }
      })
      expect(flagDegraded).not.toHaveBeenCalled()
    })
  })

  describe("5. 质检开关（不编造评分）", () => {
    it("runLlmQuality=false 时 qualityReport=undefined（证据不足不生成虚假评分）", async () => {
      const client = new LLMClient([fakeProvider("p1")])
      const result = await executeAimRun(
        generateRequest({ runLlmQuality: false }),
        generateAdapter(client),
      )
      expect(result.qualityReport).toBeUndefined()
    })
  })
})
