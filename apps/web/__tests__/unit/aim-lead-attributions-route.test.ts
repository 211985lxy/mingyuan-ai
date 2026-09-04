import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const { findFirst, authenticateRequest, authErrorResponse, store } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  authenticateRequest: vi.fn(async () => ({ id: "user-1" })),
  authErrorResponse: vi.fn(() => null),
  store: {
    findByExternalRecordId: vi.fn(async () => null),
    findByExternalLeadId: vi.fn(async () => null),
    findByExternalDealId: vi.fn(async () => null),
    findByExternalPaymentId: vi.fn(async () => null),
    create: vi.fn(async (data: Record<string, unknown>) => ({ ...data })),
    update: vi.fn(async (id: string, data: Record<string, unknown>) => ({ id, ...data })),
  },
}))

vi.mock("@/lib/prisma", () => ({
  prisma: { aimGeneration: { findFirst } },
}))
vi.mock("@/lib/user-auth", () => ({ authenticateRequest, authErrorResponse }))
vi.mock("@/lib/aim/outcome-attribution-prisma", () => ({
  createPrismaOutcomeAttributionStore: vi.fn(() => store),
}))

import { POST } from "@/app/api/aim/lead-attributions/route"

function request(body: unknown) {
  return new NextRequest("http://localhost/api/aim/lead-attributions", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

const baseRecord = {
  id: "rec-existing",
  userId: "user-1",
  generationId: "gen-other",
  externalLeadId: "wx_lead_1",
  externalAppointmentId: null,
  externalDealId: null,
  externalPaymentId: null,
  externalRecordId: null,
  externalTableId: null,
  externalSourceContentId: null,
  externalAttributionConfirmer: null,
  attributionMethod: "unknown",
  attributionConfidence: "low",
  occurredAt: new Date("2026-09-01T00:00:00.000Z"),
}

describe("aim lead attributions route（WP-B 强制点②）", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authenticateRequest.mockResolvedValue({ id: "user-1" })
    authErrorResponse.mockReturnValue(null)
    store.findByExternalRecordId.mockResolvedValue(null)
    store.findByExternalLeadId.mockResolvedValue(null)
    store.findByExternalDealId.mockResolvedValue(null)
    store.findByExternalPaymentId.mockResolvedValue(null)
    store.create.mockImplementation(async (data: Record<string, unknown>) => ({ ...data }))
    store.update.mockImplementation(async (id: string, data: Record<string, unknown>) => ({ id, ...data }))
    findFirst.mockResolvedValue({ id: "gen-1" })
  })

  it("rejects missing generationId", async () => {
    const response = await POST(request({ externalLeadId: "wx_lead_1" }))
    expect(response.status).toBe(400)
    expect(findFirst).not.toHaveBeenCalled()
  })

  it("rejects missing externalLeadId", async () => {
    const response = await POST(request({ generationId: "gen-1" }))
    expect(response.status).toBe(400)
    expect(findFirst).not.toHaveBeenCalled()
  })

  it("rejects content not owned by the user", async () => {
    findFirst.mockResolvedValue(null)
    const response = await POST(request({ generationId: "gen-1", externalLeadId: "wx_lead_1" }))
    expect(response.status).toBe(404)
    expect(store.create).not.toHaveBeenCalled()
  })

  it("creates an explicit/high attribution marked 网页快登", async () => {
    const response = await POST(request({
      generationId: "gen-1",
      externalLeadId: " wx_lead_1 ",
      externalDealId: "deal_1",
    }))

    expect(response.status).toBe(201)
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "gen-1", userId: "user-1" },
      select: { id: true },
    })
    expect(store.create).toHaveBeenCalledTimes(1)
    const draft = store.create.mock.calls[0][0] as Record<string, unknown>
    expect(draft.userId).toBe("user-1")
    expect(draft.generationId).toBe("gen-1")
    expect(draft.externalLeadId).toBe("wx_lead_1")
    expect(draft.externalDealId).toBe("deal_1")
    expect(draft.externalAttributionConfirmer).toBe("网页快登")
    expect(draft.attributionMethod).toBe("explicit")
    expect(draft.attributionConfidence).toBe("high")
    expect(draft.occurredAt).toBeInstanceOf(Date)
  })

  it("merges a duplicate lead idempotently and returns 200", async () => {
    store.findByExternalLeadId.mockResolvedValue({ ...baseRecord, generationId: "gen-1" })
    const response = await POST(request({
      generationId: "gen-1",
      externalLeadId: "wx_lead_1",
      externalDealId: "deal_9",
    }))

    expect(response.status).toBe(200)
    expect(store.create).not.toHaveBeenCalled()
    expect(store.update).toHaveBeenCalledTimes(1)
    const [, data] = store.update.mock.calls[0] as [string, Record<string, unknown>]
    expect(data.externalDealId).toBe("deal_9")
  })

  it("returns 409 when the lead is bound to another content", async () => {
    store.findByExternalLeadId.mockResolvedValue({ ...baseRecord, generationId: "gen-other" })
    const response = await POST(request({ generationId: "gen-1", externalLeadId: "wx_lead_1" }))

    expect(response.status).toBe(409)
    const body = await response.json()
    expect(body.error).toContain("需人工核对")
    expect(store.update).not.toHaveBeenCalled()
  })

  it("returns 409 when the deal id is bound to another lead", async () => {
    store.findByExternalDealId.mockResolvedValue({ ...baseRecord, externalLeadId: "wx_other" })
    const response = await POST(request({
      generationId: "gen-1",
      externalLeadId: "wx_lead_1",
      externalDealId: "deal_1",
    }))

    expect(response.status).toBe(409)
    expect(store.create).not.toHaveBeenCalled()
  })
})
