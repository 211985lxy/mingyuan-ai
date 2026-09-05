import { beforeEach, describe, expect, it, vi } from "vitest"

const prismaMocks = vi.hoisted(() => ({
  challengeCreate: vi.fn(),
  challengeFindUnique: vi.fn(),
  identityFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
}))

const exchangeCode = vi.hoisted(() => vi.fn())
const buildLoginUrl = vi.hoisted(() => vi.fn(() =>
  "https://open.douyin.com/platform/oauth/connect?scope=user_info",
))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    douyinLoginChallenge: {
      create: prismaMocks.challengeCreate,
      findUnique: prismaMocks.challengeFindUnique,
    },
    douyinLoginIdentity: {
      findUnique: prismaMocks.identityFindUnique,
    },
    user: {
      findUnique: prismaMocks.userFindUnique,
    },
  },
}))

vi.mock("@/lib/douyin-openapi", () => ({
  buildDouyinLoginAuthorizationUrl: buildLoginUrl,
  exchangeDouyinCodeForToken: exchangeCode,
}))

import { createDouyinLoginChallenge } from "@/features/auth/douyin-login"
import { GET as startDouyinLogin } from "@/app/api/auth/douyin/start/route"
import { GET as douyinCallback } from "@/app/api/auth/douyin/callback/route"
import { NextRequest } from "next/server"

const USER = {
  id: "u1",
  email: "13800138000@phone.local",
  name: "用户0000",
  plan: "free",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  expiresAt: new Date(Date.now() + 86400_000),
}

const TOKEN = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  openId: "open-1",
  unionId: null,
  expiresIn: 900,
  scope: "user_info",
}

function callbackRequest(params: { code: string; state: string }) {
  const request = new NextRequest(
    `http://localhost/api/auth/douyin/callback?code=${params.code}&state=${params.state}`,
  )
  request.cookies.set("douyin_login_state", params.state)
  return request
}

describe("Douyin login challenge", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMocks.challengeCreate.mockResolvedValue({ id: "challenge-1" })
    prismaMocks.identityFindUnique.mockResolvedValue(null)
    prismaMocks.userFindUnique.mockResolvedValue(USER)
    exchangeCode.mockResolvedValue(TOKEN)
  })

  it("stores only a hashed state for a short-lived login challenge", async () => {
    prismaMocks.challengeCreate.mockResolvedValue({ id: "challenge-1" })

    const result = await createDouyinLoginChallenge({
      state: "raw-state",
      openId: "open-1",
      scope: "user_info",
    })

    expect(result).toBe("challenge-1")
    expect(prismaMocks.challengeCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        stateHash: expect.not.stringContaining("raw-state"),
        openId: "open-1",
        scope: "user_info",
        expiresAt: expect.any(Date),
      }),
    })
  })

  it("starts Douyin login with user_info and a state cookie", async () => {
    const response = await startDouyinLogin(
      new NextRequest("http://localhost/api/auth/douyin/start"),
    )

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toContain("scope=user_info")
    expect(response.headers.get("set-cookie")).toContain("douyin_login_state=")
  })

  it("logs in an existing Douyin identity without asking for a phone", async () => {
    prismaMocks.identityFindUnique.mockResolvedValue({ userId: "u1", openId: "open-1" })

    const response = await douyinCallback(
      callbackRequest({ code: "code-1", state: "state-1" }),
    )

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toContain("/lite")
    expect(response.headers.get("set-cookie")).toContain("mingyuan_user_session=")
  })

  it("routes an unknown Douyin identity to phone binding", async () => {
    prismaMocks.identityFindUnique.mockResolvedValue(null)

    const response = await douyinCallback(
      callbackRequest({ code: "code-1", state: "state-1" }),
    )

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toContain("/login?douyin=bind")
    expect(response.headers.get("set-cookie")).toContain("douyin_login_challenge=")
  })
})
