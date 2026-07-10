import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const { findFirst, create, authenticateRequest, authErrorResponse } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
  authenticateRequest: vi.fn(async () => ({ id: "user-1" })),
  authErrorResponse: vi.fn(() => null),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aimExecutionTrace: { findFirst },
    aimRunEvent: { create },
  },
}))

vi.mock("@/lib/user-auth", () => ({ authenticateRequest, authErrorResponse }))

import { POST } from "@/app/api/aim/runs/[runId]/events/route"

function request(body: unknown) {
  return new NextRequest("http://localhost/api/aim/runs/run_123/events", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

const context = { params: Promise.resolve({ runId: "run_123" }) }

describe("aim run events route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findFirst.mockResolvedValue({ id: "trace-1" })
    create.mockResolvedValue({ id: "event-1" })
  })

  it("records an event only for a run owned by the authenticated user", async () => {
    const response = await POST(request({ event: "copied", metadata: { format: "video_script" } }), context)

    expect(response.status).toBe(201)
    expect(findFirst).toHaveBeenCalledWith({
      where: { runId: "run_123", userId: "user-1" },
      select: { id: true },
    })
    expect(create).toHaveBeenCalledWith({
      data: {
        runId: "run_123",
        userId: "user-1",
        event: "copied",
        metadata: { format: "video_script" },
      },
    })
  })

  it("rejects unsupported events", async () => {
    const response = await POST(request({ event: "opened" }), context)

    expect(response.status).toBe(400)
    expect(create).not.toHaveBeenCalled()
  })

  it("does not expose another user's run", async () => {
    findFirst.mockResolvedValueOnce(null)

    const response = await POST(request({ event: "accepted" }), context)

    expect(response.status).toBe(404)
    expect(create).not.toHaveBeenCalled()
  })
})
