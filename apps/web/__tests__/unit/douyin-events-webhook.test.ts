import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import { computeDouyinEventSignature, verifyDouyinEventSignature } from "@/lib/integrations/douyin-event-signature"

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    DOUYIN_CLIENT_SECRET: "test-client-secret" as string | undefined,
    DOUYIN_EVENT_WEBHOOK_ENABLED: "true" as string | undefined,
  },
}))

vi.mock("@/env", () => ({ env: mockEnv }))

// 在 mock 之后导入路由，确保路由内读取的是 mockEnv。
import { POST } from "@/app/api/integrations/douyin/events/route"

const SECRET = "test-client-secret"

function buildRequest(rawBody: string, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/integrations/douyin/events", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: rawBody,
  })
}

function signed(rawBody: string, secret = SECRET) {
  return { "x-douyin-signature": computeDouyinEventSignature(secret, rawBody) }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockEnv.DOUYIN_CLIENT_SECRET = SECRET
  mockEnv.DOUYIN_EVENT_WEBHOOK_ENABLED = "true"
})

describe("verifyDouyinEventSignature（纯函数）", () => {
  it("对 sha1(client_secret + rawBody) 的正确签名通过", () => {
    const rawBody = JSON.stringify({ event: "verify_webhook", content: { challenge: 12345 } })
    const signature = computeDouyinEventSignature(SECRET, rawBody)
    expect(verifyDouyinEventSignature({ clientSecret: SECRET, rawBody, signature })).toBe(true)
  })

  it("拒绝错误密钥产生的签名", () => {
    const rawBody = '{"event":"verify_webhook"}'
    const signature = computeDouyinEventSignature("wrong-secret", rawBody)
    expect(verifyDouyinEventSignature({ clientSecret: SECRET, rawBody, signature })).toBe(false)
  })

  it("拒绝长度不一致的伪造签名（避免 timingSafeEqual 抛错）", () => {
    const rawBody = '{"event":"verify_webhook"}'
    expect(verifyDouyinEventSignature({ clientSecret: SECRET, rawBody, signature: "deadbeef" })).toBe(false)
  })
})

describe("POST /api/integrations/douyin/events（路由）", () => {
  it("verify_webhook 时原样回显 challenge（数字）", async () => {
    const rawBody = JSON.stringify({
      event: "verify_webhook",
      client_key: "",
      content: { challenge: 12345 },
    })
    const response = await POST(buildRequest(rawBody, signed(rawBody)))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ challenge: 12345 })
  })

  it("业务事件返回 200 且不抛错", async () => {
    // content 为 JSON 字符串（业务事件常见形态），路由不应因此报错。
    const rawBody = JSON.stringify({
      event: "new_video_digg",
      client_key: "awr8bfr64vxgk036",
      content: '{"action_type":1,"action_time":1686817996}',
      log_id: "20230615163316517143EDD4CEF10721B6",
    })
    const response = await POST(buildRequest(rawBody, signed(rawBody)))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  it("缺少 X-Douyin-Signature 返回 401", async () => {
    const rawBody = JSON.stringify({ event: "verify_webhook", content: { challenge: 1 } })
    const response = await POST(buildRequest(rawBody))
    expect(response.status).toBe(401)
  })

  it("签名错误返回 401", async () => {
    const rawBody = JSON.stringify({ event: "verify_webhook", content: { challenge: 1 } })
    const response = await POST(buildRequest(rawBody, { "x-douyin-signature": "bad" }))
    expect(response.status).toBe(401)
  })

  it("未配置 DOUYIN_CLIENT_SECRET 返回 503", async () => {
    mockEnv.DOUYIN_CLIENT_SECRET = undefined
    const rawBody = JSON.stringify({ event: "verify_webhook", content: { challenge: 1 } })
    const response = await POST(buildRequest(rawBody, signed(rawBody)))
    expect(response.status).toBe(503)
  })

  it("DOUYIN_EVENT_WEBHOOK_ENABLED=false 返回 503（即使签名正确）", async () => {
    mockEnv.DOUYIN_EVENT_WEBHOOK_ENABLED = "false"
    const rawBody = JSON.stringify({ event: "verify_webhook", content: { challenge: 1 } })
    const response = await POST(buildRequest(rawBody, signed(rawBody)))
    expect(response.status).toBe(503)
  })

  it("签名正确但 body 非法 JSON 返回 400", async () => {
    const rawBody = "not-json"
    const response = await POST(buildRequest(rawBody, signed(rawBody)))
    expect(response.status).toBe(400)
  })
})
