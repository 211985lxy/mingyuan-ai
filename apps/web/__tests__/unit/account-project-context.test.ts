import { beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => {
  const user = { findUnique: vi.fn(), updateMany: vi.fn() }
  const clientProject = {
    count: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  }
  const knowledgeEntry = { count: vi.fn() }
  const script = { count: vi.fn() }
  const aimGeneration = { count: vi.fn() }
  const agentInvocation = { findMany: vi.fn(), updateMany: vi.fn() }
  const backgroundTask = { findMany: vi.fn(), updateMany: vi.fn() }
  const transaction = vi.fn()
  const queryRawUnsafe = vi.fn()
  const lockClientProjects = vi.fn()
  const prisma = {
    $transaction: transaction,
    user,
    clientProject,
    knowledgeEntry,
    script,
    aimGeneration,
    agentInvocation,
    backgroundTask,
  }
  return {
    user,
    clientProject,
    knowledgeEntry,
    script,
    aimGeneration,
    agentInvocation,
    backgroundTask,
    transaction,
    queryRawUnsafe,
    lockClientProjects,
    prisma,
  }
})

vi.mock("@/lib/prisma", () => ({ prisma: m.prisma }))

vi.mock("@/features/projects/services/project-row-lock", () => ({
  lockClientProjects: m.lockClientProjects,
}))

import {
  getAccountProjectContext,
  resolveBoundProject,
  AccountProjectContextError,
  createInitialAccountProject,
  getAccountProjectRepairImpact,
  repairAccountProjectBinding,
  createAccountProjectRepairToken,
  verifyAccountProjectRepairToken,
  hashAccountProjectRepairReason,
} from "@/lib/account-project-context"

function installTransaction() {
  m.queryRawUnsafe.mockResolvedValue([])
  m.lockClientProjects.mockResolvedValue(undefined)
  m.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback({
      user: m.user,
      clientProject: m.clientProject,
      knowledgeEntry: m.knowledgeEntry,
      script: m.script,
      aimGeneration: m.aimGeneration,
      agentInvocation: m.agentInvocation,
      backgroundTask: m.backgroundTask,
      $queryRawUnsafe: m.queryRawUnsafe,
    }),
  )
}

const PREVIEW_USER = {
  id: "user-1",
  boundProjectId: "project-a",
  boundProject: { id: "project-a", name: "项目A", status: "active" },
}

