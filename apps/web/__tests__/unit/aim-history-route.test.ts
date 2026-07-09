import { describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const { findMany, authenticateRequest, authErrorResponse } = vi.hoisted(() => ({
  findMany: vi.fn(),
  authenticateRequest: vi.fn(async () => ({ id: "user-1" })),
  authErrorResponse: vi.fn(() => null),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aimGeneration: {
      findMany,
    },
  },
}))

vi.mock("@/lib/user-auth", () => ({
  authenticateRequest,
  authErrorResponse,
}))

import { GET } from "@/app/api/aim/history/route"

describe("aim history route", () => {
  it("loads legacy ip_video rows for content_producer and normalizes the response id", async () => {
    findMany.mockResolvedValueOnce([
      {
        id: "gen-1",
        agentId: "ip_video",
        rawInput: "旧记录",
        createdAt: new Date("2026-07-08T08:00:00.000Z"),
      },
    ])

    const res = await GET(new NextRequest("http://localhost:3000/api/aim/history?agentId=content_producer"))
    const body = await res.json()

    expect(authenticateRequest).toHaveBeenCalled()
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: "user-1",
        agentId: { in: ["content_producer", "ip_video"] },
      }),
    }))
    expect(body).toEqual([
      expect.objectContaining({
        id: "gen-1",
        agentId: "content_producer",
        rawInput: "旧记录",
      }),
    ])
  })
})
