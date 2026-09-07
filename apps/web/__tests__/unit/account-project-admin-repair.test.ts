import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const impactFixture = {
  userId: "user-1",
  currentBinding: { id: "project-a", name: "项目A", status: "active" },
  targetProject: { id: "project-b", name: "项目B", status: "active" },
  reactivationRequired: false,
  targetContentCounts: { knowledgeEntries: 4, scripts: 3, aimGenerations: 9 },
  wouldCancel: { agentInvocations: 2, backgroundTasks: 2 },
  unattributedHistoryCount: 7,
}

const m = vi.hoisted(() => {
  const adminWrapped = { count: 0 }
  const withAdminOnly = vi.fn(
    (handler: (request: NextRequest, context: { admin: { id: string }; params: Record<string, string> }) => unknown) => {
      adminWrapped.count += 1
      return (request: NextRequest) => handler(request, { admin: { id: "admin-1" }, params: { userId: "user-1" } })
    },
  )
  return {
    withAdminOnly,
    recordAdminAudit: vi.fn(async () => "audit-1"),
    getImpact: vi.fn(),
    createToken: vi.fn(),
    verifyToken: vi.fn(),
    hashReason: vi.fn((reason: string) => `hash:${reason}`),
    repairBinding: vi.fn(),
    adminWrapped,
  }
})
const { recordAdminAudit, getImpact, createToken, verifyToken, hashReason, repairBinding, adminWrapped } = m

vi.mock("@/lib/admin-auth", () => ({ withAdminOnly: m.withAdminOnly }))
vi.mock("@/lib/admin-audit", () => ({ recordAdminAudit: m.recordAdminAudit }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/account-project-context", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/account-project-context")>()
  return {
    ...actual,
    getAccountProjectRepairImpact: m.getImpact,
    createAccountProjectRepairToken: m.createToken,
    verifyAccountProjectRepairToken: m.verifyToken,
    hashAccountProjectRepairReason: m.hashReason,
    repairAccountProjectBinding: m.repairBinding,
  }
})

import { GET as previewGET, POST as previewPOST } from "@/app/api/admin/account-project-bindings/[userId]/preview/route"
import { POST as repairPOST } from "@/app/api/admin/account-project-bindings/[userId]/repair/route"

function jsonRequest(url: string, method: string, body?: Record<string, unknown>) {
  return new NextRequest(url, {
    method,
    ...(body ? {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    } : {}),
  })
}

// The real `withAdminOnly` wrapper types the exported handlers as
// (request, segmentData: { params: Promise<Record<string, string>> }).
// The mocked wrapper injects its own admin context and ignores this argument,
// so passing a resolved params object keeps the type contract without
// changing runtime behavior.
const segmentData = { params: Promise.resolve({ userId: "user-1" }) }

