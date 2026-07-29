import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const { traceFindMany, eventFindMany, aggregateRunOutcomeMetrics } = vi.hoisted(() => ({
  traceFindMany: vi.fn(),
  eventFindMany: vi.fn(),
  aggregateRunOutcomeMetrics: vi.fn(() => ({ runCount: 1 })),
}))

vi.mock("@/lib/admin-auth", () => ({
  withAdminAuth: (handler: (request: NextRequest, context: unknown) => unknown) =>
    (request: NextRequest) => handler(request, { admin: { id: "admin-1" } }),
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    aimExecutionTrace: { findMany: traceFindMany },
    aimRunEvent: { findMany: eventFindMany },
  },
}))
vi.mock("@/lib/aim/run-outcome-metrics", () => ({
  aggregateRunOutcomeMetrics,
}))

import { GET } from "@/app/api/admin/aim/operating-metrics/route"

describe("operating metrics route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    traceFindMany.mockResolvedValue([{
      id: "trace-1",
      runId: "run_1",
      durationMs: 100,
      costCny: 1,
      createdAt: new Date("2026-07-01T00:00:00Z"),
      updatedAt: new Date("2026-07-02T00:00:00Z"),
    }])
    eventFindMany.mockResolvedValue([{
      id: "event-1",
      runId: "run_1",
      event: "final_disposition",
      metadata: {},
      createdAt: new Date("2026-08-01T00:00:00Z"),
    }])
  })

  it("uses completed trace universe and reads all matching outcome events across periods", async () => {
    const response = await GET(new NextRequest(
      "http://localhost/api/admin/aim/operating-metrics"
      + "?start=2026-07-01T00:00:00Z&end=2026-07-08T00:00:00Z",
    ))
    expect(response.status).toBe(200)
    expect(traceFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        updatedAt: {
          gte: new Date("2026-07-01T00:00:00Z"),
          lt: new Date("2026-07-08T00:00:00Z"),
        },
      }),
    }))
    expect(eventFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        runId: { in: ["run_1"] },
      }),
    }))
    expect(eventFindMany.mock.calls[0]?.[0]?.where).not.toHaveProperty("createdAt")
    expect(aggregateRunOutcomeMetrics).toHaveBeenCalledWith(expect.objectContaining({
      traces: expect.arrayContaining([expect.objectContaining({ runId: "run_1" })]),
      events: expect.arrayContaining([expect.objectContaining({ id: "event-1" })]),
    }))
  })

  it("does not query events when the period has no trace runId", async () => {
    traceFindMany.mockResolvedValueOnce([{
      id: "trace-missing",
      runId: null,
      durationMs: null,
      costCny: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }])
    const response = await GET(new NextRequest(
      "http://localhost/api/admin/aim/operating-metrics"
      + "?start=2026-07-01T00:00:00Z&end=2026-07-08T00:00:00Z",
    ))
    expect(response.status).toBe(200)
    expect(eventFindMany).not.toHaveBeenCalled()
    expect(aggregateRunOutcomeMetrics).toHaveBeenCalledWith(expect.objectContaining({
      events: [],
    }))
  })
})
