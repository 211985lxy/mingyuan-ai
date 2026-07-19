import { describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  snapshotCreate: vi.fn(async () => ({ id: "snapshot_1" })),
  traceUpdate: vi.fn(async () => ({})),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aimRunSnapshot: { create: mocks.snapshotCreate },
    aimExecutionTrace: { update: mocks.traceUpdate },
  },
}))

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }))
vi.mock("@/env", () => ({ env: { AIM_STORE_SENSITIVE_SNAPSHOTS: "false" } }))

describe("AIM snapshot telemetry persistence", () => {
  it("keeps token telemetry on the trace without writing undeclared snapshot fields", async () => {
    const { planAimRun } = await import("@/lib/aim-harness/planner")
    const { applyRunMetadataToTrace, persistAimRunSnapshot } = await import("@/lib/aim-harness/snapshot")
    const spec = planAimRun({
      entrypoint: "generate",
      agentId: "business_diagnosis",
      rawInput: "真实会议原文",
      targetFormats: ["raw_copy"],
    })
    const metadata = {
      runId: "run_1",
      harnessVersion: "aim-harness-v1" as const,
      provider: "apimart",
      model: "gpt-5.2-chat-latest",
      fallbackIndex: 0,
      degraded: false,
      promptHash: "prompt_hash",
      contextHash: "context_hash",
      inputTokens: 120,
      outputTokens: 30,
      cachedTokens: 10,
      costCny: 0.25,
      providerAttempts: [],
    }

    await persistAimRunSnapshot({
      runSpec: spec,
      metadata,
      contextManifest: [],
      composedPrompt: "prompt",
      output: { ok: true },
    })
    await applyRunMetadataToTrace("trace_1", metadata, spec, "snapshot_1", "pass")

    const snapshotCalls = (mocks.snapshotCreate as unknown as {
      mock: { calls: Array<[{ data: Record<string, unknown> }]> }
    }).mock.calls
    const snapshotCall = snapshotCalls[0]
    expect(snapshotCall).toBeDefined()
    const snapshotData = snapshotCall![0].data
    expect(snapshotData).not.toHaveProperty("inputTokens")
    expect(snapshotData).not.toHaveProperty("outputTokens")
    expect(snapshotData).not.toHaveProperty("cachedTokens")
    expect(snapshotData).not.toHaveProperty("costCny")
    expect(mocks.traceUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        model: "gpt-5.2-chat-latest",
        totalTokens: 150,
        inputTokens: 120,
        outputTokens: 30,
        cachedTokens: 10,
        costCny: 0.25,
      }),
    }))

    await applyRunMetadataToTrace("trace_2", {
      ...metadata,
      inputTokens: undefined,
      outputTokens: undefined,
    }, spec)
    expect(mocks.traceUpdate).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ totalTokens: null }),
    }))
  })
})