describe("account project context", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    installTransaction()
  })

  it("returns the account's bound project", async () => {
    m.user.findUnique.mockResolvedValue({ boundProjectId: "project-ai" })
    m.clientProject.findFirst.mockResolvedValue({ id: "project-ai", name: "AI商业顾问", status: "active" })

    await expect(resolveBoundProject({ userId: "user-1" })).resolves.toEqual({
      id: "project-ai",
      name: "AI商业顾问",
      status: "active",
    })
    expect(m.clientProject.findFirst).toHaveBeenCalledWith({
      where: { id: "project-ai", userId: "user-1", status: "active" },
      select: { id: true, name: true, status: true },
    })
  })

  it("rejects a requested project that differs from the account binding", async () => {
    m.user.findUnique.mockResolvedValue({ boundProjectId: "project-ai" })

    await expect(resolveBoundProject({ userId: "user-1", requestedProjectId: "project-heating" }))
      .rejects.toMatchObject({ code: "PROJECT_CONTEXT_MISMATCH", status: 409 })
    expect(m.clientProject.findFirst).not.toHaveBeenCalled()
  })

  it("reports setup when a new account has no project", async () => {
    m.user.findUnique.mockResolvedValue({ boundProjectId: null })
    m.clientProject.count.mockResolvedValue(0)

    await expect(getAccountProjectContext("user-1")).resolves.toEqual({ status: "setup_required" })
  })

  it("reports review when an existing account has unbound projects", async () => {
    m.user.findUnique.mockResolvedValue({ boundProjectId: null })
    m.clientProject.count.mockResolvedValue(2)

    await expect(getAccountProjectContext("user-1")).resolves.toEqual({
      status: "admin_review_required",
      projectCount: 2,
    })
  })

  it("reports inactive-project recovery when the account only owns paused/archived projects", async () => {
    m.user.findUnique.mockResolvedValue({ boundProjectId: null })
    // active count = 0, inactive count = 1
    m.clientProject.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1)

    await expect(getAccountProjectContext("user-1")).resolves.toEqual({
      status: "inactive_project_recovery_required",
      projectCount: 1,
    })
  })

  it("counts active projects separately so mixed accounts stay in admin review", async () => {
    m.user.findUnique.mockResolvedValue({ boundProjectId: null })
    // active count = 2, inactive count = 3 → admin_review_required (active wins)
    m.clientProject.count.mockResolvedValueOnce(2).mockResolvedValueOnce(3)

    await expect(getAccountProjectContext("user-1")).resolves.toEqual({
      status: "admin_review_required",
      projectCount: 2,
    })
  })

  it("rejects a binding whose project is inactive", async () => {
    m.user.findUnique.mockResolvedValue({ boundProjectId: "project-old" })
    m.clientProject.findFirst.mockResolvedValue(null)

    await expect(resolveBoundProject({ userId: "user-1" })).rejects.toMatchObject({
      code: "BOUND_PROJECT_UNAVAILABLE",
      status: 409,
    })
  })

  it("does not dead-loop an inactive-only account into self-service creation", async () => {
    m.user.findUnique.mockResolvedValue({ boundProjectId: null })
    m.clientProject.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1)

    await expect(createInitialAccountProject("user-1", { name: "试图新建项目" }))
      .rejects.toMatchObject({ code: "ACCOUNT_PROJECT_RECOVERY_REQUIRED", status: 409 })
    expect(m.clientProject.create).not.toHaveBeenCalled()
    expect(m.user.updateMany).not.toHaveBeenCalled()
  })

  it("does not let an already bound account self-switch via first-project creation", async () => {
    m.user.findUnique.mockResolvedValue({ boundProjectId: "project-a" })

    await expect(createInitialAccountProject("user-1", { name: "另一个项目" }))
      .rejects.toMatchObject({ code: "ACCOUNT_ALREADY_BOUND", status: 409 })
    expect(m.clientProject.create).not.toHaveBeenCalled()
  })

  it("exposes a stable typed context error", () => {
    const error = new AccountProjectContextError("ACCOUNT_PROJECT_SETUP_REQUIRED", "需要先绑定项目")
    expect(error).toMatchObject({ code: "ACCOUNT_PROJECT_SETUP_REQUIRED", status: 409 })
  })

  it("exposes typed errors for the repair flow", () => {
    expect(new AccountProjectContextError("ACCOUNT_PROJECT_RECOVERY_REQUIRED", "恢复")).toMatchObject({
      code: "ACCOUNT_PROJECT_RECOVERY_REQUIRED",
      status: 409,
    })
    expect(new AccountProjectContextError("PROJECT_NOT_FOUND", "项目不存在", 404)).toMatchObject({
      code: "PROJECT_NOT_FOUND",
      status: 404,
    })
  })
})

