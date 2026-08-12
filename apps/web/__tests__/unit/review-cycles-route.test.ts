import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const {
  createReviewCycle,
  loadReviewMetricsSnapshot,
  recordAdminAudit,
  prisma,
} = vi.hoisted(() => ({
  createReviewCycle: vi.fn(),
  loadReviewMetricsSnapshot: vi.fn(),
  recordAdminAudit: vi.fn(async () => "audit_1"),
  prisma: {
    governanceAssignment: { findFirst: vi.fn() },
    reviewCycle: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/admin-auth", () => ({
  withAdminOrEditor: (handler: any) => handler,
  withAdminOnly: (handler: unknown) => handler,
}))
vi.mock("@/lib/admin-audit", () => ({ recordAdminAudit }))
vi.mock("@/lib/aim/review-cycle-store", () => ({ createReviewCycle }))
vi.mock("@/lib/aim/review-cycle-metrics", () => ({ loadReviewMetricsSnapshot }))
vi.mock("@/lib/prisma", () => ({ prisma }))

import { GET, POST } from "@/app/api/admin/aim/review-cycles/route"

const SERVER_SNAPSHOT = {
  publishedCount: 1,
  qualifiedLeadCount: 1,
  appointmentCount: 1,
  dealCount: 1,
  revenue: 100,
  paymentCount: 1,
  paymentAmountCny: null,
  customerOutcomeCount: 0,
  timeSavedMinutes: 10,
  firstPassAcceptanceRate: 1,
  rewriteRate: 0,
  rejectionRate: 0,
  directCostPerSuccess: 1,
  fullyLoadedCost: 5,
  p0FailureCount: 0,
  p1FailureCount: 0,
  humanTakeoverCount: 0,
  highCostAnomalyCount: 0,
  pendingKnowledgeCandidates: 0,
  pendingCaseCandidates: 0,
  pendingMemoryCandidates: 0,
  pendingEvalCandidates: 0,
  pendingMethodologyCandidates: 0,
  previousActionCloseRate: null,
  day7BackfillRate: null,
}

const context = { admin: { id: "admin_1", role: "admin" } }

function post(overrides: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost/api/admin/aim/review-cycles", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      requestId: "review_request_1",
      periodStart: "2026-07-06T00:00:00Z",
      periodEnd: "2026-07-13T00:00:00Z",
      systemOwnerId: "system_owner_1",
      humanHourlyCostCny: 100,
      filterSnapshot: { projectId: "project_1", channel: "web" },
      metricsSnapshot: { revenue: 999999999 },
      actions: [{
        title: "补齐回填",
        ownerId: "owner_1",
        dueAt: "2026-07-15T00:00:00Z",
      }],
      ...overrides,
    }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  prisma.governanceAssignment.findFirst.mockResolvedValue({ id: "assignment_1" })
  prisma.reviewCycle.findMany.mockResolvedValue([])
  loadReviewMetricsSnapshot.mockResolvedValue(SERVER_SNAPSHOT)
  createReviewCycle.mockResolvedValue({
    created: true,
    record: { id: "cycle_1" },
  })
})

describe("admin review cycles API", () => {
  it("服务端生成指标快照，忽略客户端伪造 snapshot", async () => {
    const response = await POST(post(), context as never)
    expect(response.status).toBe(201)
    expect(loadReviewMetricsSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        humanHourlyCostCny: 100,
        filters: { projectId: "project_1", channel: "web" },
      }),
    )
    expect(createReviewCycle).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: expect.objectContaining({ metricsSnapshot: SERVER_SNAPSHOT }),
      }),
    )
  })

  it("未配置 active system owner 时 fail closed", async () => {
    prisma.governanceAssignment.findFirst.mockResolvedValueOnce(null)
    const response = await POST(post(), context as never)
    expect(response.status).toBe(403)
    expect(loadReviewMetricsSnapshot).not.toHaveBeenCalled()
  })

  it("GET 在 100 条边界内按筛选快照过滤", async () => {
    prisma.reviewCycle.findMany.mockResolvedValue([{
      id: "cycle_1",
      filterSnapshot: { projectId: "project_1", workflowId: "growth" },
      actions: [],
    }])
    const response = await GET(new NextRequest(
      "http://localhost/api/admin/aim/review-cycles?projectId=project_1&workflowId=growth",
    ), context as never)
    expect(response.status).toBe(200)
    expect(prisma.reviewCycle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    )
    expect((await response.json()).items).toHaveLength(1)
  })
})
