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
import { describe, expect, it } from "vitest"

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
    ...overrides,
  }
}

describe("executeAimRun 骨架（阶段 1.3）", () => {
  it("返回符合 AimRunResult 的结构，且 runId 由内核统一生成", async () => {
    const client = new LLMClient([fakeProvider("provider-real")])
    const result = await executeAimRun(baseRequest(), async () => {
      const completion = await client.complete({
        messages: [{ role: "user", content: "REAL PROMPT" }],
      })
      return { output: completion.content }
    })

    // 结构契约
    const _typeCheck: AimRunResult = result
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
})

describe("streamAimRun 骨架（阶段 1.3 占位）", () => {
  it("阶段 1.3 显式抛错，阶段 2.5 才实现", async () => {
    await expect(streamAimRun(baseRequest({ entrypoint: "chat" }))).rejects.toThrow(
      /阶段 2\.5/,
    )
  })
})