describe("account project repair preview", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    installTransaction()
  })

  it("rejects an unknown user with 404", async () => {
    m.user.findUnique.mockResolvedValue(null)

    await expect(
      getAccountProjectRepairImpact(m.prisma as never, {
        userId: "user-1",
        targetProjectId: "project-b",
        reactivate: false,
      }),
    ).rejects.toMatchObject({ code: "ACCOUNT_NOT_FOUND", status: 404 })
  })

  it("rejects an unknown target project with 404", async () => {
    m.user.findUnique.mockResolvedValue({ id: "user-1", boundProjectId: "project-a", boundProject: null })
    m.clientProject.findUnique.mockResolvedValue(null)

    await expect(
      getAccountProjectRepairImpact(m.prisma as never, {
        userId: "user-1",
        targetProjectId: "project-missing",
        reactivate: false,
      }),
    ).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND", status: 404 })
  })

  it("rejects a target project owned by another account", async () => {
    m.user.findUnique.mockResolvedValue(PREVIEW_USER)
    m.clientProject.findUnique.mockResolvedValue({ id: "project-other", userId: "user-2", name: "他人项目", status: "active" })

    await expect(
      getAccountProjectRepairImpact(m.prisma as never, {
        userId: "user-1",
        targetProjectId: "project-other",
        reactivate: false,
      }),
    ).rejects.toMatchObject({ code: "PROJECT_CONTEXT_MISMATCH", status: 409 })
  })

  it("rejects an inactive target unless reactivation is requested", async () => {
    m.user.findUnique.mockResolvedValue(PREVIEW_USER)
    m.clientProject.findUnique.mockResolvedValue({ id: "project-paused", userId: "user-1", name: "停用项目", status: "paused" })

    await expect(
      getAccountProjectRepairImpact(m.prisma as never, {
        userId: "user-1",
        targetProjectId: "project-paused",
        reactivate: false,
      }),
    ).rejects.toMatchObject({ code: "TARGET_NOT_ACTIVE", status: 409 })
  })

  it("returns impact counts without any content body for a healthy rebind", async () => {
    m.user.findUnique.mockResolvedValue(PREVIEW_USER)
    m.clientProject.findUnique.mockResolvedValue({ id: "project-b", userId: "user-1", name: "项目B", status: "active" })
    m.knowledgeEntry.count.mockResolvedValueOnce(4)
    m.script.count.mockResolvedValueOnce(3)
    m.aimGeneration.count.mockResolvedValueOnce(9).mockResolvedValueOnce(7)
    m.agentInvocation.findMany.mockResolvedValue([
      { id: "inv-1", backgroundTaskId: "task-1" },
      { id: "inv-2", backgroundTaskId: null },
    ])
    m.backgroundTask.findMany.mockResolvedValue([{ id: "task-2" }])

    const impact = await getAccountProjectRepairImpact(m.prisma as never, {
      userId: "user-1",
      targetProjectId: "project-b",
      reactivate: false,
    })

    expect(impact).toEqual({
      userId: "user-1",
      currentBinding: { id: "project-a", name: "项目A", status: "active" },
      targetProject: { id: "project-b", name: "项目B", status: "active" },
      reactivationRequired: false,
      targetContentCounts: { knowledgeEntries: 4, scripts: 3, aimGenerations: 9 },
      wouldCancel: { agentInvocations: 2, backgroundTasks: 2 },
      unattributedHistoryCount: 7,
    })
  })
})

