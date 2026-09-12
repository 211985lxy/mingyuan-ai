import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const authenticateRequest = vi.hoisted(() => vi.fn())
const resolveBoundProject = vi.hoisted(() => vi.fn())
const buildDouyinAuthorizationUrl = vi.hoisted(() => vi.fn())

vi.mock("@/lib/user-auth", () => ({
  authenticateRequest,
  authErrorResponse: () => null,
}))

vi.mock("@/lib/account-project-context", () => ({ resolveBoundProject }))

vi.mock("@/lib/douyin-openapi", () => ({
  buildDouyinAuthorizationUrl,
  exchangeDouyinCodeForToken: vi.fn(),
  fetchDouyinUserProfile: vi.fn(),
  fetchDouyinRecentVideos: vi.fn(),
  fetchDouyinFansProfile: vi.fn(),
  syncDouyinDataToLarkBase: vi.fn(),
}))

vi.mock("@/env", () => ({ env: {} }))

vi.mock("@/features/integrations/douyin-binding", () => ({
  claimDouyinLoginIdentity: vi.fn(),
  upsertDouyinBinding: vi.fn(),
}))

import {
  DEFAULT_DOUYIN_RETURN_PATH,
  DOUYIN_RETURN_COOKIE,
  readDouyinReturnPath,
  sanitizeLocalPath,
} from "@/lib/douyin-oauth-return"
import { GET as startDouyinAuth } from "@/app/api/integrations/douyin/auth/route"
import { GET as douyinCallback } from "@/app/api/integrations/douyin/callback/route"

type RouteResponse = Awaited<ReturnType<typeof startDouyinAuth>>

/**
 * 两个路由在鉴权失败分支会 `return authErrorResponse(err)`，其类型含 null。
 * 测试里显式断言非空，避免各处重复 null 判断。
 */
function expectResponse(res: RouteResponse): NonNullable<RouteResponse> {
  if (!res) throw new Error("路由未返回响应")
  return res
}

function req(url: string, cookies: Record<string, string> = {}) {
  const cookie = Object.entries(cookies)
    .map(([key, value]) => `${key}=${value}`)
    .join("; ")
  return new NextRequest(new URL(url), {
    method: "GET",
    headers: cookie ? { cookie } : {},
  })
}

async function callAuth(url: string, cookies: Record<string, string> = {}) {
  return expectResponse(await startDouyinAuth(req(url, cookies)))
}

async function callCallback(url: string, cookies: Record<string, string> = {}) {
  return expectResponse(await douyinCallback(req(url, cookies)))
}

function setCookieHeader(res: Response): string {
  return (res.headers.getSetCookie?.() ?? []).join(",")
}

beforeEach(() => {
  vi.clearAllMocks()
  authenticateRequest.mockResolvedValue({ id: "u1", email: "t@t.com" })
  // 回调会读取归属项目 id 用于飞书行级隔离
  resolveBoundProject.mockResolvedValue({ id: "proj-1", name: "测试项目", status: "active" })
  buildDouyinAuthorizationUrl.mockReturnValue("https://open.douyin.com/platform/oauth/connect")
})

describe("sanitizeLocalPath", () => {
  it("accepts same-origin relative paths", () => {
    expect(sanitizeLocalPath("/account")).toBe("/account")
    expect(sanitizeLocalPath("/data-platform?a=1")).toBe("/data-platform?a=1")
    expect(sanitizeLocalPath("  /account  ")).toBe("/account")
  })

  it("rejects protocol-relative and absolute URLs", () => {
    expect(sanitizeLocalPath("//evil.com")).toBeNull()
    expect(sanitizeLocalPath("https://evil.com")).toBeNull()
    expect(sanitizeLocalPath("http://evil.com/x")).toBeNull()
    expect(sanitizeLocalPath("account")).toBeNull()
  })

  it("rejects backslashes, control characters and empty input", () => {
    expect(sanitizeLocalPath("/a\\b")).toBeNull()
    expect(sanitizeLocalPath("/a\nb")).toBeNull()
    expect(sanitizeLocalPath("/a\rb")).toBeNull()
    expect(sanitizeLocalPath("")).toBeNull()
    expect(sanitizeLocalPath("   ")).toBeNull()
    expect(sanitizeLocalPath(null)).toBeNull()
    expect(sanitizeLocalPath(undefined)).toBeNull()
  })
})

