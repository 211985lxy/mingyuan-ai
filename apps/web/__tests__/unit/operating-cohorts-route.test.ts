import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const {
  readBusinessAttributionSyncConfig,
  loadBusinessAttributionSource,
  loadOperatingCohortEnrichment,
  buildOperatingCohortRecords,
} = vi.hoisted(() => ({
  readBusinessAttributionSyncConfig: vi.fn(),
  loadBusinessAttributionSource: vi.fn(),
  loadOperatingCohortEnrichment: vi.fn(),
  buildOperatingCohortRecords: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({
  withAdminAuth: (handler: unknown) => handler,
}))
vi.mock("@/lib/aim/business-attribution-sync", () => ({
  readBusinessAttributionSyncConfig,
  loadBusinessAttributionSource,
}))
vi.mock("@/lib/aim/operating-cohort-source", () => ({
  loadOperatingCohortEnrichment,
  buildOperatingCohortRecords,
}))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import { GET } from "@/app/api/admin/aim/operating-cohorts/route"

const context = { admin: { id: "admin_1" } }
const record = {
  externalRecordId: "feishu_record_1",
  dimension: "industry",
  segmentKey: "教培",
  leadCount: 1,
  appointmentCount: 1,
  dealCount: 1,
  paymentCount: 1,
  customerOutcomeSuccessCount: 1,
  windowStart: new Date("2026-07-01T00:00:00Z"),
  windowEnd: new Date("2026-08-01T00:00:00Z"),
}

beforeEach(() => {
  vi.clearAllMocks()
  readBusinessAttributionSyncConfig.mockReturnValue({
    baseToken: "base",
    tableId: "table_1",
    cliPath: "lark",
  })
  loadBusinessAttributionSource.mockResolvedValue({ fields: [], records: [] })
  loadOperatingCohortEnrichment.mockResolvedValue({})
  buildOperatingCohortRecords
    .mockReturnValueOnce({
      records: Array.from({ length: 10 }, (_, index) => ({
        ...record,
        externalRecordId: `current_${index}`,
      })),
      diagnostics: { eligibleSourceRecords: 10 },
    })
    .mockReturnValueOnce({
      records: Array.from({ length: 10 }, (_, index) => ({
        ...record,
        externalRecordId: `previous_${index}`,
        appointmentCount: 0,
      })),
      diagnostics: { eligibleSourceRecords: 10 },
    })
})

describe("operating cohorts admin route", () => {
  it("只返回描述统计、外部记录与明确计算窗口", async () => {
    const response = await GET(new NextRequest(
      "http://localhost/api/admin/aim/operating-cohorts"
      + "?start=2026-07-01T00:00:00Z&end=2026-08-01T00:00:00Z&dimension=industry",
    ), context as never)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.method).toBe("descriptive")
    expect(body.predictionUsed).toBe(false)
    expect(body.source).toEqual({
      system: "feishu_base",
      tableId: "table_1",
      observedFieldTypes: {},
    })
    expect(body.items[0].externalRecordIds).toContain("current_0")
    expect(body.items[0].trendVerdict).toBe("up")
  })

  it("非法维度在读取飞书前拒绝", async () => {
    const response = await GET(new NextRequest(
      "http://localhost/api/admin/aim/operating-cohorts?dimension=model_score",
    ), context as never)
    expect(response.status).toBe(400)
    expect(loadBusinessAttributionSource).not.toHaveBeenCalled()
  })
})
