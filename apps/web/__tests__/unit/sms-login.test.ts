import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const prismaMocks = vi.hoisted(() => ({
  smsCodeCreate: vi.fn(),
  smsCodeFindFirst: vi.fn(),
  smsCodeUpdate: vi.fn(),
  smsCodeCount: vi.fn(),
  userFindUnique: vi.fn(),
  userCreate: vi.fn(),
}))

const sendLoginCode = vi.hoisted(() => vi.fn())
const allowAuthAttempt = vi.hoisted(() => vi.fn())
const allowKeyedAttempt = vi.hoisted(() => vi.fn())

vi.mock("@/lib/prisma", () => ({
  prisma: {
    smsVerificationCode: {
      create: prismaMocks.smsCodeCreate,
      findFirst: prismaMocks.smsCodeFindFirst,
      update: prismaMocks.smsCodeUpdate,
      count: prismaMocks.smsCodeCount,
    },
    user: {
      findUnique: prismaMocks.userFindUnique,
      create: prismaMocks.userCreate,
    },
  },
}))

vi.mock("@/lib/sms", () => ({
  getSmsProvider: () => ({ name: "console", sendLoginCode }),
}))

vi.mock("@/features/auth/auth-rate-limit", () => ({
  allowAuthAttempt,
  allowKeyedAttempt,
}))

import { POST as sendSms } from "@/app/api/auth/sms/send/route"
import { POST as smsLogin } from "@/app/api/auth/sms/login/route"
import { hashCode } from "@/features/auth/sms-verification"

const PHONE = "13800138000"

function req(url: string, body: unknown) {
  return new NextRequest(new URL(url), {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: "http://localhost" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  allowAuthAttempt.mockResolvedValue(true)
  allowKeyedAttempt.mockResolvedValue(true)
  sendLoginCode.mockResolvedValue(undefined)
  prismaMocks.smsCodeCreate.mockResolvedValue({})
  prismaMocks.smsCodeCount.mockResolvedValue(0)
})

describe("POST /api/auth/sms/send", () => {
  it("issues a hashed code and sends it", async () => {
    const res = await sendSms(req("http://localhost/api/auth/sms/send", { phone: PHONE }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ sent: true, retryAfterSeconds: 60 })
    expect(prismaMocks.smsCodeCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ phone: PHONE, purpose: "login" }),
    })
    expect(prismaMocks.smsCodeCreate.mock.calls[0][0].data.codeHash).toMatch(/^[0-9a-f]{64}$/)
    expect(sendLoginCode).toHaveBeenCalledWith(PHONE, expect.stringMatching(/^\d{6}$/))
  })

  it("rejects invalid phone numbers", async () => {
    const res = await sendSms(req("http://localhost/api/auth/sms/send", { phone: "12345" }))
    expect(res.status).toBe(400)
    expect(sendLoginCode).not.toHaveBeenCalled()
  })

  it("returns 429 when rate limited", async () => {
    allowKeyedAttempt.mockResolvedValueOnce(false)
    const res = await sendSms(req("http://localhost/api/auth/sms/send", { phone: PHONE }))
    expect(res.status).toBe(429)
    expect(sendLoginCode).not.toHaveBeenCalled()
  })

  it("checks cooldown, hourly, daily and ip limits", async () => {
    await sendSms(req("http://localhost/api/auth/sms/send", { phone: PHONE }))
    expect(allowKeyedAttempt).toHaveBeenCalledTimes(3)
    expect(allowAuthAttempt).toHaveBeenCalledTimes(1)
  })
})

describe("POST /api/auth/sms/login", () => {
  function validCodeRecord(code: string, overrides: Record<string, unknown> = {}) {
    return {
      id: "code-1",
      phone: PHONE,
      codeHash: hashCode(PHONE, code),
      purpose: "login",
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 0,
      consumedAt: null,
      ...overrides,
    }
  }

  it("logs in an existing phone user with a valid code", async () => {
    prismaMocks.smsCodeFindFirst.mockResolvedValue(validCodeRecord("123456"))
    prismaMocks.userFindUnique.mockResolvedValue({
      id: "u1", email: `${PHONE}@phone.local`, name: "用户", plan: "free",
      createdAt: new Date(), expiresAt: null,
    })

    const res = await smsLogin(req("http://localhost/api/auth/sms/login", { phone: PHONE, code: "123456" }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.user.id).toBe("u1")
    expect(prismaMocks.userCreate).not.toHaveBeenCalled()
    expect(prismaMocks.smsCodeUpdate).toHaveBeenCalledWith({
      where: { id: "code-1" },
      data: { consumedAt: expect.any(Date) },
    })
    expect(res.headers.getSetCookie?.().join(",") ?? "").toContain("mingyuan_user_session")
  })

  it("auto-registers a new phone user", async () => {
    prismaMocks.smsCodeFindFirst.mockResolvedValue(validCodeRecord("654321"))
    prismaMocks.userFindUnique.mockResolvedValue(null)
    prismaMocks.userCreate.mockResolvedValue({
      id: "u2", email: `${PHONE}@phone.local`, name: `用户${PHONE.slice(-4)}`,
      plan: "free", createdAt: new Date(), expiresAt: null,
    })

    const res = await smsLogin(req("http://localhost/api/auth/sms/login", { phone: PHONE, code: "654321" }))
    expect(res.status).toBe(200)
    expect(prismaMocks.userCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        phone: PHONE,
        email: `${PHONE}@phone.local`,
        name: `用户${PHONE.slice(-4)}`,
      }),
    })
  })

  it("rejects a wrong code and increments attempts", async () => {
    prismaMocks.smsCodeFindFirst.mockResolvedValue(validCodeRecord("123456"))

    const res = await smsLogin(req("http://localhost/api/auth/sms/login", { phone: PHONE, code: "000000" }))
    expect(res.status).toBe(401)
    expect(prismaMocks.smsCodeUpdate).toHaveBeenCalledWith({
      where: { id: "code-1" },
      data: { attempts: { increment: 1 } },
    })
    expect(prismaMocks.userFindUnique).not.toHaveBeenCalled()
  })

  it("rejects an expired code without leaking details", async () => {
    prismaMocks.smsCodeFindFirst.mockResolvedValue(
      validCodeRecord("123456", { expiresAt: new Date(Date.now() - 1000) })
    )
    const res = await smsLogin(req("http://localhost/api/auth/sms/login", { phone: PHONE, code: "123456" }))
    expect(res.status).toBe(401)
    expect((await res.json()).error).toContain("验证码错误或已过期")
  })

  it("rejects a code with too many attempts", async () => {
    prismaMocks.smsCodeFindFirst.mockResolvedValue(validCodeRecord("123456", { attempts: 5 }))
    const res = await smsLogin(req("http://localhost/api/auth/sms/login", { phone: PHONE, code: "123456" }))
    expect(res.status).toBe(401)
  })

  it("returns 429 when login attempts are exhausted", async () => {
    allowAuthAttempt.mockResolvedValue(false)
    const res = await smsLogin(req("http://localhost/api/auth/sms/login", { phone: PHONE, code: "123456" }))
    expect(res.status).toBe(429)
    expect(prismaMocks.smsCodeFindFirst).not.toHaveBeenCalled()
  })
})