describe("readDouyinReturnPath", () => {
  it("returns the cookie value when it is a safe local path", () => {
    const request = req("http://localhost/api/integrations/douyin/callback", {
      [DOUYIN_RETURN_COOKIE]: "/data-platform",
    })
    expect(readDouyinReturnPath(request)).toBe("/data-platform")
  })

  it("decodes the URL-encoded value the browser sends back", () => {
    const request = req("http://localhost/api/integrations/douyin/callback", {
      [DOUYIN_RETURN_COOKIE]: encodeURIComponent("/data-platform"),
    })
    expect(readDouyinReturnPath(request)).toBe("/data-platform")
  })

  it("falls back to the default page when missing or unsafe", () => {
    expect(readDouyinReturnPath(req("http://localhost/x"))).toBe(DEFAULT_DOUYIN_RETURN_PATH)
    const unsafe = req("http://localhost/x", { [DOUYIN_RETURN_COOKIE]: "//evil.com" })
    expect(readDouyinReturnPath(unsafe)).toBe(DEFAULT_DOUYIN_RETURN_PATH)
  })
})

describe("GET /api/integrations/douyin/auth", () => {
  it("stores the requested return path for the callback", async () => {
    const res = await callAuth("http://localhost/api/integrations/douyin/auth?return=/data-platform")

    expect(res.status).toBe(302)
    expect(res.headers.get("location")).toBe("https://open.douyin.com/platform/oauth/connect")
    expect(setCookieHeader(res)).toContain(
      `${DOUYIN_RETURN_COOKIE}=${encodeURIComponent("/data-platform")}`,
    )
  })

  it("falls back to the default page for an unsafe return path", async () => {
    const res = await callAuth("http://localhost/api/integrations/douyin/auth?return=//evil.com")

    expect(setCookieHeader(res)).toContain(
      `${DOUYIN_RETURN_COOKIE}=${encodeURIComponent(DEFAULT_DOUYIN_RETURN_PATH)}`,
    )
  })

  it("sends the error redirect back to the initiating page", async () => {
    buildDouyinAuthorizationUrl.mockImplementation(() => {
      throw new Error("授权发起失败")
    })

    const res = await callAuth("http://localhost/api/integrations/douyin/auth?return=/data-platform")

    const location = res.headers.get("location") ?? ""
    expect(res.status).toBe(302)
    expect(location).toContain("/data-platform")
    expect(location).toContain("douyin_error=")
  })
})

describe("GET /api/integrations/douyin/callback", () => {
  it("redirects to the page that started the binding", async () => {
    const res = await callCallback("http://localhost/api/integrations/douyin/callback?error=access_denied", {
      [DOUYIN_RETURN_COOKIE]: "/data-platform",
      douyin_oauth_state: "s1",
    })

    const location = res.headers.get("location") ?? ""
    expect(res.status).toBe(302)
    expect(location).toContain("/data-platform")
    expect(location).toContain("douyin_error=")
  })

  it("falls back to the default page without a return cookie", async () => {
    const res = await callCallback("http://localhost/api/integrations/douyin/callback?error=access_denied")

    expect(res.headers.get("location")).toContain(DEFAULT_DOUYIN_RETURN_PATH)
  })

  it("ignores an unsafe return cookie", async () => {
    const res = await callCallback("http://localhost/api/integrations/douyin/callback?error=access_denied", {
      [DOUYIN_RETURN_COOKIE]: "//evil.com",
    })

    const location = res.headers.get("location") ?? ""
    expect(location).toContain(DEFAULT_DOUYIN_RETURN_PATH)
    expect(location).not.toContain("evil.com")
  })

  it("clears the return cookie on a CSRF state mismatch", async () => {
    const res = await callCallback("http://localhost/api/integrations/douyin/callback?code=c1&state=wrong", {
      [DOUYIN_RETURN_COOKIE]: "/data-platform",
      douyin_oauth_state: "s1",
    })

    expect(res.status).toBe(302)
    expect(setCookieHeader(res)).toContain(`${DOUYIN_RETURN_COOKIE}=;`)
  })
})
