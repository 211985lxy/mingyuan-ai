import { describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  records: new Map<string, { id: string; steps: unknown[]; [key: string]: unknown }>(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aimExecutionTrace: {
      async create({ data }: { data: Record<string, unknown> }) {
        const id = `trace-${state.records.size + 1}`
        state.records.set(id, { id, steps: [], ...data })
        return { id }
      },
      async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
        const current = state.records.get(where.id)
        if (current) state.records.set(where.id, { ...current, ...data })
        return state.records.get(where.id)
      },
      async findUnique({ where }: { where: { id: string } }) {
        return state.records.get(where.id) || null
      },
    },
  },
}))

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn() },
}))

describe("AIM observability", () => {
  it("records successful and failed steps without swallowing errors", async () => {
    const { createAimTrace, runAimTraceStep } = await import("@/lib/aim-observability")
    const trace = await createAimTrace({ action: "chat", inputSummary: "hello" })

    const result = await runAimTraceStep(trace, "ok", "成功步骤", () => "done")
    await expect(runAimTraceStep(trace, "bad", "失败步骤", () => {
      throw new Error("boom")
    })).rejects.toThrow("boom")

    expect(result).toBe("done")
    expect(state.records.get(trace!.id)?.steps).toMatchObject([
      { key: "ok", status: "success" },
      { key: "bad", status: "failed", error: "boom" },
    ])
  })

  it("truncates summaries instead of storing full long content", async () => {
    const { summarizeText } = await import("@/lib/aim-observability")
    const summary = summarizeText("a".repeat(900))
    expect(summary).toHaveLength(500)
  })
})
