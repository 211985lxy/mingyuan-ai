import { beforeEach, describe, expect, it, vi } from "vitest"

// ---------------------------------------------------------------------------
// Prisma mock — shared across the whole file. The audit engine is DB-free, so
// its tests never need prisma; the task/invocation primitives and the
// submitInvocation creation path are tested against this mocked client exactly
// like agent-invocation-idempotency.test.ts does.
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => {
  const agentInvocation = {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  }
  const backgroundTask = {
    upsert: vi.fn(),
    updateMany: vi.fn(),
    findUnique: vi.fn(),
  }
  const user = { findUnique: vi.fn() }
  const clientProject = { findFirst: vi.fn(), count: vi.fn() }
  const $transaction = vi.fn()
  return {
    agentInvocation,
    backgroundTask,
    user,
    clientProject,
    $transaction,
    prisma: { agentInvocation, backgroundTask, user, clientProject, $transaction },
  }
})

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }))
// The submission path's project asserts are mocked so the account-project
// re-resolution inside submitInvocation is the only decision maker under test.
vi.mock("@/lib/agent-api-auth", () => ({
  assertAgentProjectAccess: vi.fn(),
  assertAgentAccess: vi.fn(),
}))
vi.mock("@/lib/agent-token-quota", () => ({
  checkMinuteQuota: vi.fn(async () => ({ allowed: true })),
  assertDailyTokenBudget: vi.fn(),
}))
vi.mock("@/lib/aim-generator", () => ({}))

import { ACCOUNT_PROJECT_CONTEXT_STALE } from "@/lib/account-project-context"
import {
  claimBackgroundTask,
  cancelStaleProjectBackgroundTask,
  STALE_PROJECT_BACKGROUND_TASK_REASON,
  BACKGROUND_TASK_STATUS,
} from "@/lib/background-tasks"
import {
  failStaleProjectAgentInvocation,
  submitInvocation,
} from "@/lib/aim-remote/invocation-service"
import {
  classifyIsolationSnapshot,
  createIsolationAuditReport,
  runIsolationAuditCli,
  type IsolationAuditReport,
  type IsolationAuditSnapshot,
  type IsolationAuditStore,
  type IsolationAuditTx,
  type ScriptCandidateRow,
} from "@/lib/account-project-isolation-audit"
import type { AgentApiContext } from "@/lib/agent-api-auth"

const ISO = "2026-01-01T00:00:00.000Z"
const NOW_MS = Date.parse("2026-09-06T00:00:00.000Z")

// ---------------------------------------------------------------------------
// Audit-snapshot helpers (same shape as the Task 5 audit tests)
// ---------------------------------------------------------------------------
function emptySnapshot(): IsolationAuditSnapshot {
  return {
    scripts: [],
    contentGenerationRuns: [],
    videoCopyExtractions: [],
    competitorAnalyses: [],
    watchAccounts: [],
    crossProjectReferenceCount: 0,
    queuedBackgroundTaskCount: 0,
    queuedAgentInvocationCount: 0,
  }
}
function snapshot(partial: Partial<IsolationAuditSnapshot>): IsolationAuditSnapshot {
  return { ...emptySnapshot(), ...partial }
}
function script(over: Partial<ScriptCandidateRow>): ScriptCandidateRow {
  return { id: "s-1", userId: "u1", projectId: null, updatedAt: ISO, ...over }
}

// ---------------------------------------------------------------------------
// A fake audit store whose transaction also implements the Task 6 quarantine
// extension of the data layer (mimics what scripts/audit-account-project-isolation.ts
// provides via the real MariaDB client).
// ---------------------------------------------------------------------------
function quarantineStore(snapshotToServe: IsolationAuditSnapshot, stale: { agentInvocations: Array<{ id: string }>; backgroundTasks: Array<{ id: string }> }) {
  const setProjectId = vi.fn().mockResolvedValue(1)
  const loadStaleQueuedResources = vi.fn().mockResolvedValue(stale)
  const quarantineStaleAgentInvocation = vi.fn().mockResolvedValue(1)
  const quarantineStaleBackgroundTask = vi.fn().mockResolvedValue(1)
  const withTransaction = vi.fn(async (work: (tx: IsolationAuditTx) => Promise<unknown>) =>
    work({
      loadSnapshot: async () => snapshotToServe,
      setProjectId,
      loadStaleQueuedResources,
      quarantineStaleAgentInvocation,
      quarantineStaleBackgroundTask,
    } satisfies IsolationAuditTx)
  )
  const store: IsolationAuditStore = {
    loadSnapshot: async () => snapshotToServe,
    withTransaction: withTransaction as unknown as IsolationAuditStore["withTransaction"],
  }
  return { store, setProjectId, loadStaleQueuedResources, quarantineStaleAgentInvocation, quarantineStaleBackgroundTask, withTransaction }
}