describe("admin account project preview route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns the impact summary for the requested target project", async () => {
    getImpact.mockResolvedValue(impactFixture)

    const response = await previewGET(
      jsonRequest(
        "http://localhost/api/admin/account-project-bindings/user-1/preview?projectId=project-b",
        "GET",
      ),
      segmentData,
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ impact: impactFixture })
    expect(getImpact).toHaveBeenCalledWith(expect.anything(), {
      userId: "user-1",
      targetProjectId: "project-b",
      reactivate: false,
    })
  })

  it("requires a target project id", async () => {
    const response = await previewGET(
      jsonRequest("http://localhost/api/admin/account-project-bindings/user-1/preview", "GET"),
      segmentData,
    )
    expect(response.status).toBe(400)
    expect(getImpact).not.toHaveBeenCalled()
  })

  it("rejects an inactive target unless reactivation is passed", async () => {
    const { AccountProjectContextError } = await import("@/lib/account-project-context")
    getImpact.mockRejectedValue(
      new AccountProjectContextError("TARGET_NOT_ACTIVE", "目标项目不是 active", 409),
    )

    const response = await previewGET(
      jsonRequest(
        "http://localhost/api/admin/account-project-bindings/user-1/preview?projectId=project-paused",
        "GET",
      ),
      segmentData,
    )
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ code: "TARGET_NOT_ACTIVE" })
  })

  it("mints a short-lived confirmation token bound to user, project, reactivation and reason", async () => {
    getImpact.mockResolvedValue(impactFixture)
    createToken.mockReturnValue("token-1")

    const response = await previewPOST(
      jsonRequest(
        "http://localhost/api/admin/account-project-bindings/user-1/preview",
        "POST",
        { projectId: "project-b", reason: "错误绑定修复", reactivate: false },
      ),
      segmentData,
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ impact: impactFixture, token: "token-1" })
    expect(createToken).toHaveBeenCalledWith({
      userId: "user-1",
      previousProjectId: "project-a",
      projectId: "project-b",
      reactivate: false,
      reason: "错误绑定修复",
    })
  })

  it("requires a reason before issuing a confirmation token", async () => {
    getImpact.mockResolvedValue(impactFixture)

    const response = await previewPOST(
      jsonRequest(
        "http://localhost/api/admin/account-project-bindings/user-1/preview",
        "POST",
        { projectId: "project-b", reactivate: false },
      ),
      segmentData,
    )
    expect(response.status).toBe(400)
    expect(createToken).not.toHaveBeenCalled()
  })
})

