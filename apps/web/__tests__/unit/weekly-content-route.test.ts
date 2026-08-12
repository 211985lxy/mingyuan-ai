import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ authenticateRequest: vi.fn(), projectFindFirst: vi.fn(), topicFindMany: vi.fn(), generationFindMany: vi.fn() }))
vi.mock("@/lib/user-auth", () => ({ authenticateRequest: mocks.authenticateRequest, authErrorResponse: () => null }))
vi.mock("@/lib/prisma", () => ({ prisma: {
  clientProject: { findFirst: mocks.projectFindFirst },
  topicSelection: { findMany: mocks.topicFindMany },
  aimGeneration: { findMany: mocks.generationFindMany },
} }))

import { GET } from "@/app/api/aim/weekly-content/route"

describe("GET /api/aim/weekly-content", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authenticateRequest.mockResolvedValue({ id: "user-1" })
    mocks.projectFindFirst.mockResolvedValue({ id: "project-1" })
    mocks.topicFindMany.mockResolvedValue([])
    mocks.generationFindMany.mockResolvedValue([])
  })

  it("requires an owned active project and bounded queries", async () => {
    const response = await GET(new NextRequest("http://localhost/api/aim/weekly-content?projectId=project-1&start=2026-08-10&end=2026-08-17"))
    expect(response.status).toBe(200)
    expect(mocks.projectFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "project-1", userId: "user-1", status: "active" } }))
    expect(mocks.topicFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }))
    expect(mocks.generationFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 200 }))
  })

  it("rejects projects outside the user scope", async () => {
    mocks.projectFindFirst.mockResolvedValue(null)
    const response = await GET(new NextRequest("http://localhost/api/aim/weekly-content?projectId=project-2"))
    expect(response.status).toBe(404)
  })
})
