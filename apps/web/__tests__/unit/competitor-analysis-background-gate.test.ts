import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// ---------------------------------------------------------------------------
// Prisma mock — the executor claims via prisma.backgroundTask, reads the owning
// CompetitorAnalysis row, and the account-project guard reads prisma.user /
// prisma.clientProject. Real @/lib/background-tasks helpers are used (they only
// call the mocked prisma delegates), mirroring account-project-execution-guard.
// ---------------------------------------------------------------------------
const prismaMock = vi.hoisted(() => {
  const backgroundTask = { updateMany: vi.fn(), findUnique: vi.fn() }
  const competitorAnalysis = { findUnique: vi.fn(), update: vi.fn() }
  const user = { findUnique: vi.fn() }
  const clientProject = { findFirst: vi.fn(), count: vi.fn() }
  return {
    backgroundTask,
    competitorAnalysis,
    user,
    clientProject,
    prisma: {
      backgroundTask,
      competitorAnalysis,
      user,
      clientProject,
    },
  }
})

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock.prisma }))

// The pipeline is the "model" step: it must never run when the guard rejects.
const { runCompetitorAnalysisPipelineMock } = vi.hoisted(() => ({
  runCompetitorAnalysisPipelineMock: vi.fn(async () => undefined),
}))
vi.mock("@/lib/competitor-analysis/pipeline", () => ({
  runCompetitorAnalysisPipeline: runCompetitorAnalysisPipelineMock,
}))

import { executeCompetitorAnalysisBackgroundTask } from "@/lib/competitor-analysis/background-task"
import { ACCOUNT_PROJECT_CONTEXT_STALE } from "@/lib/account-project-context"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    aggregateId: "analysis-1",
    aggregateType: "competitor_analysis",
    kind: "competitor_analysis",
    leaseToken: "lease-1",
    attempt: 1,
    maxAttempts: 1,
    availableAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  }
}

function claimAlways() {
  prismaMock.backgroundTask.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.backgroundTask.findUnique.mockResolvedValue(makeTask())
}

function bindUserTo(boundProjectId: string | null) {
  prismaMock.user.findUnique.mockResolvedValue({ boundProjectId })
}

function wasTaskMarkedSucceeded() {
  return prismaMock.backgroundTask.updateMany.mock.calls.some((c) => {
    const data = (c[0] as { data?: Record<string, unknown> })?.data
    return data?.status === "succeeded"
  })
}

function wasTaskMarkedFailed() {
  return prismaMock.backgroundTask.updateMany.mock.calls.some((c) => {
    const data = (c[0] as { data?: Record<string, unknown> })?.data
    return data?.status === "failed"
  })
}