describe("repairAccountProjectBinding", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    installTransaction()
  })

  it("locks known project ids before reading status or updating the user", async () => {
    const callOrder: string[] = []
    m.lockClientProjects.mockImplementation(async () => {
      callOrder.push("lockClientProjects")
    })
    m.clientProject.findUnique.mockImplementation(async () => {
      callOrder.push("clientProject.findUnique")
      return { id: "project-b", userId: "user-1", name: "项目B", status: "active" }
    })
    m.user.findUnique.mockImplementation(async () => {
      callOrder.push("user.findUnique")
      return { boundProjectId: "project-a" }
    })
    m.user.updateMany.mockImplementation(async () => {
      callOrder.push("user.updateMany")
      return { count: 1 }
    })
    m.aimGeneration.count.mockResolvedValue(0)
    m.agentInvocation.findMany.mockResolvedValue([])

    await repairAccountProjectBinding({
      userId: "user-1",
      previousProjectId: "project-a",
      nextProjectId: "project-b",
      reactivateNext: false,
    })

    expect(m.lockClientProjects).toHaveBeenCalledWith(expect.anything(), ["project-b", "project-a"])
    expect(callOrder.slice(0, 4)).toEqual([
      "lockClientProjects",
      "clientProject.findUnique",
      "user.findUnique",
      "user.updateMany",
    ])
  })

  it("rejects repair when the next project is archived while waiting for the lock", async () => {
    m.lockClientProjects.mockImplementation(async () => undefined)
    m.clientProject.findUnique.mockResolvedValue({
      id: "project-b",
      userId: "user-1",
      name: "项目B",
      status: "archived",
    })
    m.user.findUnique.mockResolvedValue({ boundProjectId: "project-a" })

    await expect(
      repairAccountProjectBinding({
        userId: "user-1",
        previousProjectId: "project-a",
        nextProjectId: "project-b",
        reactivateNext: false,
      }),
    ).rejects.toMatchObject({ code: "TARGET_NOT_ACTIVE", status: 409 })
    expect(m.lockClientProjects).toHaveBeenCalled()
    expect(m.user.updateMany).not.toHaveBeenCalled()
  })

  it("repairs an active rebind atomically and quarantines the old project", async () => {
    m.user.findUnique.mockResolvedValue({ boundProjectId: "project-a" })
    m.clientProject.findUnique.mockResolvedValue({ id: "project-b", userId: "user-1", name: "项目B", status: "active" })
    m.user.updateMany.mockResolvedValue({ count: 1 })
    m.aimGeneration.count.mockResolvedValue(7)
    m.agentInvocation.findMany.mockResolvedValue([
      { id: "inv-1", backgroundTaskId: "task-1" },
      { id: "inv-2", backgroundTaskId: null },
    ])
    m.backgroundTask.findMany.mockResolvedValue([])
    m.agentInvocation.updateMany.mockResolvedValue({ count: 1 })
    m.backgroundTask.updateMany.mockResolvedValue({ count: 1 })

    const result = await repairAccountProjectBinding({
      userId: "user-1",
      previousProjectId: "project-a",
      nextProjectId: "project-b",
      reactivateNext: false,
    })

    expect(result).toMatchObject({
      previousProjectId: "project-a",
      nextProjectId: "project-b",
      reactivated: false,
      failedInvocationCount: 2,
      cancelledTaskCount: 1,
      unattributedHistoryCount: 7,
    })
    expect(m.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1", boundProjectId: "project-a" },
        data: expect.objectContaining({
          boundProjectId: "project-b",
          projectBindingSource: "admin_repair",
        }),
      }),
    )
    // Task 6 quarantine policy: invocation failed with the stable stale code,
    // pending background task cancelled with the stable reason.
    expect(m.agentInvocation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "inv-1", status: { in: ["queued", "running"] } },
        data: expect.objectContaining({ status: "failed", errorCode: "ACCOUNT_PROJECT_CONTEXT_STALE" }),
      }),
    )
    expect(m.backgroundTask.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "task-1", status: { in: ["queued", "leased", "retry_wait"] } },
        data: expect.objectContaining({ status: "cancelled", lastError: "ACCOUNT_PROJECT_CONTEXT_STALE" }),
      }),
    )
  })

  it("rejects when the binding moved since the preview", async () => {
    m.user.findUnique.mockResolvedValue({ boundProjectId: "project-changed" })
    m.clientProject.findUnique.mockResolvedValue({ id: "project-b", userId: "user-1", name: "项目B", status: "active" })

    await expect(
      repairAccountProjectBinding({
        userId: "user-1",
        previousProjectId: "project-a",
        nextProjectId: "project-b",
        reactivateNext: false,
      }),
    ).rejects.toMatchObject({ code: "ACCOUNT_BINDING_CHANGED", status: 409 })
    expect(m.lockClientProjects).toHaveBeenCalled()
    expect(m.user.updateMany).not.toHaveBeenCalled()
  })

  it("rejects a target project not owned by the account", async () => {
    m.user.findUnique.mockResolvedValue({ boundProjectId: "project-a" })
    m.clientProject.findUnique.mockResolvedValue({ id: "project-b", userId: "user-2", name: "他人项目", status: "active" })

    await expect(
      repairAccountProjectBinding({
        userId: "user-1",
        previousProjectId: "project-a",
        nextProjectId: "project-b",
        reactivateNext: false,
      }),
    ).rejects.toMatchObject({ code: "PROJECT_CONTEXT_MISMATCH", status: 409 })
  })

  it("rejects an inactive target unless the admin explicitly reactivates it", async () => {
    m.user.findUnique.mockResolvedValue({ boundProjectId: "project-a" })
    m.clientProject.findUnique.mockResolvedValue({ id: "project-paused", userId: "user-1", name: "停用项目", status: "paused" })

    await expect(
      repairAccountProjectBinding({
        userId: "user-1",
        previousProjectId: "project-a",
        nextProjectId: "project-paused",
        reactivateNext: false,
      }),
    ).rejects.toMatchObject({ code: "TARGET_NOT_ACTIVE", status: 409 })
    expect(m.user.updateMany).not.toHaveBeenCalled()
  })

  it("recovers an inactive project by reactivating it and binding an unbound account", async () => {
    m.user.findUnique.mockResolvedValue({ boundProjectId: null })
    m.clientProject.findUnique.mockResolvedValue({ id: "project-paused", userId: "user-1", name: "停用项目", status: "paused" })
    m.clientProject.update.mockResolvedValue({ id: "project-paused", userId: "user-1", name: "停用项目", status: "active" })
    m.user.updateMany.mockResolvedValue({ count: 1 })

    const result = await repairAccountProjectBinding({
      userId: "user-1",
      previousProjectId: null,
      nextProjectId: "project-paused",
      reactivateNext: true,
    })

    expect(result).toMatchObject({
      previousProjectId: null,
      nextProjectId: "project-paused",
      target: { id: "project-paused", name: "停用项目", status: "active" },
      reactivated: true,
      failedInvocationCount: 0,
      cancelledTaskCount: 0,
    })
    expect(m.clientProject.update).toHaveBeenCalledWith({
      where: { id: "project-paused" },
      data: { status: "active" },
    })
    expect(m.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1", boundProjectId: null },
        data: expect.objectContaining({ boundProjectId: "project-paused" }),
      }),
    )
  })

  // ── Task 10 review: admin audit must be atomic with the binding change ──

  describe("in-transaction admin audit (withinTransaction hook)", () => {
    /** Commit-only transaction simulator that rolls back writes when the callback throws. */
    function installCommitTrackingTransaction(adminAuditLogCreate: ReturnType<typeof vi.fn>) {
      const db = { boundProjectId: "project-a" as string | null }
      let committed = false
      m.user.findUnique.mockImplementation(async () => ({ boundProjectId: db.boundProjectId }))
      m.user.updateMany.mockImplementation(async ({ where, data }: { where: { id: string; boundProjectId: string | null }; data: { boundProjectId: string } }) => {
        if (where.id === "user-1" && where.boundProjectId === db.boundProjectId) {
          db.boundProjectId = data.boundProjectId
          return { count: 1 }
        }
        return { count: 0 }
      })
      m.transaction.mockImplementation(async (callback: (tx: Record<string, unknown>) => Promise<unknown>) => {
        const snapshot = db.boundProjectId
        const tx = {
          user: m.user,
          clientProject: m.clientProject,
          aimGeneration: m.aimGeneration,
          agentInvocation: m.agentInvocation,
          backgroundTask: m.backgroundTask,
          adminAuditLog: { create: adminAuditLogCreate },
          $queryRawUnsafe: m.queryRawUnsafe,
        }
        try {
          const outcome = await callback(tx)
          committed = true
          return outcome
        } catch (error) {
          db.boundProjectId = snapshot // simulate prisma rollback
          throw error
        }
      })
      return { db, isCommitted: () => committed }
    }

    /**
     * Narrow structural view of the transaction client the mocked
     * `$transaction` actually hands to the hook — only the audit delegate the
     * assertions touch. Cast to the service's full
     * `(tx: Prisma.TransactionClient, outcome: AccountProjectRepairResult) => Promise<void>`
     * signature at the call boundary below.
     */
    type AuditTx = {
      adminAuditLog: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> }
    }

    function repairWithAudit(withinTransaction: (tx: AuditTx) => Promise<void>) {
      return repairAccountProjectBinding({
        userId: "user-1",
        previousProjectId: "project-a",
        nextProjectId: "project-b",
        reactivateNext: false,
        // 测试只关心 adminAuditLog.create；真实签名是 Prisma.TransactionClient，这里收窄断言
        withinTransaction: withinTransaction as unknown as NonNullable<
          Parameters<typeof repairAccountProjectBinding>[0]["withinTransaction"]
        >,
      })
    }

    it("writes the admin audit row inside the committing transaction", async () => {
      const auditCreate = vi.fn().mockResolvedValue({ id: "audit-1" })
      const { db, isCommitted } = installCommitTrackingTransaction(auditCreate)
      m.clientProject.findUnique.mockResolvedValue({ id: "project-b", userId: "user-1", name: "项目B", status: "active" })
      m.aimGeneration.count.mockResolvedValue(0)
      m.agentInvocation.findMany.mockResolvedValue([])

      const result = await repairWithAudit(async (tx) => {
        await tx.adminAuditLog.create({ data: { adminId: "admin-1", action: "account_project.repair" } })
      })

      expect(result.nextProjectId).toBe("project-b")
      expect(auditCreate).toHaveBeenCalledTimes(1)
      expect(db.boundProjectId).toBe("project-b") // bound + audit committed together
      expect(isCommitted()).toBe(true)
    })

    it("rolls the binding change back when the in-transaction audit write fails", async () => {
      const auditError = new Error("audit write failed")
      const auditCreate = vi.fn().mockRejectedValue(auditError)
      const { db, isCommitted } = installCommitTrackingTransaction(auditCreate)
      m.clientProject.findUnique.mockResolvedValue({ id: "project-b", userId: "user-1", name: "项目B", status: "active" })
      m.aimGeneration.count.mockResolvedValue(0)
      m.agentInvocation.findMany.mockResolvedValue([])

      await expect(repairWithAudit(async (tx) => {
        await tx.adminAuditLog.create({ data: { adminId: "admin-1", action: "account_project.repair" } })
      })).rejects.toThrow(auditError)

      // No half-state: the binding claim was rolled back together with the audit.
      expect(db.boundProjectId).toBe("project-a")
      expect(isCommitted()).toBe(false)
    })
  })
})

