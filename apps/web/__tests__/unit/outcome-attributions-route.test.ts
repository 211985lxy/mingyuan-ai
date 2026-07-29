import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const {
  loadBusinessAttributionSource,
  readBusinessAttributionSyncConfig,
  syncBusinessAttributions,
  recordAdminAudit,
  prisma,
} = vi.hoisted(() => ({
  loadBusinessAttributionSource: vi.fn(),
  readBusinessAttributionSyncConfig: vi.fn(),
  syncBusinessAttributions: vi.fn(),
  recordAdminAudit: vi.fn(async () => "audit_1"),
  prisma: {
    outcomeAttribution: { findMany: vi.fn() },
    aimGeneration: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/admin-auth", () => ({
  withAdminAuth: (handler: unknown) => handler,
}))
vi.mock("@/lib/admin-audit", () => ({ recordAdminAudit }))
vi.mock("@/lib/aim/business-attribution-sync", () => ({
  loadBusinessAttributionSource,
  readBusinessAttributionSyncConfig,
  syncBusinessAttributions,
}))
vi.mock("@/lib/aim/outcome-attribution-prisma", () => ({
  createPrismaOutcomeAttributionStore: vi.fn(() => ({})),
}))
vi.mock("@/lib/prisma", () => ({ prisma }))

import { GET, POST } from "@/app/api/admin/aim/outcome-attributions/route"

const config = {
  baseToken: "base_1",
  tableId: "table_1",
  cliPath: "/mock/lark",
}
const snapshot = {
  fields: [{ name: "AIM生成ID", type: "text", writable: true }],
  records: [],
}

function post(mode: string) {
  return new NextRequest("http://localhost/api/admin/aim/outcome-attributions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode }),
  })
}

function context() {
  return { admin: { id: "admin_1", role: "admin" } }
}

beforeEach(() => {
  vi.clearAllMocks()
  readBusinessAttributionSyncConfig.mockReturnValue(config)
  loadBusinessAttributionSource.mockResolvedValue(snapshot)
  syncBusinessAttributions.mockResolvedValue({
    sourceRecords: 1,
    created: 1,
    updated: 0,
    skipped: 0,
    conflicts: 0,
    missingFields: [],
    observedFieldTypes: {},
    errors: [],
  })
  prisma.outcomeAttribution.findMany.mockResolvedValue([])
})

describe("admin outcome attribution API", () => {
  it("verify 只读核对字段，不写投影", async () => {
    const response = await POST(post("verify"), context() as never)
    expect(response.status).toBe(200)
    expect(loadBusinessAttributionSource).toHaveBeenCalledWith({ config })
    expect(syncBusinessAttributions).not.toHaveBeenCalled()
    expect(recordAdminAudit).not.toHaveBeenCalled()
  })

  it("sync 显式执行投影并写管理审计", async () => {
    const response = await POST(post("sync"), context() as never)
    expect(response.status).toBe(200)
    expect(syncBusinessAttributions).toHaveBeenCalled()
    expect(recordAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "outcome_attribution.sync" }),
    )
  })

  it("未知 mode fail closed", async () => {
    const response = await POST(post("auto"), context() as never)
    expect(response.status).toBe(400)
    expect(loadBusinessAttributionSource).not.toHaveBeenCalled()
  })

  it("GET 强制 100 条上限", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/admin/aim/outcome-attributions?limit=999&generationId=gen_1",
      ),
      context() as never,
    )
    expect(response.status).toBe(200)
    expect(prisma.outcomeAttribution.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { generationId: "gen_1" }, take: 100 }),
    )
  })
})