function failedTaskError(): string | undefined {
  const call = prismaMock.backgroundTask.updateMany.mock.calls.find((c) => {
    const data = (c[0] as { data?: Record<string, unknown> })?.data
    return data?.status === "failed"
  })
  const data = call?.[0] as { data?: { lastError?: string } } | undefined
  return data?.data?.lastError
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  claimAlways()
  prismaMock.competitorAnalysis.findUnique.mockResolvedValue({
    id: "analysis-1",
    userId: "user-1",
    projectId: "project-a",
  })
  prismaMock.competitorAnalysis.update.mockResolvedValue({})
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("executeCompetitorAnalysisBackgroundTask — account-project gate", () => {
  it("(a1) isolates a legacy row with projectId null: pipeline NOT invoked, task failed with ACCOUNT_PROJECT_CONTEXT_STALE", async () => {
    bindUserTo("project-a")
    prismaMock.competitorAnalysis.findUnique.mockResolvedValue({
      id: "analysis-1",
      userId: "user-1",
      projectId: null, // 历史空项目记录
    })

    const ok = await executeCompetitorAnalysisBackgroundTask("task-1")

    expect(ok).toBe(true)
    expect(runCompetitorAnalysisPipelineMock).not.toHaveBeenCalled()
    expect(wasTaskMarkedSucceeded()).toBe(false)
    expect(wasTaskMarkedFailed()).toBe(true)
    expect(failedTaskError()).toContain(ACCOUNT_PROJECT_CONTEXT_STALE)

    // Analysis row marked failed with the generic, non-leaking message.
    const analysisUpdate = prismaMock.competitorAnalysis.update.mock.calls[0]?.[0] as {
      data?: { errorMessage?: string; status?: string }
    }
    expect(analysisUpdate.data?.status).toBe("failed")
    expect(analysisUpdate.data?.errorMessage).toContain("请联系管理员")
    expect(analysisUpdate.data?.errorMessage).not.toContain("project-a")
  })

  it("(a2) isolates when the record's project no longer matches the account binding", async () => {
    bindUserTo("bound-proj") // account now bound elsewhere
    prismaMock.competitorAnalysis.findUnique.mockResolvedValue({
      id: "analysis-1",
      userId: "user-1",
      projectId: "project-a", // record was queued under project-a
    })

    const ok = await executeCompetitorAnalysisBackgroundTask("task-1")

    expect(ok).toBe(true)
    expect(runCompetitorAnalysisPipelineMock).not.toHaveBeenCalled()
    expect(wasTaskMarkedSucceeded()).toBe(false)
    expect(wasTaskMarkedFailed()).toBe(true)
    expect(failedTaskError()).toContain(ACCOUNT_PROJECT_CONTEXT_STALE)
    expect(wasTaskMarkedSucceeded()).toBe(false)
  })

  it("(a3) never schedules a retry for a stale binding", async () => {
    prismaMock.backgroundTask.findUnique.mockResolvedValue(makeTask({ maxAttempts: 3 }))
    bindUserTo("bound-proj")
    prismaMock.competitorAnalysis.findUnique.mockResolvedValue({
      id: "analysis-1",
      userId: "user-1",
      projectId: "project-a",
    })

    await executeCompetitorAnalysisBackgroundTask("task-2")

    const retryWait = prismaMock.backgroundTask.updateMany.mock.calls.some((c) => {
      const data = (c[0] as { data?: Record<string, unknown> })?.data
      return data?.status === "retry_wait"
    })
    expect(retryWait).toBe(false)
    expect(wasTaskMarkedFailed()).toBe(true)
  })

  it("logs only safe identifiers for a stale/null project — never content or project names in the record error", async () => {
    bindUserTo("bound-proj")
    prismaMock.competitorAnalysis.findUnique.mockResolvedValue({
      id: "analysis-1",
      userId: "user-1",
      projectId: "project-a",
    })

    await executeCompetitorAnalysisBackgroundTask("task-1")

    const entries = consoleErrorSpy.mock.calls.map((c: unknown[]) => c[1] as Record<string, unknown>)
    expect(entries.length).toBe(1)
    expect(entries[0]).toMatchObject({
      source: "background",
      taskId: "task-1",
      userId: "user-1",
      expectedProjectId: "project-a",
    })
    expect(JSON.stringify(entries[0])).not.toContain("customer")
  })

  it("(b) a matching bound project proceeds: pipeline invoked and task completes", async () => {
    bindUserTo("project-a")
    prismaMock.clientProject.findFirst.mockResolvedValue({
      id: "project-a",
      name: "项目A",
      status: "active",
    })
    runCompetitorAnalysisPipelineMock.mockResolvedValue(undefined)

    const ok = await executeCompetitorAnalysisBackgroundTask("task-1")

    expect(ok).toBe(true)
    expect(runCompetitorAnalysisPipelineMock).toHaveBeenCalledWith("analysis-1")
    expect(wasTaskMarkedSucceeded()).toBe(true)
    expect(wasTaskMarkedFailed()).toBe(false)
  })

  it("releases the task when the owning analysis row no longer exists", async () => {
    bindUserTo("project-a")
    prismaMock.competitorAnalysis.findUnique.mockResolvedValue(null)

    const ok = await executeCompetitorAnalysisBackgroundTask("task-1")

    expect(ok).toBe(true)
    expect(runCompetitorAnalysisPipelineMock).not.toHaveBeenCalled()
    expect(wasTaskMarkedSucceeded()).toBe(true)
  })
})
