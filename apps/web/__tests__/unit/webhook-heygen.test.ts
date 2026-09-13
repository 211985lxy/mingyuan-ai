import { beforeEach, describe, expect, it, vi } from "vitest"
import { createHmac } from "node:crypto"
import { NextRequest } from "next/server"

const envState = vi.hoisted(() => ({ values: { HEYGEN_WEBHOOK_SECRET: "whsec_test_secret" } as Record<string, string | undefined> }))

vi.mock("@/env", () => ({
  env: new Proxy({}, {
    get: (_t, prop: string) => envState.values[prop],
  }),
}))

const m = vi.hoisted(() => ({
  getVideoTaskStatusForProvider: vi.fn(),
  releaseProviderSlot: vi.fn(),
  settleVideoTaskSuccess: vi.fn(),
  settleVideoTaskFailure: vi.fn(),
  redisSet: vi.fn(),
  prismaVideoTaskFindFirst: vi.fn(),
  prismaAvatarFindFirst: vi.fn(),
}))

vi.mock("@/lib/user-auth", () => ({
  authenticateRequest: vi.fn(),
  authErrorResponse: vi.fn(() => null),
}))
vi.mock("@/lib/api-contract", () => ({
  parseJsonRecord: vi.fn(),
  apiRequestErrorResponse: vi.fn(() => null),
}))
vi.mock("@/lib/digital-human-provider", () => ({
  getVideoTaskStatusForProvider: m.getVideoTaskStatusForProvider,
  normalizeDigitalHumanProvider: (v: unknown) => (v === "heygen" ? "heygen" : v === "shanjian" ? "shanjian" : "chanjing"),
}))
vi.mock("@/lib/digital-human-semaphore", () => ({
  releaseProviderSlot: m.releaseProviderSlot,
}))
vi.mock("@/lib/video-task-settlement", () => ({
  settleVideoTaskSuccess: m.settleVideoTaskSuccess,
  settleVideoTaskFailure: m.settleVideoTaskFailure,
}))
vi.mock("@/lib/avatar-demo", () => ({ triggerAvatarDemoVideo: vi.fn() }))
vi.mock("@/lib/redis", () => ({
  redis: { set: m.redisSet, keys: vi.fn(async () => []), del: vi.fn(), disconnect: vi.fn() },
}))
vi.mock("@/lib/metrics", () => ({
  digitalHumanEventsTotal: { inc: vi.fn() },
  webhookTotal: { inc: vi.fn() },
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    videoTask: { findFirst: (...a: unknown[]) => m.prismaVideoTaskFindFirst(...(a as [])) },
    avatar: {
      findFirst: (...a: unknown[]) => m.prismaAvatarFindFirst(...(a as [])),
      update: vi.fn(),
    },
  },
}))

import { POST } from "@/app/api/webhook/heygen/route"

const SECRET = "whsec_test_secret"
const KEY = "heygen-e2e-key"

function signedRequest(body: string, opts: { signature?: string | null; key?: string } = {}) {
  const headers = new Headers({ "Content-Type": "application/json", "x-api-key": opts.key ?? KEY })
  if (opts.signature !== null) {
    headers.set("signature", opts.signature ?? createHmac("sha256", SECRET).update(body, "utf8").digest("hex"))
  }
  return new NextRequest("http://localhost/api/webhook/heygen", { method: "POST", headers, body })
}

function successEvent(videoId: string) {
  return JSON.stringify({
    event_id: `evt-${videoId}`,
    event_type: "avatar_video.success",
    event_data: { video_id: videoId, url: "https://files.heygen.ai/pushed.mp4" },
  })
}

function failEvent(videoId: string, code: string, message: string) {
  return JSON.stringify({
    event_id: `evt-${videoId}`,
    event_type: "avatar_video.fail",
    event_data: { video_id: videoId, error: { code, message } },
  })
}

function dbTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    userId: "user-1",
    provider: "heygen",
    status: "processing",
    externalTaskId: "vid-1",
    ...overrides,
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  envState.values.HEYGEN_WEBHOOK_SECRET = SECRET
  m.prismaVideoTaskFindFirst.mockResolvedValue(null)
  m.prismaAvatarFindFirst.mockResolvedValue(null)
  m.redisSet.mockResolvedValue("OK")
  m.settleVideoTaskSuccess.mockResolvedValue(undefined)
  m.settleVideoTaskFailure.mockResolvedValue(undefined)
})