describe("admin account project repair route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const validPayload = (overrides: Record<string, unknown> = {}) => ({
    purpose: "account_project_repair",
    userId: "user-1",
    previousProjectId: "project-a",
    projectId: "project-b",
    reactivate: false,
    reasonHash: hashReason("错误绑定修复"),
    issuedAtMs: Date.now(),
    expiresAtMs: Date.now() + 10 * 60 * 1000,
    nonce: "nonce-1",
    v: 1,
    ...overrides,
  })

  it("rejects when no reason is provided", async () => {
    verifyToken.mockReturnValue(validPayload())

    const response = await repairPOST(
      jsonRequest("http://localhost/api/admin/account-project-bindings/user-1/repair", "POST", { token: "token-1" }),
      segmentData,
    )

    expect(response.status).toBe(400)
    expect(repairBinding).not.toHaveBeenCalled()
    expect(recordAdminAudit).not.toHaveBeenCalled()
  })

  it("rejects when no confirmation token is provided", async () => {
    const response = await repairPOST(
      jsonRequest(
        "http://localhost/api/admin/account-project-bindings/user-1/repair",
        "POST",
        { reason: "错误绑定修复" },
      ),
      segmentData,
    )
    expect(response.status).toBe(400)
    expect(repairBinding).not.toHaveBeenCalled()
  })

  it("rejects an invalid or expired confirmation token", async () => {
    verifyToken.mockReturnValue(null)

    const response = await repairPOST(
      jsonRequest(
        "http://localhost/api/admin/account-project-bindings/user-1/repair",
        "POST",
        { token: "stale-token", reason: "错误绑定修复" },
      ),
      segmentData,
    )
    expect(response.status).toBe(403)
    expect(repairBinding).not.toHaveBeenCalled()
    expect(recordAdminAudit).not.toHaveBeenCalled()
  })

  it("rejects a token minted for a different user", async () => {
    verifyToken.mockReturnValue(validPayload({ userId: "user-other" }))

    const response = await repairPOST(
      jsonRequest(
        "http://localhost/api/admin/account-project-bindings/user-1/repair",
        "POST",
        { token: "token-1", reason: "错误绑定修复" },
      ),
      segmentData,
    )
    expect(response.status).toBe(403)
    expect(repairBinding).not.toHaveBeenCalled()
  })

  it("rejects a reason that no longer matches the confirmation token", async () => {
    verifyToken.mockReturnValue(validPayload({ reasonHash: "hash:something-else" }))

    const response = await repairPOST(
      jsonRequest(
        "http://localhost/api/admin/account-project-bindings/user-1/repair",
        "POST",
        { token: "token-1", reason: "错误绑定修复" },
      ),
      segmentData,
    )
    expect(response.status).toBe(409)
    expect(repairBinding).not.toHaveBeenCalled()
  })

  it("surfaces repair-domain rejections such as an unowned target project", async () => {
    const { AccountProjectContextError } = await import("@/lib/account-project-context")
    verifyToken.mockReturnValue(validPayload())
    repairBinding.mockRejectedValue(
      new AccountProjectContextError("PROJECT_CONTEXT_MISMATCH", "项目不属于当前账号", 409),
    )

    const response = await repairPOST(
      jsonRequest(
        "http://localhost/api/admin/account-project-bindings/user-1/repair",
        "POST",
        { token: "token-1", reason: "错误绑定修复" },
      ),
      segmentData,
    )
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ code: "PROJECT_CONTEXT_MISMATCH" })
    expect(recordAdminAudit).not.toHaveBeenCalled()
  })

  it("executes an audited repair after a valid second confirmation", async () => {
    const repairResult = {
      previousProjectId: "project-a",
      nextProjectId: "project-b",
      target: { id: "project-b", name: "项目B", status: "active" },
      reactivated: false,
      failedInvocationCount: 2,
      cancelledTaskCount: 2,
      unattributedHistoryCount: 7,
    }
    verifyToken.mockReturnValue(validPayload())
    // The real repair service runs its own transaction and invokes the audit
    // hook (withinTransaction) BEFORE commit; mirror that contract here.
    repairBinding.mockImplementation(async ({ withinTransaction }: { withinTransaction?: (tx: unknown, outcome: unknown) => Promise<void> }) => {
      if (withinTransaction) await withinTransaction("tx-sentinel", repairResult)
      return repairResult
    })

    const response = await repairPOST(
      jsonRequest(
        "http://localhost/api/admin/account-project-bindings/user-1/repair",
        "POST",
        { token: "token-1", reason: "错误绑定修复" },
      ),
      segmentData,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("x-request-id")).toBe("audit-1")
    await expect(response.json()).resolves.toEqual({ data: repairResult })
    expect(repairBinding).toHaveBeenCalledWith({
      userId: "user-1",
      previousProjectId: "project-a",
      nextProjectId: "project-b",
      reactivateNext: false,
      withinTransaction: expect.any(Function),
    })
    expect(recordAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        adminId: "admin-1",
        action: "account_project.repair",
        targetType: "user",
        targetId: "user-1",
        metadata: expect.objectContaining({
          previousProjectId: "project-a",
          nextProjectId: "project-b",
          reason: "错误绑定修复",
          reactivate: false,
          failedInvocationCount: 2,
          cancelledTaskCount: 2,
          unattributedHistoryCount: 7,
        }),
      }),
      "tx-sentinel",
    )
  })

  it("fails closed when the in-transaction audit write throws (no success response)", async () => {
    verifyToken.mockReturnValue(validPayload())
    recordAdminAudit.mockRejectedValue(new Error("audit write failed"))
    repairBinding.mockImplementation(async ({ withinTransaction }: { withinTransaction?: (tx: unknown, outcome: unknown) => Promise<void> }) => {
      if (withinTransaction) await withinTransaction(undefined, {})
      return { previousProjectId: "project-a", nextProjectId: "project-b" }
    })

    const response = await repairPOST(
      jsonRequest(
        "http://localhost/api/admin/account-project-bindings/user-1/repair",
        "POST",
        { token: "token-1", reason: "错误绑定修复" },
      ),
      segmentData,
    )

    // 审计失败必须让整个修复报错（真实 DB 中该事务回滚），而不是返回成功。
    expect(response.status).toBe(500)
    expect(response.headers.get("x-request-id")).toBeNull()
  })

  it("gates the preview and repair surface behind admin auth", () => {
    // The preview + repair route modules define their handlers via
    // `withAdminOnly` at import time — an ordinary account never gets a
    // self-service repair/switch endpoint (the count survives clearAllMocks
    // because it is tracked outside the mock call history).
    expect(adminWrapped.count).toBeGreaterThanOrEqual(2)
  })
})
