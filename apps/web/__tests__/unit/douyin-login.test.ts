import { beforeEach, describe, expect, it, vi } from "vitest"

const prismaMocks = vi.hoisted(() => ({
  challengeCreate: vi.fn(),
  challengeFindUnique: vi.fn(),
  challengeUpdate: vi.fn(),
  identityFindUnique: vi.fn(),
  identityCreate: vi.fn(),
  userFindUnique: vi.fn(),
  userCreate: vi.fn(),
  transaction: vi.fn(),
}))

const exchangeCode = vi.hoisted(() => vi.fn())
const buildLoginUrl = vi.hoisted(() => vi.fn(() =>
  "https://open.douyin.com/platform/oauth/connect?scope=user_info",
))
const consumeLoginCode = vi.hoisted(() => vi.fn())
const allowAuthAttempt = vi.hoisted(() => vi.fn())

vi.mock("@/lib/prisma", () => ({
  prisma: {
    douyinLoginChallenge: {
      create: prismaMocks.challengeCreate,
      findUnique: prismaMocks.challengeFindUnique,
      update: prismaMocks.challengeUpdate,
    },
    douyinLoginIdentity: {
      findUnique: prismaMocks.identityFindUnique,
      create: prismaMocks.identityCreate,
    },
    user: {
      findUnique: prismaMocks.userFindUnique,
      create: prismaMocks.userCreate,
    },
    $transaction: prismaMocks.transaction,
  },
}))

vi.mock("@/lib/douyin-openapi", () => ({
  buildDouyinLoginAuthorizationUrl: buildLoginUrl,
  exchangeDouyinCodeForToken: exchangeCode,
}))

vi.mock("@/features/auth/sms-verification", () => ({
  consumeLoginCode,
}))

vi.mock("@/features/auth/auth-rate-limit", () => ({
  allowAuthAttempt,
}))

import { createDouyinLoginChallenge } from "@/features/auth/douyin-login"
import { GET as startDouyinLogin } from "@/app/api/auth/douyin/start/route"
import { GET as douyinCallback } from "@/app/api/auth/douyin/callback/route"
import { POST as completeDouyinLogin } from "@/app/api/auth/douyin/complete/route"
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

function completeRequest(phone = "13800138000", code = "123456") {
  const request = new NextRequest("http://localhost/api/auth/douyin/complete", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost" },
    body: JSON.stringify({ phone, code }),
  })
  request.cookies.set("douyin_login_challenge", "challenge-1")
  return request
}

describe("Douyin login challenge", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMocks.challengeCreate.mockResolvedValue({ id: "challenge-1" })
    prismaMocks.identityFindUnique.mockResolvedValue(null)
    prismaMocks.userFindUnique.mockResolvedValue(USER)
    prismaMocks.userCreate.mockResolvedValue(USER)
    prismaMocks.identityCreate.mockResolvedValue({})
    prismaMocks.challengeFindUnique.mockResolvedValue({
      id: "challenge-1",
      openId: "open-1",
      unionId: null,
      scope: "user_info",
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    })
    prismaMocks.challengeUpdate.mockResolvedValue({})
    prismaMocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({
        douyinLoginIdentity: {
          findUnique: prismaMocks.identityFindUnique,
          create: prismaMocks.identityCreate,
        },
        user: {
          findUnique: prismaMocks.userFindUnique,
          create: prismaMocks.userCreate,
        },
        douyinLoginChallenge: {
          update: prismaMocks.challengeUpdate,
        },
      }),
    )
    consumeLoginCode.mockResolvedValue({ ok: true })
    allowAuthAttempt.mockResolvedValue(true)
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

  it("returns Douyin login errors to the forwarded public origin", async () => {
    buildLoginUrl.mockImplementationOnce(() => {
      throw new Error("抖音扫码登录环境变量未配置")
    })

    const response = await startDouyinLogin(
      new NextRequest("http://127.0.0.1:3000/api/auth/douyin/start", {
        headers: {
          host: "mingyuan-ai.cn",
          "x-forwarded-host": "mingyuan-ai.cn",
          "x-forwarded-proto": "https",
        },
      }),
    )

    expect(response.headers.get("location")).toMatch(
      /^https:\/\/mingyuan-ai\.cn\/login\?douyin_error=/,
    )
  })

  it("returns invalid Douyin callbacks to the forwarded public origin", async () => {
    const response = await douyinCallback(
      new NextRequest("http://127.0.0.1:3000/api/auth/douyin/callback", {
        headers: {
          host: "mingyuan-ai.cn",
          "x-forwarded-host": "mingyuan-ai.cn",
          "x-forwarded-proto": "https",
        },
      }),
    )

    expect(response.headers.get("location")).toMatch(
      /^https:\/\/mingyuan-ai\.cn\/login\?douyin_error=/,
    )
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

  it("completes first-time login for an existing phone user", async () => {
    const response = await completeDouyinLogin(completeRequest())

    expect(response.status).toBe(200)
    expect(prismaMocks.userFindUnique).toHaveBeenCalledWith({
      where: { phone: "13800138000" },
    })
    expect(prismaMocks.identityCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "u1", openId: "open-1" }),
    })
    expect(response.headers.get("set-cookie")).toContain("mingyuan_user_session=")
  })

  it("creates a phone-primary user when the phone has no account", async () => {
    prismaMocks.userFindUnique.mockResolvedValue(null)
    prismaMocks.userCreate.mockResolvedValue({
      ...USER,
      id: "u2",
      email: "13800138000@phone.local",
    })

    const response = await completeDouyinLogin(completeRequest())

    expect(response.status).toBe(200)
    expect(prismaMocks.userCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        phone: "13800138000",
        email: "13800138000@phone.local",
      }),
    })
  })

  it("rejects completion when the openid is already owned by another phone account", async () => {
    prismaMocks.identityFindUnique.mockResolvedValue({ userId: "other-user", openId: "open-1" })

    const response = await completeDouyinLogin(completeRequest())

    expect(response.status).toBe(409)
    expect((await response.json()).code).toBe("DOUYIN_ALREADY_BOUND")
    expect(response.headers.get("set-cookie") ?? "").not.toContain("mingyuan_user_session=")
  })

  it("rejects completion without a live challenge", async () => {
    prismaMocks.challengeFindUnique.mockResolvedValue(null)

    const response = await completeDouyinLogin(completeRequest())

    expect(response.status).toBe(401)
    expect(consumeLoginCode).not.toHaveBeenCalled()
  })

  it("rejects a bad phone code without creating an account", async () => {
    consumeLoginCode.mockResolvedValue({ ok: false, reason: "mismatch" })

    const response = await completeDouyinLogin(completeRequest())

    expect(response.status).toBe(401)
    expect(prismaMocks.identityCreate).not.toHaveBeenCalled()
  })
})
