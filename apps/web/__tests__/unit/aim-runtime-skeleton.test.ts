/**
 * executeAimRun / streamAimRun 骨架契约测试（阶段 1.3）。
 *
 * 阶段 1.3 的骨架承诺：
 *   - executeAimRun(request, execute) 复用 runAimHarness，返回符合 AimRunResult 的结构
 *   - agentId 归一化（接受旧别名）
 *   - draftOnly / runLlmQuality 透传到 spec
 *   - runId 由内核统一生成（不再由入口散落生成）
 *   - streamAimRun 在阶段 1.3 显式抛错（阶段 2.5 才实现）
 *
 * 不触达真实模型 / 数据库：execute 闭包用 LLMClient + fake provider。
 */
import { describe, expect, it, vi } from "vitest"

// mock 持久化层：executeAimRun 在 degraded 时调 flagAimGenerationDegraded。
// 顶层声明（hoisted），对整个文件生效；用 spy 断言调用，不触达真实 DB。
const flagDegraded = vi.fn(async (..._args: unknown[]) => undefined)
vi.mock("@/lib/aim-harness/persistence", () => ({
  flagAimGenerationDegraded: (...args: unknown[]) => flagDegraded(...args),
}))

import { executeAimRun, streamAimRun } from "@/lib/aim-harness/runtime"
import type { AimRunRequest, AimRunResult } from "@/lib/aim-harness/contracts"
import { LLMClient } from "@/lib/llm/client"
import type { LLMProvider } from "@/lib/llm/types"

function fakeProvider(name: string): LLMProvider {
  return {
    name,
    async complete() {
      return {
        content: `${name}-draft`,
        model: `${name}-model`,
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      }
    },
  } as unknown as LLMProvider
}

function baseRequest(overrides: Partial<AimRunRequest> = {}): AimRunRequest {
  return {
    entrypoint: "generate",
    agentId: "content_producer",
    rawInput: "请写一条视频脚本",
    targetFormats: ["video_script"],
    taskType: "write_script",
    actorId: "user_1",
    projectId: "proj_1",
    persistSnapshot: false,
    ...overrides,
  }
}

