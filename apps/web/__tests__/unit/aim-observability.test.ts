import { describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  records: new Map<string, { id: string; steps: unknown[]; [key: string]: unknown }>(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aimExecutionTrace: {
      async create({ data }: { data: Record<string, unknown> }) {
        const id = typeof data.id === "string" ? data.id : `trace-${state.records.size + 1}`
        if (state.records.has(id)) throw Object.assign(new Error("unique"), { code: "P2002" })
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
      async deleteMany({ where }: { where: { id: string; status: string } }) {
        const current = state.records.get(where.id)
        if (!current || current.status !== where.status) return { count: 0 }
        state.records.delete(where.id)
        return { count: 1 }
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

  it("以确定性 trace id 原子 claim，唯一冲突返回 duplicate", async () => {
    const { claimAimTrace } = await import("@/lib/aim-observability")
    const input = {
      id: "sales_diag_stable_claim",
      action: "generate" as const,
      inputSummary: "rec_1",
    }
    await expect(claimAimTrace(input)).resolves.toMatchObject({ acquired: true })
    await expect(claimAimTrace(input)).resolves.toEqual({ acquired: false, reason: "duplicate" })
  })

  it("模型执行前可安全释放 claim，并允许同一确定性 ID 再次领取", async () => {
    const { claimAimTrace, releaseAimTraceClaim } = await import("@/lib/aim-observability")
    const input = { id: "sales_diag_prestart_release", action: "generate" as const }
    const first = await claimAimTrace(input)
    expect(first.acquired).toBe(true)
    if (!first.acquired) throw new Error("expected acquired claim")
    await releaseAimTraceClaim(first.trace)
    await expect(claimAimTrace(input)).resolves.toMatchObject({ acquired: true })
  })
})
