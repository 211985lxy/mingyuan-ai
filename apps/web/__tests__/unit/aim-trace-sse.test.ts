import { describe, expect, it, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

// ── Redis  mocks ──────────────────────────────────────────────────────────
// redis 单例客户端（@/lib/redis）：publish + multi 链 + lrange
const publishMock = vi.fn().mockResolvedValue(1)
const multiChain = {
  rpush: vi.fn().mockReturnThis(),
  ltrim: vi.fn().mockReturnThis(),
  expire: vi.fn().mockReturnThis(),
  exec: vi.fn().mockResolvedValue([]),
}
const multiMock = vi.fn(() => multiChain)
const lrangeMock = vi.fn().mockResolvedValue<string[]>([])

vi.mock("@/lib/redis", () => ({
  redis: {
    publish: publishMock,
    multi: multiMock,
    lrange: lrangeMock,
  },
}))

// ioredis 构造器（SSE 路由内 new Redis(...) 创建独立 subscriber）
const subscriberInstance = {
  subscribe: vi.fn().mockResolvedValue(1),
  on: vi.fn(),
  unsubscribe: vi.fn().mockResolvedValue(1),
  disconnect: vi.fn(),
}
vi.mock("ioredis", () => ({
  default: vi.fn(function () {
    return subscriberInstance
  }),
}))

// ── Prisma / auth mocks ───────────────────────────────────────────────────
const traceFindUniqueMock = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: {
    aimExecutionTrace: {
      findUnique: traceFindUniqueMock,
      create: vi.fn().mockResolvedValue({ id: "trace-1" }),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}))

const authenticateRequestMock = vi.fn()
vi.mock("@/lib/user-auth", () => ({
  authenticateRequest: authenticateRequestMock,
}))

const { GET } = await import("@/app/api/aim/trace/[traceId]/route")
const {
  createAimTrace,
  addAimTraceStep,
  finishAimTrace,
  publishAimTraceDone,
} = await import("@/lib/aim-observability")

function buildRequest(traceId: string, withAuth = true) {
  return new NextRequest(`http://localhost/api/aim/trace/${traceId}`, {
    headers: withAuth ? { authorization: "Bearer test-token" } : {},
  })
}

function buildParams(traceId: string) {
  return { params: Promise.resolve({ traceId }) }
}

beforeEach(() => {
  publishMock.mockClear()
  multiMock.mockClear()
  multiChain.rpush.mockClear()
  multiChain.ltrim.mockClear()
  multiChain.expire.mockClear()
  multiChain.exec.mockClear()
  lrangeMock.mockReset()
  lrangeMock.mockResolvedValue([])
  traceFindUniqueMock.mockReset()
  authenticateRequestMock.mockReset()
  subscriberInstance.subscribe.mockClear()
  subscriberInstance.on.mockClear()
  subscriberInstance.unsubscribe.mockClear()
  subscriberInstance.disconnect.mockClear()
})

describe("aim-observability trace 事件缓冲", () => {
  it("追加步骤时同时写入 Redis list 缓冲（rpush + ltrim + expire）并发布 Pub/Sub", async () => {
    traceFindUniqueMock.mockResolvedValue({ steps: [] })
    const trace = await createAimTrace({ userId: "u1", action: "generate" })

    await addAimTraceStep(trace, { key: "parse_request", label: "请求解析", status: "success" })

    expect(publishMock).toHaveBeenCalledWith(
      "aim:trace:trace-1",
      expect.stringContaining('"type":"step"'),
    )
    expect(multiChain.rpush).toHaveBeenCalledWith(
      "aim:trace:events:trace-1",
      expect.stringContaining('"type":"step"'),
    )
    expect(multiChain.ltrim).toHaveBeenCalled()
    expect(multiChain.expire).toHaveBeenCalledWith("aim:trace:events:trace-1", 600)
  })

  it("finishAimTrace deferDoneEvent 时不发布 done，publishAimTraceDone 负责最终发布", async () => {
    traceFindUniqueMock.mockResolvedValue({ steps: [] })
    const trace = await createAimTrace({ userId: "u1", action: "generate" })
    publishMock.mockClear()

    await finishAimTrace(trace, {}, { deferDoneEvent: true })
    expect(publishMock).not.toHaveBeenCalled()

    publishAimTraceDone(trace, "success")
    expect(publishMock).toHaveBeenCalledWith(
      "aim:trace:trace-1",
      expect.stringContaining('"type":"done"'),
    )
  })

  it("finishAimTrace 默认仍立即发布 done（chat 等其他路径行为不变）", async () => {
    traceFindUniqueMock.mockResolvedValue({ steps: [] })
    const trace = await createAimTrace({ userId: "u1", action: "chat" })
    publishMock.mockClear()

    await finishAimTrace(trace, {})
    expect(publishMock).toHaveBeenCalledWith(
      "aim:trace:trace-1",
      expect.stringContaining('"type":"done"'),
    )
  })
})

describe("aim trace SSE 端点", () => {
  it("缺少 Authorization 头返回 401", async () => {
    const res = await GET(buildRequest("trace-1", false), buildParams("trace-1"))
    expect(res.status).toBe(401)
  })

  it("认证失败返回 401", async () => {
    authenticateRequestMock.mockRejectedValue(new Error("UNAUTHORIZED"))
    const res = await GET(buildRequest("trace-1"), buildParams("trace-1"))
    expect(res.status).toBe(401)
  })

  it("trace 不存在返回 404", async () => {
    authenticateRequestMock.mockResolvedValue({ id: "u1" })
    traceFindUniqueMock.mockResolvedValue(null)
    const res = await GET(buildRequest("trace-1"), buildParams("trace-1"))
    expect(res.status).toBe(404)
  })

  it("trace 属于他人返回 403", async () => {
    authenticateRequestMock.mockResolvedValue({ id: "u1" })
    traceFindUniqueMock.mockResolvedValue({ userId: "u2" })
    const res = await GET(buildRequest("trace-1"), buildParams("trace-1"))
    expect(res.status).toBe(403)
  })

  it("回放 Redis 缓冲事件（含 done）后关闭流，且不下发通配 CORS 头", async () => {
    authenticateRequestMock.mockResolvedValue({ id: "u1" })
    traceFindUniqueMock.mockResolvedValue({ userId: "u1" })
    lrangeMock.mockResolvedValue([
      JSON.stringify({ type: "step", step: { key: "parse_request", label: "请求解析", status: "success" } }),
      JSON.stringify({ type: "step", step: { key: "quality_gate", label: "生成后质检", status: "success" } }),
      JSON.stringify({ type: "done", status: "success" }),
    ])

    const res = await GET(buildRequest("trace-1"), buildParams("trace-1"))
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/event-stream")
    expect(res.headers.get("access-control-allow-origin")).toBeNull()

    const text = await res.text()
    const connectedIdx = text.indexOf('"type":"connected"')
    const stepIdx = text.indexOf('"type":"step"')
    const qualityIdx = text.indexOf("quality_gate")
    const doneIdx = text.indexOf('"type":"done"')
    expect(connectedIdx).toBeGreaterThanOrEqual(0)
    expect(stepIdx).toBeGreaterThan(connectedIdx)
    expect(qualityIdx).toBeGreaterThan(stepIdx)
    expect(doneIdx).toBeGreaterThan(qualityIdx)

    // done 后流被关闭，subscriber 被清理
    expect(subscriberInstance.unsubscribe).toHaveBeenCalled()
    expect(subscriberInstance.disconnect).toHaveBeenCalled()
  })
})
