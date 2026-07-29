import { beforeEach, describe, expect, it, vi } from "vitest"

const { traceFindFirst, baselineFindFirst, eventCreate, eventFindUnique } = vi.hoisted(() => ({
  traceFindFirst: vi.fn(),
  baselineFindFirst: vi.fn(),
  eventCreate: vi.fn(),
  eventFindUnique: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aimExecutionTrace: { findFirst: traceFindFirst },
    taskEfficiencyBaseline: { findFirst: baselineFindFirst },
    aimRunEvent: { create: eventCreate, findUnique: eventFindUnique },
  },
}))

import { writeFinalRunOutcome } from "@/lib/aim/run-outcome-write-service"

const outcome = {
  workflowId: "content-growth-v1",
  taskType: "write_script",
  finalDisposition: "accepted_first_pass" as const,
  humanActiveMinutes: 12,
  reasonCode: "other",
  requestId: "req-1",
}

describe("writeFinalRunOutcome", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    traceFindFirst.mockResolvedValue({
      id: "trace-1",
      durationMs: 1200,
      totalTokens: 456,
      costCny: { toString: () => "1.25" },
    })
    baselineFindFirst.mockResolvedValue({ medianManualMinutes: 30 })
    eventCreate.mockResolvedValue({ id: "event-1" })
  })

  it("uses approved baseline and trace cost instead of caller-provided values", async () => {
    const result = await writeFinalRunOutcome({
      runId: "run_1",
      userId: "user-1",
      channel: "web",
      outcome,
    })
    expect(result).toEqual({ ok: true, id: "event-1", deduped: false })
    expect(eventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        runId: "run_1",
        userId: "user-1",
        workflowId: "content-growth-v1",
        taskType: "write_script",
        finalDisposition: "accepted_first_pass",
        humanActiveMinutes: 12,
        manualBaselineMinutes: 30,
        channel: "web",
        requestId: "req-1",
        metadata: expect.objectContaining({
          durationMs: 1200,
          totalTokens: 456,
          costCny: 1.25,
          manualBaselineMinutes: 30,
        }),
      }),
      select: { id: true },
    })
  })

  it("deduplicates through the database unique constraint", async () => {
    eventCreate.mockRejectedValueOnce({ code: "P2002" })
    eventFindUnique.mockResolvedValueOnce({ id: "event-existing" })
    const result = await writeFinalRunOutcome({
      runId: "run_1",
      userId: "user-1",
      channel: "api",
      outcome,
    })
    expect(result).toEqual({ ok: true, id: "event-existing", deduped: true })
    expect(eventFindUnique).toHaveBeenCalledWith({
      where: {
        userId_runId_requestId: {
          userId: "user-1",
          runId: "run_1",
          requestId: "req-1",
        },
      },
      select: { id: true },
    })
  })

  it("fails closed when the user does not own the run", async () => {
    traceFindFirst.mockResolvedValueOnce(null)
    await expect(writeFinalRunOutcome({
      runId: "run_missing",
      userId: "user-1",
      channel: "web",
      outcome,
    })).resolves.toMatchObject({ ok: false, code: "RUN_NOT_FOUND" })
    expect(eventCreate).not.toHaveBeenCalled()
  })
})
