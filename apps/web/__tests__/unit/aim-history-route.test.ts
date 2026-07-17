import { describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const { findMany, count, authenticateRequest, authErrorResponse } = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  authenticateRequest: vi.fn(async () => ({ id: "user-1" })),
  authErrorResponse: vi.fn(() => null),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aimGeneration: {
      findMany,
      count,
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

  it("returns a real pending total without changing the legacy response by default", async () => {
    findMany.mockResolvedValueOnce([{ id: "gen-2", agentId: "content_producer" }])
    count.mockResolvedValueOnce(12)

    const res = await GET(new NextRequest("http://localhost:3000/api/aim/history?scope=pending&includeTotal=true&pageSize=6"))
    const body = await res.json()

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: [
          { workflowStatus: { notIn: ["published", "archived"] } },
          { workflowStatus: "published", retroSnapshots: { equals: [] } },
        ],
      }),
      take: 6,
    }))
    expect(body).toEqual({ items: [expect.objectContaining({ id: "gen-2" })], total: 12 })
  })
})