function zeroConflictReport(): IsolationAuditReport {
  const s = snapshot({ scripts: [script({ id: "s-safe", generationRunProjectId: "p-a" })] })
  return createIsolationAuditReport(classifyIsolationSnapshot(s), { nowMs: NOW_MS })
}

// ---------------------------------------------------------------------------
// Part A — the audit apply mode quarantines stale queued resources in the
// same transaction as any schema/binding write (all-or-nothing).
// ---------------------------------------------------------------------------
describe("audit apply: quarantine of stale queued resources", () => {
  it("quarantines stale queued AgentInvocations and BackgroundTasks in the SAME transaction, counting each class independently", async () => {
    const fresh = snapshot({ scripts: [script({ id: "s-safe", generationRunProjectId: "p-a" })] })
    const { store, quarantineStaleAgentInvocation, quarantineStaleBackgroundTask, withTransaction } = quarantineStore(fresh, {
      agentInvocations: [{ id: "inv-old-1" }, { id: "inv-old-2" }],
      backgroundTasks: [{ id: "task-old-1" }],
    })

    const result = await runIsolationAuditCli({
      store,
      apply: true,
      report: zeroConflictReport(),
      quarantineStaleQueuedResources: true,
      nowMs: NOW_MS + 60_000,
    })

    expect(result.validation).toEqual({ ok: true })
    // Per-class counts land on the CLI result so they can be written to the audit log.
    expect(result.quarantine).toEqual({
      agentInvocations: { listed: 2, updated: 2, skippedRaced: 0 },
      backgroundTasks: { listed: 1, updated: 1, skippedRaced: 0 },
    })
    expect(quarantineStaleAgentInvocation).toHaveBeenCalledWith("inv-old-1")
    expect(quarantineStaleAgentInvocation).toHaveBeenCalledWith("inv-old-2")
    expect(quarantineStaleBackgroundTask).toHaveBeenCalledWith("task-old-1")
    // Everything happens inside a single transaction with the backfill writes.
    expect(withTransaction).toHaveBeenCalledTimes(1)
  })

  it("touches only queued/pending/in-flight resources — completed history keeps its original project", async () => {
    // Completed history rows are already project-scoped (projectId != null) and are
    // NEVER part of an apply plan; the data layer only lists still-active stale
    // resources, so finished invocations/tasks are never quarantined either.
    const reportSnapshot = snapshot({
      scripts: [
        script({ id: "s-null", generationRunProjectId: "p-a" }),
        script({ id: "s-completed", projectId: "p-original", generationRunProjectId: "p-original" }),
      ],
    })
    const report = createIsolationAuditReport(classifyIsolationSnapshot(reportSnapshot), { nowMs: NOW_MS })
    expect(report.safeToBackfillRows).toEqual([
      { model: "Script", id: "s-null", candidateProjectId: "p-a", evidenceTypes: ["generationRun.projectId"] },
    ])

    const fresh = snapshot({ scripts: [script({ id: "s-null", generationRunProjectId: "p-a" })] })
    const { store, setProjectId, quarantineStaleAgentInvocation, quarantineStaleBackgroundTask } = quarantineStore(fresh, {
      // A real data layer filters out succeeded/failed/cancelled resources; the
      // completed "s-completed" script / finished invocations never appear here.
      agentInvocations: [],
      backgroundTasks: [],
    })

    const result = await runIsolationAuditCli({
      store,
      apply: true,
      report,
      quarantineStaleQueuedResources: true,
      nowMs: NOW_MS + 60_000,
    })

    expect(result.validation).toEqual({ ok: true })
    expect(result.quarantine).toEqual({
      agentInvocations: { listed: 0, updated: 0, skippedRaced: 0 },
      backgroundTasks: { listed: 0, updated: 0, skippedRaced: 0 },
    })
    // Completed (already scoped) history is never rewritten and never quarantined.
    expect(setProjectId).toHaveBeenCalledTimes(1)
    expect(setProjectId).toHaveBeenCalledWith({ model: "Script", id: "s-null", candidateProjectId: "p-a" })
    const backfilledIds = setProjectId.mock.calls.map((call) => (call[0] as { id: string }).id)
    expect(backfilledIds).not.toContain("s-completed")
    expect(quarantineStaleAgentInvocation).not.toHaveBeenCalled()
    expect(quarantineStaleBackgroundTask).not.toHaveBeenCalled()
  })

  it("rejects (rolling back the whole transaction) when a quarantine class write fails — no half state", async () => {
    const fresh = snapshot({ scripts: [script({ id: "s-safe", generationRunProjectId: "p-a" })] })
    const { store, quarantineStaleAgentInvocation, quarantineStaleBackgroundTask } = quarantineStore(fresh, {
      agentInvocations: [{ id: "inv-old-1" }],
      backgroundTasks: [{ id: "task-old-1" }],
    })
    quarantineStaleAgentInvocation.mockResolvedValueOnce(1)
    quarantineStaleBackgroundTask.mockRejectedValueOnce(new Error("db unavailable"))

    await expect(
      runIsolationAuditCli({
        store,
        apply: true,
        report: zeroConflictReport(),
        quarantineStaleQueuedResources: true,
        nowMs: NOW_MS + 60_000,
      }),
    ).rejects.toThrow("db unavailable")

    // The error surfaced from inside the transaction is what makes the real
    // prisma $transaction roll back the binding/schema + quarantine together.
    expect(quarantineStaleAgentInvocation).toHaveBeenCalledWith("inv-old-1")
  })

  it("refuses to run quarantine against a data layer that does not implement it (fail closed)", async () => {
    const fresh = snapshot({ scripts: [script({ id: "s-safe", generationRunProjectId: "p-a" })] })
    const setProjectId = vi.fn().mockResolvedValue(1)
    const withTransaction = vi.fn(async (work: (tx: unknown) => Promise<unknown>) =>
      work({ loadSnapshot: async () => fresh, setProjectId })
    )
    const store: IsolationAuditStore = {
      loadSnapshot: async () => fresh,
      withTransaction: withTransaction as unknown as IsolationAuditStore["withTransaction"],
    }

    await expect(
      runIsolationAuditCli({
        store,
        apply: true,
        report: zeroConflictReport(),
        quarantineStaleQueuedResources: true,
        nowMs: NOW_MS + 60_000,
      }),
    ).rejects.toThrow(/quarantine/i)
  })

  it("keeps Task 5 data layers working: without the flag, apply never calls quarantine even when the extension exists", async () => {
    const fresh = snapshot({ scripts: [script({ id: "s-safe", generationRunProjectId: "p-a" })] })
    const { store, quarantineStaleAgentInvocation } = quarantineStore(fresh, {
      agentInvocations: [{ id: "inv-old-1" }],
      backgroundTasks: [{ id: "task-old-1" }],
    })

    const result = await runIsolationAuditCli({
      store,
      apply: true,
      report: zeroConflictReport(),
      nowMs: NOW_MS + 60_000,
    })

    expect(result.validation).toEqual({ ok: true })
    expect(result.quarantine).toBeNull()
    expect(quarantineStaleAgentInvocation).not.toHaveBeenCalled()
  })

  it("does not quarantine when apply validation fails (e.g. the report expired)", async () => {
    const fresh = snapshot({ scripts: [script({ id: "s-safe", generationRunProjectId: "p-a" })] })
    const { store, quarantineStaleAgentInvocation, quarantineStaleBackgroundTask } = quarantineStore(fresh, {
      agentInvocations: [{ id: "inv-old-1" }],
      backgroundTasks: [{ id: "task-old-1" }],
    })
    const expired = zeroConflictReport()

    const result = await runIsolationAuditCli({
      store,
      apply: true,
      report: expired,
      quarantineStaleQueuedResources: true,
      nowMs: expired.expiresAtMs + 1000,
    })

    expect(result.validation).toEqual({ ok: false, reason: "report_expired" })
    expect(quarantineStaleAgentInvocation).not.toHaveBeenCalled()
    expect(quarantineStaleBackgroundTask).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Quarantine primitives — the exact status + stable-reason semantics the data
// layer must write (the actual SQL a worker/repair path will observe).
// ---------------------------------------------------------------------------
describe("quarantine primitives (status + stable reason)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("cancels an old queued/leased BackgroundTask with lastError = ACCOUNT_PROJECT_CONTEXT_STALE and never touches completed tasks", async () => {
    mocks.backgroundTask.updateMany.mockResolvedValue({ count: 1 })
    const now = new Date("2026-09-06T12:00:00.000Z")

    const count = await cancelStaleProjectBackgroundTask(mocks.prisma as never, "task-old-1", now)

    expect(count).toBe(1)
    const call = mocks.backgroundTask.updateMany.mock.calls[0][0] as { where: Record<string, unknown>; data: Record<string, unknown> }
    // Only queued / leased / retry_wait (pending or in-flight) tasks are targeted.
    expect(call.where).toEqual({
      id: "task-old-1",
      status: { in: [BACKGROUND_TASK_STATUS.queued, BACKGROUND_TASK_STATUS.leased, BACKGROUND_TASK_STATUS.retryWait] },
    })
    expect(call.data).toMatchObject({
      status: BACKGROUND_TASK_STATUS.cancelled,
      lastError: ACCOUNT_PROJECT_CONTEXT_STALE,
      leaseToken: null,
      leaseExpiresAt: null,
      completedAt: now,
    })
    // The stable reason exported by background-tasks never drifts from the canonical code.
    expect(STALE_PROJECT_BACKGROUND_TASK_REASON).toBe(ACCOUNT_PROJECT_CONTEXT_STALE)
  })

  it("a cancelled task can no longer be claimed by a worker", async () => {
    // A worker claim only matches queued/retry_wait; after cancellation the
    // conditional claim update matches nothing.
    mocks.backgroundTask.updateMany.mockResolvedValue({ count: 0 })

    const claimed = await claimBackgroundTask(mocks.prisma as never, "task-old-1")

    expect(claimed).toBeNull()
    const call = mocks.backgroundTask.updateMany.mock.calls[0][0] as { where: Record<string, unknown> }
    expect(call.where.status).toEqual({ in: [BACKGROUND_TASK_STATUS.queued, BACKGROUND_TASK_STATUS.retryWait] })
  })

  it("fails an old queued/running AgentInvocation with errorCode ACCOUNT_PROJECT_CONTEXT_STALE and never touches completed invocations", async () => {
    mocks.agentInvocation.updateMany.mockResolvedValue({ count: 1 })
    const now = new Date("2026-09-06T12:00:00.000Z")

    const count = await failStaleProjectAgentInvocation(mocks.prisma as never, "inv-old-1", now)

    expect(count).toBe(1)
    const call = mocks.agentInvocation.updateMany.mock.calls[0][0] as { where: Record<string, unknown>; data: Record<string, unknown> }
    expect(call.where).toEqual({ id: "inv-old-1", status: { in: ["queued", "running"] } })
    expect(call.data).toMatchObject({
      status: "failed",
      errorCode: ACCOUNT_PROJECT_CONTEXT_STALE,
      completedAt: now,
    })
  })
})

// ---------------------------------------------------------------------------
// Part B — creation paths snapshot the CURRENT account binding server-side;
// a client-supplied arbitrary projectId can never override it.
// ---------------------------------------------------------------------------
describe("task creation snapshots the current binding", () => {
  function makeContext(boundProjectId?: string): AgentApiContext {
    return {
      apiKeyId: "key-1",
      userId: "user-1",
      boundProjectId,
      allowedProjects: ["proj-a", "proj-b"],
      allowedAgents: [],
      clientType: "codex",
      allowedScopes: [],
      expiresAt: null,
      maxInputChars: 50000,
      minuteLimit: 60,
      dailyTokenLimit: null,
    }
  }

  function makeInput(projectId: string) {
    return {
      idempotencyKey: "idem-key-stale-001",
      projectId,
      agentId: "content_producer" as never,
      rawInput: "写一条短视频文案",
      targetFormats: ["video_script"] as never,
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.agentInvocation.findUnique.mockResolvedValue(null)
    mocks.agentInvocation.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({ id: "inv-1", ...args.data }))
    mocks.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        agentInvocation: mocks.agentInvocation,
        backgroundTask: mocks.backgroundTask,
      }),
    )
    mocks.backgroundTask.upsert.mockResolvedValue({ id: "task-1" })
    mocks.clientProject.findFirst.mockResolvedValue({ id: "proj-a", name: "Project A", status: "active" })
  })

  it("creates the invocation under the project resolved from the current account binding", async () => {
    // Auth-time snapshot and the DB both say the account is bound to proj-a.
    mocks.user.findUnique.mockResolvedValue({ boundProjectId: "proj-a" })

    const result = await submitInvocation(makeContext("proj-a"), makeInput("proj-a"))

    expect(result.ok).toBe(true)
    const createArgs = mocks.agentInvocation.create.mock.calls[0]?.[0] as { data: { projectId?: string } }
    expect(createArgs?.data.projectId).toBe("proj-a")
  })

  it("rejects a submission whose project no longer matches the CURRENT binding (auth snapshot is stale)", async () => {
    // The account was bound to proj-a when the request was authenticated, but by
    // creation time an admin has rebound the account to proj-b. The client's
    // projectId must NOT be honoured and no invocation may be created.
    mocks.user.findUnique.mockResolvedValue({ boundProjectId: "proj-b" })

    await expect(submitInvocation(makeContext("proj-a"), makeInput("proj-a"))).rejects.toThrow(
      "AGENT_PROJECT_FORBIDDEN",
    )
    expect(mocks.agentInvocation.create).not.toHaveBeenCalled()
  })

  it("never stores a client-supplied arbitrary projectId when the account has a binding", async () => {
    // Even a well-formed submit cannot choose a project the account is not bound to.
    mocks.user.findUnique.mockResolvedValue({ boundProjectId: "proj-a" })

    await expect(submitInvocation(makeContext("proj-a"), makeInput("proj-b"))).rejects.toThrow(
      "AGENT_PROJECT_FORBIDDEN",
    )
    expect(mocks.agentInvocation.create).not.toHaveBeenCalled()
  })
})