describe("account project repair confirmation token", () => {
  const OLD_SECRET = process.env.ADMIN_JWT_SECRET

  beforeEach(() => {
    process.env.ADMIN_JWT_SECRET = "unit-test-admin-secret-0123456789abcdef"
  })

  afterEach(() => {
    if (OLD_SECRET === undefined) delete process.env.ADMIN_JWT_SECRET
    else process.env.ADMIN_JWT_SECRET = OLD_SECRET
  })

  it("signs a token that binds user, project, reactivation and reason", () => {
    const token = createAccountProjectRepairToken({
      userId: "user-1",
      previousProjectId: "project-a",
      projectId: "project-b",
      reactivate: false,
      reason: "错误绑定修复",
    })
    const payload = verifyAccountProjectRepairToken(token)

    expect(payload).not.toBeNull()
    expect(payload).toMatchObject({
      purpose: "account_project_repair",
      userId: "user-1",
      previousProjectId: "project-a",
      projectId: "project-b",
      reactivate: false,
    })
    expect(payload?.reasonHash).toBe(hashAccountProjectRepairReason("错误绑定修复"))
  })

  it("rejects a tampered token", () => {
    const token = createAccountProjectRepairToken({
      userId: "user-1",
      previousProjectId: null,
      projectId: "project-b",
      reactivate: false,
      reason: "原因",
    })
    expect(verifyAccountProjectRepairToken(`${token}x`)).toBeNull()
    expect(verifyAccountProjectRepairToken("garbage")).toBeNull()
  })

  it("rejects an expired token", () => {
    const now = Date.parse("2026-09-06T00:00:00.000Z")
    const token = createAccountProjectRepairToken({
      userId: "user-1",
      previousProjectId: null,
      projectId: "project-b",
      reactivate: true,
      reason: "原因",
      nowMs: now,
    })
    expect(verifyAccountProjectRepairToken(token, now)).not.toBeNull()
    expect(verifyAccountProjectRepairToken(token, now + 11 * 60 * 1000)).toBeNull()
  })
})
