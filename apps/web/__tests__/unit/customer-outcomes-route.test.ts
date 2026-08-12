import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const {
  generateCustomerOutcomeCaseCandidate,
  loadCustomerOutcomeSource,
  readCustomerOutcomeSyncConfig,
  syncCustomerOutcomeProjections,
  recordAdminAudit,
  prisma,
} = vi.hoisted(() => ({
  generateCustomerOutcomeCaseCandidate: vi.fn(),
  loadCustomerOutcomeSource: vi.fn(),
  readCustomerOutcomeSyncConfig: vi.fn(),
  syncCustomerOutcomeProjections: vi.fn(),
  recordAdminAudit: vi.fn(async () => "audit_1"),
  prisma: {
    customerOutcomeProjection: {
      findMany: vi.fn(),
    },
    clientProject: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/admin-auth", () => ({
  withAdminOrEditor: (handler: any) => handler,
  withAdminOnly: (handler: unknown) => handler,
}))
vi.mock("@/lib/admin-audit", () => ({ recordAdminAudit }))
vi.mock("@/lib/aim/customer-outcome-case-store", () => ({
  generateCustomerOutcomeCaseCandidate,
}))
vi.mock("@/lib/aim/customer-outcome-sync", () => ({
  loadCustomerOutcomeSource,
  readCustomerOutcomeSyncConfig,
  syncCustomerOutcomeProjections,
}))
vi.mock("@/lib/aim/customer-outcome-prisma", () => ({
  createPrismaCustomerOutcomeProjectionStore: vi.fn(() => ({})),
}))
vi.mock("@/lib/prisma", () => ({ prisma }))

import { GET, POST } from "@/app/api/admin/aim/customer-outcomes/route"

const config = {
  baseToken: "base_1",
  tableId: "table_1",
  cliPath: "/mock/lark",
}
const snapshot = {
  fields: [{ name: "客户结果记录ID", type: "text", writable: true }],
  records: [],
}

function post(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/admin/aim/customer-outcomes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

const context = { admin: { id: "admin_1", role: "admin" } }

beforeEach(() => {
  vi.clearAllMocks()
  readCustomerOutcomeSyncConfig.mockReturnValue(config)
  loadCustomerOutcomeSource.mockResolvedValue(snapshot)
  syncCustomerOutcomeProjections.mockResolvedValue({
    sourceRecords: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    conflicts: 0,
    observedFieldTypes: {},
    errors: [],
  })
  prisma.customerOutcomeProjection.findMany.mockResolvedValue([])
})

describe("admin customer outcome API", () => {
  it("verify 只读核对飞书，不写 AIM 投影", async () => {
    const response = await POST(post({ mode: "verify" }), context as never)
    expect(response.status).toBe(200)
    expect(loadCustomerOutcomeSource).toHaveBeenCalledWith({ config })
    expect(syncCustomerOutcomeProjections).not.toHaveBeenCalled()
    expect(recordAdminAudit).not.toHaveBeenCalled()
  })

  it("sync 写 AIM 投影并记录审计", async () => {
    const response = await POST(post({ mode: "sync" }), context as never)
    expect(response.status).toBe(200)
    expect(syncCustomerOutcomeProjections).toHaveBeenCalled()
    expect(recordAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "customer_outcome.sync" }),
    )
  })

  it("generate_candidates 只生成 pending 候选并审计", async () => {
    generateCustomerOutcomeCaseCandidate.mockResolvedValue({
      ok: true,
      created: true,
      candidate: { id: "candidate_1", reviewStatus: "pending" },
    })
    const response = await POST(post({
      mode: "generate_candidates",
      customerOutcomeProjectionId: "projection_1",
    }), context as never)
    expect(response.status).toBe(200)
    expect(generateCustomerOutcomeCaseCandidate).toHaveBeenCalledWith({
      customerOutcomeProjectionId: "projection_1",
    })
    expect(recordAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "customer_outcome.generate_candidates" }),
    )
  })

  it("GET 以 project/status 过滤并限制 100 条", async () => {
    const response = await GET(new NextRequest(
      "http://localhost/api/admin/aim/customer-outcomes?projectId=p1&reviewStatus=approved&limit=999",
    ), context as never)
    expect(response.status).toBe(200)
    expect(prisma.customerOutcomeProjection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: "p1", reviewStatus: "approved" },
        take: 100,
      }),
    )
  })
})
