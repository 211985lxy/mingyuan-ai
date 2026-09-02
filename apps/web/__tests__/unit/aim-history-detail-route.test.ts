import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  generationFindFirst: vi.fn(),
  projectFindFirst: vi.fn(),
  generationUpdate: vi.fn(),
  outcomeUpdateMany: vi.fn(),
  outcomeUpsert: vi.fn(),
  transaction: vi.fn(),
  authenticateRequest: vi.fn(async () => ({ id: "user-1" })),
  authErrorResponse: vi.fn(() => null),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aimGeneration: { findFirst: mocks.generationFindFirst },
    clientProject: { findFirst: mocks.projectFindFirst },
    $transaction: mocks.transaction,
  },
}))

vi.mock("@/lib/user-auth", () => ({
  authenticateRequest: mocks.authenticateRequest,
  authErrorResponse: mocks.authErrorResponse,
}))

import { GET, PATCH } from "@/app/api/aim/history/[id]/route"

const params = { params: Promise.resolve({ id: "generation-1" }) }

describe("aim history detail route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.transaction.mockImplementation(async (operation) => operation({
      aimGeneration: { update: mocks.generationUpdate },
      contentOutcome: { updateMany: mocks.outcomeUpdateMany, upsert: mocks.outcomeUpsert },
    }))
    mocks.generationUpdate.mockResolvedValue({ id: "generation-1" })
    mocks.outcomeUpdateMany.mockResolvedValue({ count: 0 })
    mocks.outcomeUpsert.mockResolvedValue({ id: "outcome-1" })
  })

  it("loads only the current user's generation and normalizes the legacy agent id", async () => {
    mocks.generationFindFirst.mockResolvedValueOnce({ id: "generation-1", agentId: "ip_video" })

    const response = await GET(new NextRequest("http://localhost/api/aim/history/generation-1"), params)

    expect(mocks.generationFindFirst).toHaveBeenCalledWith({ where: { id: "generation-1", userId: "user-1" } })
    expect(await response.json()).toEqual({ id: "generation-1", agentId: "content_producer", reasoningByFormat: {} })
  })

  it("normalizes legacy deep_copywriter agent id to work_editor", async () => {
    mocks.generationFindFirst.mockResolvedValueOnce({ id: "generation-2", agentId: "deep_copywriter" })

    const response = await GET(new NextRequest("http://localhost/api/aim/history/generation-2"), params)

    expect(await response.json()).toEqual({ id: "generation-2", agentId: "work_editor", reasoningByFormat: {} })
  })

  it("attaches a quick generation to an authorized active project", async () => {
    mocks.generationFindFirst.mockResolvedValueOnce({
      id: "generation-1", projectId: null, topicSelectionId: null,
      retroSnapshots: [], calibrationRules: [], decisionSnapshot: null,
    })
    mocks.projectFindFirst.mockResolvedValueOnce({ id: "project-1" })

    const response = await PATCH(new NextRequest("http://localhost/api/aim/history/generation-1", {
      method: "PATCH",
      body: JSON.stringify({ projectId: "project-1" }),
      headers: { "content-type": "application/json" },
    }), params)

    expect(response.status).toBe(200)
    expect(mocks.projectFindFirst).toHaveBeenCalledWith({
      where: { id: "project-1", userId: "user-1", status: "active" },
      select: { id: true },
    })
    expect(mocks.generationUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "generation-1" }, data: expect.objectContaining({ projectId: "project-1" }),
    }))
    expect(mocks.outcomeUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", generationId: "generation-1" },
      data: { projectId: "project-1" },
    })
  })

  it("rejects an unauthorized project before starting a transaction", async () => {
    mocks.generationFindFirst.mockResolvedValueOnce({
      id: "generation-1", projectId: null, topicSelectionId: null,
      retroSnapshots: [], calibrationRules: [], decisionSnapshot: null,
    })
    mocks.projectFindFirst.mockResolvedValueOnce(null)

    const response = await PATCH(new NextRequest("http://localhost/api/aim/history/generation-1", {
      method: "PATCH",
      body: JSON.stringify({ projectId: "project-other" }),
      headers: { "content-type": "application/json" },
    }), params)

    expect(response.status).toBe(404)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it("saves retro text, calibration rule, and structured outcome in one transaction", async () => {
    mocks.generationFindFirst.mockResolvedValueOnce({
      id: "generation-1", projectId: "project-1", topicSelectionId: "topic-1",
      retroSnapshots: [], calibrationRules: [], decisionSnapshot: null,
    })

    const response = await PATCH(new NextRequest("http://localhost/api/aim/history/generation-1", {
      method: "PATCH",
      body: JSON.stringify({
        retroSnapshot: { summary: "私信质量提升" },
        calibrationRule: { rule: "同类内容继续强化具体场景" },
        retroOutcome: { collectWindowDay: 7, dmCount: 3, qualifiedLeadCount: 2 },
      }),
      headers: { "content-type": "application/json" },
    }), params)

    expect(response.status).toBe(200)
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    expect(mocks.generationUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        retroSnapshots: [expect.objectContaining({ summary: "私信质量提升" })],
        calibrationRules: [expect.objectContaining({ rule: "同类内容继续强化具体场景" })],
      }),
    }))
    expect(mocks.outcomeUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        generationId: "generation-1", projectId: "project-1", dmCount: 3, qualifiedLeadCount: 2,
      }),
    }))
  })
})
