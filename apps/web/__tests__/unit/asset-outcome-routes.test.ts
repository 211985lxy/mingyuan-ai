import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

// 资产候选与回填提醒路由测试（90 天计划 3.1/3.2）。
// mock 用户鉴权与 store，验证状态码透传与鉴权边界。

const {
  authenticateRequest,
  authErrorResponse,
  generateMeetingAssetCandidates,
  reviewAssetCandidate,
  listAssetCandidates,
  findDueOutcomeReminders,
} = vi.hoisted(() => ({
  authenticateRequest: vi.fn(async () => ({ id: "user-1" })),
  authErrorResponse: vi.fn(() => null),
  generateMeetingAssetCandidates: vi.fn(),
  reviewAssetCandidate: vi.fn(),
  listAssetCandidates: vi.fn(async () => []),
  findDueOutcomeReminders: vi.fn(),
}))

vi.mock("@/lib/user-auth", () => ({ authenticateRequest, authErrorResponse }))
vi.mock("@/lib/aim/asset-candidate-store", () => ({
  generateMeetingAssetCandidates,
  reviewAssetCandidate,
  listAssetCandidates,
}))
vi.mock("@/lib/aim/outcome-reminders", () => ({ findDueOutcomeReminders }))

import { POST as generatePOST } from "@/app/api/aim/meeting-insights/[id]/asset-candidates/route"
import { GET as listGET } from "@/app/api/aim/asset-candidates/route"
import { PATCH as reviewPATCH } from "@/app/api/aim/asset-candidates/[id]/route"
import { GET as remindersGET } from "@/app/api/aim/outcomes/reminders/route"

const genCtx = { params: Promise.resolve({ id: "gen_1" }) }
const candCtx = { params: Promise.resolve({ id: "cand_1" }) }

describe("POST /api/aim/meeting-insights/[id]/asset-candidates", () => {
  beforeEach(() => vi.clearAllMocks())

  it("未认证 → 401", async () => {
    authenticateRequest.mockRejectedValueOnce(new Error("unauthorized"))
    authErrorResponse.mockReturnValueOnce(
      new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }) as never,
    )
    const res = await generatePOST(
      new NextRequest("http://localhost/api/aim/meeting-insights/gen_1/asset-candidates", {
        method: "POST",
        body: JSON.stringify({ approve: true }),
      }),
      genCtx,
    )
    expect(res.status).toBe(401)
  })

  it("approve=true 透传给 store，成功返回 created/skipped", async () => {
    generateMeetingAssetCandidates.mockResolvedValueOnce({
      ok: true,
      created: 6,
      skipped: 0,
      candidates: [],
    })
    const res = await generatePOST(
      new NextRequest("http://localhost/api/aim/meeting-insights/gen_1/asset-candidates", {
        method: "POST",
        body: JSON.stringify({ approve: true }),
      }),
      genCtx,
    )
    expect(res.status).toBe(200)
    expect(generateMeetingAssetCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", generationId: "gen_1", approve: true }),
    )
    const body = await res.json()
    expect(body.created).toBe(6)
  })

  it("store 返回 409/404 时按状态码透传", async () => {
    generateMeetingAssetCandidates.mockResolvedValueOnce({
      ok: false,
      status: 409,
      error: "会议洞察尚未人工审核通过",
    })
    const res = await generatePOST(
      new NextRequest("http://localhost/api/aim/meeting-insights/gen_1/asset-candidates", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      genCtx,
    )
    expect(res.status).toBe(409)
  })
})

describe("GET /api/aim/asset-candidates", () => {
  beforeEach(() => vi.clearAllMocks())

  it("按用户过滤并透传 projectId/reviewStatus/kind 过滤条件", async () => {
    const res = await listGET(
      new NextRequest(
        "http://localhost/api/aim/asset-candidates?projectId=proj_1&reviewStatus=pending&kind=pain_point",
      ),
    )
    expect(res.status).toBe(200)
    expect(listAssetCandidates).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        projectId: "proj_1",
        reviewStatus: "pending",
        kind: "pain_point",
      }),
    )
  })
})

describe("PATCH /api/aim/asset-candidates/[id]", () => {
  beforeEach(() => vi.clearAllMocks())

  it("非法 action → 400", async () => {
    const res = await reviewPATCH(
      new NextRequest("http://localhost/api/aim/asset-candidates/cand_1", {
        method: "PATCH",
        body: JSON.stringify({ action: "delete" }),
      }),
      candCtx,
    )
    expect(res.status).toBe(400)
  })

  it("合法审核透传 action/promote/crossProjectAllowed", async () => {
    reviewAssetCandidate.mockResolvedValueOnce({
      ok: true,
      record: { id: "cand_1", reviewStatus: "approved", promotedEntryId: "entry_1" },
    })
    const res = await reviewPATCH(
      new NextRequest("http://localhost/api/aim/asset-candidates/cand_1", {
        method: "PATCH",
        body: JSON.stringify({ action: "approve", promote: true, crossProjectAllowed: true }),
      }),
      candCtx,
    )
    expect(res.status).toBe(200)
    expect(reviewAssetCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        candidateId: "cand_1",
        action: "approve",
        promote: true,
        crossProjectAllowed: true,
      }),
    )
  })

  it("404/409 透传", async () => {
    reviewAssetCandidate.mockResolvedValueOnce({ ok: false, status: 404, error: "not found" })
    const res = await reviewPATCH(
      new NextRequest("http://localhost/api/aim/asset-candidates/cand_1", {
        method: "PATCH",
        body: JSON.stringify({ action: "approve" }),
      }),
      candCtx,
    )
    expect(res.status).toBe(404)
  })
})

describe("GET /api/aim/outcomes/reminders", () => {
  beforeEach(() => vi.clearAllMocks())

  it("返回当前用户到期提醒", async () => {
    findDueOutcomeReminders.mockResolvedValueOnce([
      { generationId: "g1", windowDay: 7, missing: "row" },
    ])
    const res = await remindersGET(new NextRequest("http://localhost/api/aim/outcomes/reminders"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.reminders).toHaveLength(1)
    expect(findDueOutcomeReminders).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1" }),
    )
  })
})
