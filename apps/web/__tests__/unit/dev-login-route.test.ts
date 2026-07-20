import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  env: {
    NODE_ENV: "development" as "development" | "production" | "test",
    LOCAL_DEV_LOGIN_ENABLED: "true" as string | undefined,
    LOCAL_DEV_LOGIN_EMAIL: "local@example.test" as string | undefined,
  },
  findUser: vi.fn(),
  signToken: vi.fn(() => "signed-user-token"),
}))

vi.mock("@/env", () => ({ env: mocks.env }))
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: mocks.findUser } } }))
vi.mock("@/lib/user-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/user-auth")>()
  return { ...actual, signUserToken: mocks.signToken }
})

import { POST } from "@/app/api/auth/dev-login/route"

function request(url = "http://localhost:3000/api/auth/dev-login", origin = "http://localhost:3000") {
  return new NextRequest(url, {
    method: "POST",
    headers: { origin, "sec-fetch-site": "same-origin" },
  })
}

describe("local development login", () => {
  beforeEach(() => {
    mocks.env.NODE_ENV = "development"
    mocks.env.LOCAL_DEV_LOGIN_ENABLED = "true"
    mocks.env.LOCAL_DEV_LOGIN_EMAIL = "local@example.test"
    mocks.findUser.mockReset().mockResolvedValue({
      id: "user-local",
      email: "local@example.test",
      name: "lxy",
      plan: "free",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      expiresAt: new Date("2027-07-09T08:32:08.108Z"),
    })
    mocks.signToken.mockClear()
  })

  it("sets the normal user session cookie for the configured local account", async () => {
    const response = await POST(request())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.user).toMatchObject({ email: "local@example.test", subscriptionStatus: "active" })
    expect(mocks.findUser).toHaveBeenCalledWith({ where: { email: "local@example.test" } })
    expect(mocks.signToken).toHaveBeenCalledWith({ id: "user-local", email: "local@example.test" })
    expect(response.headers.get("set-cookie")).toContain("mingyuan_user_session=signed-user-token")
    expect(response.headers.get("set-cookie")).toContain("HttpOnly")
  })

  it("is unavailable outside development", async () => {
    mocks.env.NODE_ENV = "production"

    const response = await POST(request())

    expect(response.status).toBe(404)
    expect(mocks.findUser).not.toHaveBeenCalled()
  })

  it("is unavailable when the explicit local flag is disabled", async () => {
    mocks.env.LOCAL_DEV_LOGIN_ENABLED = "false"

    const response = await POST(request())

    expect(response.status).toBe(404)
    expect(mocks.findUser).not.toHaveBeenCalled()
  })

  it("is unavailable for non-local hosts or cross-site requests", async () => {
    const remoteHost = await POST(request("http://aim.example.com/api/auth/dev-login", "http://aim.example.com"))
    const crossSite = await POST(request("http://localhost:3000/api/auth/dev-login", "https://evil.example.com"))

    expect(remoteHost.status).toBe(404)
    expect(crossSite.status).toBe(404)
    expect(mocks.findUser).not.toHaveBeenCalled()
  })

  it("returns an actionable error without creating a missing account", async () => {
    mocks.findUser.mockResolvedValue(null)

    const response = await POST(request())
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body).toEqual({
      error: "本地一键登录账号不存在，请检查 LOCAL_DEV_LOGIN_EMAIL",
      code: "LOCAL_DEV_USER_NOT_FOUND",
    })
  })
})