describe("HeyGen webhook 路由", () => {
  it("无 secret 配置时一律 401（fail-closed）", async () => {
    envState.values.HEYGEN_WEBHOOK_SECRET = undefined
    const body = successEvent("vid-1")
    const res = await POST(signedRequest(body))
    expect(res.status).toBe(401)
  })

  it("签名不符或缺失时 401，且不触碰任何结算", async () => {
    const body = successEvent("vid-1")
    const bad = await POST(signedRequest(body, { signature: "deadbeef" }))
    const missing = await POST(signedRequest(body, { signature: null }))
    expect(bad.status).toBe(401)
    expect(missing.status).toBe(401)
    expect(m.getVideoTaskStatusForProvider).not.toHaveBeenCalled()
    expect(m.settleVideoTaskSuccess).not.toHaveBeenCalled()
  })

  it("非 JSON 体返回 400", async () => {
    const res = await POST(signedRequest("not-json{", {}))
    expect(res.status).toBe(400)
  })

  it("非出片事件确认收到但不结算", async () => {
    const body = JSON.stringify({ event_id: "evt-x", event_type: "video_agent.success", event_data: {} })
    const res = await POST(signedRequest(body))
    expect(res.status).toBe(200)
    expect(m.getVideoTaskStatusForProvider).not.toHaveBeenCalled()
  })

  it("重复投递（event_id 已见）跳过，不重复结算", async () => {
    m.redisSet.mockResolvedValue(null) // NX 失败 = 已存在
    const res = await POST(signedRequest(successEvent("vid-1")))
    expect(res.status).toBe(200)
    expect(m.getVideoTaskStatusForProvider).not.toHaveBeenCalled()
  })

  it("孤儿事件（video_id 无对应任务）返回 404", async () => {
    // beforeEach 默认 prisma 两个 findFirst 都返回 null
    const res = await POST(signedRequest(successEvent("vid-unknown")))
    expect(res.status).toBe(404)
    expect(m.getVideoTaskStatusForProvider).not.toHaveBeenCalled()
  })

  it("成功事件：主动查询复核后按查询结果结算，不信任推送体", async () => {
    m.prismaVideoTaskFindFirst.mockResolvedValue(dbTask())
    m.getVideoTaskStatusForProvider.mockResolvedValue({
      status: "succeed",
      result: { videoUrl: "https://files.heygen.ai/queried.mp4", duration: 8.2 },
    })

    // 推送体里的 url 是诱饵：结算必须用查询复核返回的 url
    const res = await POST(signedRequest(successEvent("vid-1")))
    expect(res.status).toBe(200)
    expect(m.getVideoTaskStatusForProvider).toHaveBeenCalledWith("heygen", "vid-1")
    expect(m.settleVideoTaskSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "task-1",
        result: expect.objectContaining({ videoUrl: "https://files.heygen.ai/queried.mp4" }),
        source: "webhook",
      }),
    )
    expect(m.releaseProviderSlot).toHaveBeenCalledWith("heygen")
  })

  it("失败事件：按查询结果结算失败并带归因码", async () => {
    m.prismaVideoTaskFindFirst.mockResolvedValue(dbTask())
    m.getVideoTaskStatusForProvider.mockResolvedValue({
      status: "failed",
      errorCode: "avatar_error",
      errorMessage: "形象加载失败",
    })

    const res = await POST(signedRequest(failEvent("vid-1", "avatar_error", "形象加载失败")))
    expect(res.status).toBe(200)
    expect(m.settleVideoTaskFailure).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: "task-1", errorCode: "avatar_error", source: "webhook" }),
    )
    expect(m.releaseProviderSlot).toHaveBeenCalledWith("heygen")
  })

  it("供应商不一致的任务拒绝由本端点结算", async () => {
    m.prismaVideoTaskFindFirst.mockResolvedValue(dbTask({ provider: "chanjing" }))
    const res = await POST(signedRequest(successEvent("vid-1")))
    expect(res.status).toBe(200)
    expect(m.settleVideoTaskSuccess).not.toHaveBeenCalled()
  })

  it("签名算法与官方口径一致：HMAC-SHA256(rawBody, secret) hex", async () => {
    const body = successEvent("vid-9")
    const expected = createHmac("sha256", SECRET).update(body, "utf8").digest("hex")
    // 大写 hex 与首尾空白均应被容忍（大小写不敏感、trim）
    const res = await POST(signedRequest(body, { signature: ` ${expected.toUpperCase()} ` }))
    expect(res.status).not.toBe(401)
  })
})
