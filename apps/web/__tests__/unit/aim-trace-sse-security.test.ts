import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const {
  authenticateRequest,
  findFirst,
  brokerSubscribe,
  brokerCanAccept,
  brokerGetMetrics,
} = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  findFirst: vi.fn(),
  brokerSubscribe: vi.fn(),
  brokerCanAccept: vi.fn(),
  brokerGetMetrics: vi.fn(() => ({
    active: 0,
    rejected: 0,
    timedOut: 0,
    redisErrors: 0,
  })),
}))

vi.mock("@/lib/user-auth", () => ({
  authenticateRequest,
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aimExecutionTrace: {
      findFirst,
    },
  },
}))

vi.mock("@/lib/aim-trace-stream-broker", () => ({
  AimTraceStreamBroker: {
    getInstance: () => ({
      subscribe: brokerSubscribe,
      canAccept: brokerCanAccept,
      getMetrics: brokerGetMetrics,
    }),
  },
}))

import { GET } from "@/app/api/aim/trace/[traceId]/route"

function makeRequest(traceId: string) {
  return new NextRequest(`http://localhost/api/aim/trace/${traceId}`, {
    method: "GET",
    headers: { cookie: "session=u" },
  })
}

describe("GET /api/aim/trace/[traceId] ownership and live subscribe gates", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authenticateRequest.mockResolvedValue({ id: "user-1", email: "a@b.c" })
    findFirst.mockResolvedValue(null)
    brokerCanAccept.mockResolvedValue({ ok: true })
    brokerSubscribe.mockResolvedValue({
      ok: true,
      unsubscribe: vi.fn(),
    })
  })

  it("returns 401 when unauthenticated", async () => {
    authenticateRequest.mockRejectedValue(new Error("UNAUTHORIZED"))
    const res = await GET(makeRequest("trace-1"), {
      params: Promise.resolve({ traceId: "trace-1" }),
    })
    expect(res.status).toBe(401)
    expect(findFirst).not.toHaveBeenCalled()
  })

  it("returns 404 for unknown traces and for non-owners (no existence leak)", async () => {
    findFirst.mockResolvedValue(null)
    const missing = await GET(makeRequest("missing"), {
      params: Promise.resolve({ traceId: "missing" }),
    })
    expect(missing.status).toBe(404)
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "missing", userId: "user-1" },
      select: expect.any(Object),
    })
    expect(brokerSubscribe).not.toHaveBeenCalled()
    expect(brokerCanAccept).not.toHaveBeenCalled()
  })

  it("does not open a live Redis subscription before ownership succeeds", async () => {
    findFirst.mockResolvedValue(null)
    await GET(makeRequest("trace-x"), {
      params: Promise.resolve({ traceId: "trace-x" }),
    })
    expect(brokerSubscribe).not.toHaveBeenCalled()
  })

  it("returns 503 when live subscribe is required but Redis is unavailable", async () => {
    findFirst.mockResolvedValue({
      id: "trace-1",
      userId: "user-1",
      status: "running",
      steps: [{ key: "a" }],
    })
    brokerCanAccept.mockResolvedValue({
      ok: false,
      reason: "redis_unavailable",
      status: 503,
    })

    const res = await GET(makeRequest("trace-1"), {
      params: Promise.resolve({ traceId: "trace-1" }),
    })
    expect(res.status).toBe(503)
    expect(brokerSubscribe).not.toHaveBeenCalled()
  })

  it("returns 429 when broker rejects for concurrency or rate limits", async () => {
    findFirst.mockResolvedValue({
      id: "trace-1",
      userId: "user-1",
      status: "running",
      steps: [],
    })
    brokerCanAccept.mockResolvedValue({
      ok: false,
      reason: "rate_limited",
      status: 429,
    })

    const res = await GET(makeRequest("trace-1"), {
      params: Promise.resolve({ traceId: "trace-1" }),
    })
    expect(res.status).toBe(429)
  })

  it("replays terminal traces without opening a live subscription", async () => {
    findFirst.mockResolvedValue({
      id: "trace-1",
      userId: "user-1",
      status: "success",
      steps: [{ key: "done-step" }],
    })

    const res = await GET(makeRequest("trace-1"), {
      params: Promise.resolve({ traceId: "trace-1" }),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toContain("text/event-stream")
    expect(brokerSubscribe).not.toHaveBeenCalled()
    expect(brokerCanAccept).not.toHaveBeenCalled()

    const reader = res.body!.getReader()
    const chunks: string[] = []
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(new TextDecoder().decode(value))
    }
    const body = chunks.join("")
    expect(body).toContain('"type":"replay"')
    expect(body).toContain('"type":"done"')
  })
})
