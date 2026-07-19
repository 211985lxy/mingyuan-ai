import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  validateCronSecret: vi.fn(),
  reclaimExpiredBackgroundTaskLeases: vi.fn(),
  findMany: vi.fn(),
  executeCompetitorAnalysisBackgroundTask: vi.fn(),
  executeInspirationBackgroundTask: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({ validateCronSecret: mocks.validateCronSecret }))
vi.mock("@/lib/background-tasks", () => ({ reclaimExpiredBackgroundTaskLeases: mocks.reclaimExpiredBackgroundTaskLeases }))
vi.mock("@/lib/prisma", () => ({ prisma: { backgroundTask: { findMany: mocks.findMany } } }))
vi.mock("@/lib/competitor-analysis/background-task", () => ({
  COMPETITOR_ANALYSIS_TASK_KIND: "competitor_analysis",
  executeCompetitorAnalysisBackgroundTask: mocks.executeCompetitorAnalysisBackgroundTask,
}))
vi.mock("@/features/topics/services/inspiration-background-task", () => ({
  INSPIRATION_PROCESS_TASK_KIND: "inspiration_process",
  executeInspirationBackgroundTask: mocks.executeInspirationBackgroundTask,
}))

import { GET, maxDuration } from "@/app/api/cron/background-tasks/route"

function request() {
  return new NextRequest("http://localhost/api/cron/background-tasks")
}

describe("GET /api/cron/background-tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.validateCronSecret.mockReturnValue(true)
    mocks.reclaimExpiredBackgroundTaskLeases.mockResolvedValue({ count: 0 })
    mocks.findMany.mockResolvedValue([])
  })

  it("fails closed without a valid cron secret", async () => {
    mocks.validateCronSecret.mockReturnValue(false)

    const response = await GET(request())

    expect(response.status).toBe(401)
    expect(mocks.findMany).not.toHaveBeenCalled()
  })

  it("processes one ready task per bounded invocation", async () => {
    mocks.reclaimExpiredBackgroundTaskLeases.mockResolvedValue({ count: 2 })
    mocks.findMany.mockResolvedValue([{ id: "task-1", kind: "competitor_analysis" }])
    mocks.executeCompetitorAnalysisBackgroundTask.mockResolvedValue(true)

    const response = await GET(request())

    expect(maxDuration).toBe(300)
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 1 }))
    expect(mocks.executeCompetitorAnalysisBackgroundTask).toHaveBeenCalledWith("task-1")
    await expect(response.json()).resolves.toEqual({ ok: true, reclaimed: 2, ready: 1, executed: 1 })
  })
})