describe("executeAimRun 骨架（阶段 2.4 真内核）", () => {
  it("返回符合 AimRunResult 的结构，且 runId 由内核统一生成", async () => {
    const client = new LLMClient([fakeProvider("provider-real")])
    const result = await executeAimRun(baseRequest(), async () => {
      const completion = await client.complete({
        messages: [{ role: "user", content: "REAL PROMPT" }],
      })
      return { output: completion.content }
    })

    // 结构契约
    const _typeCheck: AimRunResult<string> = result
    void _typeCheck
    expect(result.metadata).toBeDefined()
    expect(result.output).toBeDefined()
    expect(result.spec).toBeDefined()

    // runId 由内核（runAimHarness.makeRunId）生成，统一前缀
    expect(result.metadata.runId).toMatch(/^run_/)
    expect(result.metadata.runId.length).toBeLessThanOrEqual(40)

    // 执行闭包产出原样透传（阶段 1 output 仍是 handler 原始形状）
    expect(result.output).toBe("provider-real-draft")
  })

  it("agentId 归一化：旧别名 ip_video → content_producer", async () => {
    const client = new LLMClient([fakeProvider("p")])
    const result = await executeAimRun(
      baseRequest({ agentId: "ip_video" }),
      async () => {
        const c = await client.complete({ messages: [{ role: "user", content: "x" }] })
        return { output: c.content }
      },
    )
    expect(result.spec.agentId).toBe("content_producer")
  })

  it("draftOnly / runLlmQuality 透传到冻结 spec", async () => {
    const client = new LLMClient([fakeProvider("p")])
    const exec = async () => {
      const c = await client.complete({ messages: [{ role: "user", content: "x" }] })
      return { output: c.content }
    }
    const result = await executeAimRun(baseRequest({ draftOnly: true, runLlmQuality: false }), exec)
    expect(result.spec.draftOnly).toBe(true)
    expect(result.spec.runLlmQuality).toBe(false)
  })

  it("entrypoint=chat 路径同样走唯一入口", async () => {
    const client = new LLMClient([fakeProvider("p")])
    const result = await executeAimRun(
      baseRequest({
        entrypoint: "chat",
        agentId: "business_diagnosis",
        messages: [{ role: "user", content: "你好" }],
        targetFormats: [],
      }),
      async () => {
        const c = await client.complete({ messages: [{ role: "user", content: "x" }] })
        return { output: c.content }
      },
    )
    expect(result.spec.entrypoint).toBe("chat")
    expect(result.metadata.runId).toMatch(/^run_/)
  })

  // ── 阶段 2.4：适配器扩展结果回传 + degraded 语义裂缝修复 ──────────────────
  it("回传 generationId / qualityReport 到 AimRunResult", async () => {
    const client = new LLMClient([fakeProvider("p")])
    const result = await executeAimRun(baseRequest(), async () => {
      const c = await client.complete({ messages: [{ role: "user", content: "x" }] })
      return {
        output: c.content,
        generationId: "gen_123",
        qualityReport: { overallScore: 8, passed: true },
        qualityStatus: "pass" as const,
      }
    })
    expect(result.generationId).toBe("gen_123")
    expect(result.qualityReport).toEqual({ overallScore: 8, passed: true })
  })

  it("provider fallback 降级时回标 AimGeneration.status=degraded", async () => {
    flagDegraded.mockClear()
    // 两个 provider：第一个失败（触发 fallback），第二个成功 → degraded=true
    const failing: LLMProvider = {
      name: "p-fail",
      isAvailable: () => true,
      async complete() {
        throw new Error("Request failed with status 503")
      },
    } as unknown as LLMProvider
    const client = new LLMClient([failing, fakeProvider("p-ok")])

    const result = await executeAimRun(
      baseRequest({ actorId: "user_degraded" }),
      async () => {
        const c = await client.complete({ messages: [{ role: "user", content: "x" }] })
        return { output: c.content, generationId: "gen_degraded" }
      },
    )

    // 降级发生 → 回标被调用，且按 (id, userId) 隔离
    expect(result.metadata.degraded).toBe(true)
    expect(flagDegraded).toHaveBeenCalledWith("gen_degraded", "user_degraded")
  })

  it("非降级运行不回标 AimGeneration", async () => {
    flagDegraded.mockClear()
    const client = new LLMClient([fakeProvider("p-ok")])
    await executeAimRun(baseRequest(), async () => {
      const c = await client.complete({ messages: [{ role: "user", content: "x" }] })
      return { output: c.content, generationId: "gen_ok" }
    })
    // 无 fallback → degraded=false → 不回标
    expect(flagDegraded).not.toHaveBeenCalled()
  })
})

describe("streamAimRun（阶段 2.5 统一流式 lifecycle）", () => {
  it("返回 AimStreamHandle：runId 走统一 makeRunId，与 executeAimRun 同源前缀", async () => {
    const handle = await streamAimRun(
      baseRequest({
        entrypoint: "chat",
        agentId: "business_diagnosis",
        messages: [{ role: "user", content: "你好" }],
        targetFormats: [],
      }),
    )
    expect(handle.spec.entrypoint).toBe("chat")
    // runId 由 runner.makeRunId 生成（与 executeAimRun / runAimHarness 同源），统一前缀
    expect(handle.runId).toMatch(/^run_/)
    expect(handle.runId.length).toBeLessThanOrEqual(40)
    expect(typeof handle.stream).toBe("function")
    expect(typeof handle.finalize).toBe("function")
  })

  it("stream() 逐字透传 handler 的 chunks（telemetry 包裹不改内容）", async () => {
    const handle = await streamAimRun(
      baseRequest({ entrypoint: "chat", agentId: "business_diagnosis", targetFormats: [] }),
    )
    const chunks = (async function* () {
      yield "你好"
      yield "，"
      yield "世界"
    })()
    const collected: string[] = []
    for await (const c of handle.stream(chunks)) {
      collected.push(c)
    }
    expect(collected.join("")).toBe("你好，世界")
  })
})
