/**
 * /api/aim/process-video — 鉴权契约测试（安全修复 H1）。
 *
 * 验证要点：
 *   1. 无 CRON_SECRET 且无登录 → 401（未授权拒绝，processVideo 不被调用）。
 *   2. CRON_SECRET 正确（内部通道）→ 放行，userId 取自请求体（飞书事件携带的归属用户）。
 *   3. 登录态（用户通道）→ 放行，userId 强制取自 JWT；请求体里的 userId 被忽略，
 *      杜绝越权把处理结果/费用写入他人账户。
 *
 * 与 __tests__/unit/aim-admin-runs-route.test.ts 同一 mock 风格：handler 透传 ctx。
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

// vi.mock 工厂会被提升到文件顶部，因此用 vi.hoisted 声明共享 spy / 状态，
// 确保工厂体引用时它们已初始化。
const { processVideo, authMode, validateCronSecret } = vi.hoisted(() => ({
  processVideo: vi.fn(async (input: { userId?: string }) => ({
    success: true,
    recordId: "rec_1",
    durationMs: 10,
    extraction: { title: "t" },
    aiSummary: { title: "t", summary: "s", keyPoints: [] },
  })),
  authMode: { current: "deny" as "deny" | "cron" | "user" },
  validateCronSecret: vi.fn(() => authMode.current === "cron"),
}))

vi.mock("@/lib/content-pipeline", () => ({ processVideo }))
vi.mock("@/lib/video-text-extractor", () => ({
  assertSupportedVideoUrl: (url: string) => url,
  detectVideoPlatform: () => "douyin",
  formatVideoTextExtractionError: (e: unknown) => String(e),
}))

// 鉴权门面。
vi.mock("@/lib/admin-auth", () => ({ validateCronSecret }))
vi.mock("@/lib/user-auth", () => ({
  withUserAuth: (handler: (req: unknown, ctx: { user: { id: string } }) => unknown) =>
    async (req: unknown) => {
      if (authMode.current === "deny") {
        const { NextResponse } = await import("next/server")
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
      // 用户通道：JWT 身份是 user_real_from_jwt
      return handler(req, { user: { id: "user_real_from_jwt" } })
    },
}))

// env 依赖：CONTENT_PIPELINE_USER_ID（内部通道回落）。
vi.mock("@/env", () => ({
  env: {
    NODE_ENV: "production",
    CONTENT_PIPELINE_USER_ID: "pipeline_internal",
  },
}))

import { POST } from "@/app/api/aim/process-video/route"

function postRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/aim/process-video", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  })
}

const baseBody = { url: "https://www.douyin.com/video/123" }

describe("POST /api/aim/process-video 鉴权（H1 安全修复）", () => {
  beforeEach(() => {
    authMode.current = "deny"
    processVideo.mockClear()
    validateCronSecret.mockClear()
  })

  it("无 CRON_SECRET 且未登录 → 401，流水线不执行", async () => {
    const res = await POST(postRequest(baseBody))
    expect(res.status).toBe(401)
    expect(processVideo).not.toHaveBeenCalled()
  })

  it("CRON_SECRET 正确（内部通道）→ 放行，userId 取自请求体", async () => {
    authMode.current = "cron"
    const res = await POST(
      postRequest({ ...baseBody, userId: "feishu_event_owner" }, { authorization: "Bearer test-cron-secret" }),
    )
    expect(res.status).toBe(200)
    expect(processVideo).toHaveBeenCalledTimes(1)
    expect(processVideo.mock.calls[0][0].userId).toBe("feishu_event_owner")
  })

  it("CRON_SECRET 正确但请求体无 userId → 回落 CONTENT_PIPELINE_USER_ID", async () => {
    authMode.current = "cron"
    const res = await POST(
      postRequest(baseBody, { authorization: "Bearer test-cron-secret" }),
    )
    expect(res.status).toBe(200)
    expect(processVideo.mock.calls[0][0].userId).toBe("pipeline_internal")
  })

  it("登录态（用户通道）→ userId 强制取自 JWT，请求体 userId 被忽略（防越权）", async () => {
    authMode.current = "user"
    // 攻击者在请求体伪造他人 userId
    const res = await POST(postRequest({ ...baseBody, userId: "victim_other_user" }))

    expect(res.status).toBe(200)
    expect(processVideo).toHaveBeenCalledTimes(1)
    // 关键断言：传入 processVideo 的必须是 JWT 身份，而非请求体里的伪造值
    expect(processVideo.mock.calls[0][0].userId).toBe("user_real_from_jwt")
    expect(processVideo.mock.calls[0][0].userId).not.toBe("victim_other_user")
  })
})
