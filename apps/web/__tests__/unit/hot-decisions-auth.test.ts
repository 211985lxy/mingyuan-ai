/**
 * /api/hot-decisions & /api/hot-decisions/refresh — 鉴权契约测试（安全修复 H3a）。
 *
 * 验证要点：
 *   1. GET 公开（营销页/未登录可用），返回缓存数据。
 *   2. POST（刷新，有成本/副作用）未登录 → 401，refreshHotDecisions 不执行。
 *   3. POST 登录态 → 放行并执行刷新。
 *
 * 同一 mock 风格：withUserAuth 透传，prisma 不涉及（业务函数被 mock）。
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

// vi.mock 工厂会被提升到文件顶部，用 vi.hoisted 声明共享 spy / 状态 / 样本。
const { getHotDecisions, refreshHotDecisions, authenticated, SAMPLE } = vi.hoisted(() => ({
  SAMPLE: { items: [], fetchedAt: "2026-08-03T00:00:00Z" },
  getHotDecisions: vi.fn(async () => SAMPLE),
  refreshHotDecisions: vi.fn(async () => SAMPLE),
  authenticated: { current: false },
}))

vi.mock("@/lib/hot-decisions", () => ({ getHotDecisions, refreshHotDecisions }))

// 鉴权门面：未登录 → 401；登录 → 注入 user 调用 handler。
vi.mock("@/lib/user-auth", () => ({
  withUserAuth: (handler: (req: unknown, ctx: { user: { id: string } }) => unknown) =>
    async (req: unknown) => {
      if (!authenticated.current) {
        const { NextResponse } = await import("next/server")
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
      return handler(req, { user: { id: "u1" } })
    },
}))

import { GET, POST } from "@/app/api/hot-decisions/route"
import { POST as POST_REFRESH } from "@/app/api/hot-decisions/refresh/route"

function req(method: string, path: string) {
  return new NextRequest(`http://localhost${path}`, { method })
}

// withUserAuth 真实签名要求 (request, segmentData) 两参；segmentData 含 params Promise。
// 这里 segment() 提供一个空的，与 aim-admin-runs-route.test.ts 同一惯例。
function segment(): { params: Promise<Record<string, string>> } {
  return { params: Promise.resolve({}) }
}

describe("/api/hot-decisions 鉴权（H3a 安全修复）", () => {
  beforeEach(() => {
    authenticated.current = false
    getHotDecisions.mockClear()
    refreshHotDecisions.mockClear()
  })

  it("GET 公开读取，未登录也放行（营销页契约）", async () => {
    const res = await GET(req("GET", "/api/hot-decisions?source=aihot"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(SAMPLE)
    expect(getHotDecisions).toHaveBeenCalled()
  })

  it("POST 未登录 → 401，不触发刷新", async () => {
    const res = await POST(req("POST", "/api/hot-decisions?source=aihot"), segment())
    expect(res.status).toBe(401)
    expect(refreshHotDecisions).not.toHaveBeenCalled()
  })

  it("POST 登录态 → 放行并刷新", async () => {
    authenticated.current = true
    const res = await POST(req("POST", "/api/hot-decisions?source=aihot"), segment())
    expect(res.status).toBe(200)
    expect(refreshHotDecisions).toHaveBeenCalledTimes(1)
  })
})

describe("/api/hot-decisions/refresh 鉴权（H3a 安全修复）", () => {
  beforeEach(() => {
    authenticated.current = false
    refreshHotDecisions.mockClear()
  })

  it("POST 未登录 → 401，不触发刷新", async () => {
    const res = await POST_REFRESH(req("POST", "/api/hot-decisions/refresh?source=aihot"), segment())
    expect(res.status).toBe(401)
    expect(refreshHotDecisions).not.toHaveBeenCalled()
  })

  it("POST 登录态 → 放行并刷新", async () => {
    authenticated.current = true
    const res = await POST_REFRESH(req("POST", "/api/hot-decisions/refresh?source=aihot"), segment())
    expect(res.status).toBe(200)
    expect(refreshHotDecisions).toHaveBeenCalledTimes(1)
  })
})
