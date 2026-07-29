import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const { findFirst, create, authenticateRequest, authErrorResponse, writeFinalRunOutcome } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
  authenticateRequest: vi.fn(async () => ({ id: "user-1" })),
  authErrorResponse: vi.fn(() => null),
  writeFinalRunOutcome: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aimExecutionTrace: { findFirst },
    aimRunEvent: { create },
  },
}))

vi.mock("@/lib/user-auth", () => ({ authenticateRequest, authErrorResponse }))
vi.mock("@/lib/aim/run-outcome-write-service", () => ({ writeFinalRunOutcome }))

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
      select: { id: true, durationMs: true, totalTokens: true, costCny: true },
    })
    expect(create).toHaveBeenCalledWith({
      data: {
        runId: "run_123",
        userId: "user-1",
        event: "copied",
        requestId: null,
        metadata: {
          format: "video_script",
          runId: "run_123",
          durationMs: undefined,
          totalTokens: undefined,
          costCny: null,
        },
      },
      select: { id: true },
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

  it("forces web channel and delegates structured terminal writes", async () => {
    writeFinalRunOutcome.mockResolvedValueOnce({ ok: true, id: "outcome-1", deduped: false })
    const response = await POST(request({
      event: "final_disposition",
      metadata: {
        workflowId: "content-growth-v1",
        taskType: "write_script",
        finalDisposition: "accepted_first_pass",
        humanActiveMinutes: 4,
        channel: "api",
        requestId: "req-web-1",
      },
    }), context)

    expect(response.status).toBe(201)
    expect(writeFinalRunOutcome).toHaveBeenCalledWith(expect.objectContaining({
      channel: "web",
      userId: "user-1",
      outcome: expect.objectContaining({ channel: "web", requestId: "req-web-1" }),
    }))
  })
})
