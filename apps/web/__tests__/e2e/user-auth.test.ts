import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma, cleanDatabase, disconnectAll, cleanRedis, req, json } from "./helpers"
import { POST as REGISTER } from "@/app/api/auth/register/route"
import { POST as LOGIN } from "@/app/api/auth/login/route"
import { GET as ME } from "@/app/api/auth/me/route"

let sessionCookie: string

describe("User Auth E2E", () => {
  beforeAll(async () => {
    await cleanDatabase()
    await cleanRedis()
  })

  afterAll(async () => {
    await cleanDatabase()
    await disconnectAll()
  })

  // ─── Register ─────────────────────────────────────────

  it("rejects register with missing fields", async () => {
    const res = await REGISTER(req("/api/auth/register", { method: "POST", body: { email: "a@b.com" } }))
    expect(res.status).toBe(400)
  })

  it("registers a new user", async () => {
    const res = await REGISTER(req("/api/auth/register", {
      method: "POST",
      body: { email: "user@e2e.com", password: "Pass123!", name: "Test User" },
    }))
    expect(res.status).toBe(201)

    const body = await json(res)
    expect(body.token).toBeUndefined()
    expect(body.user.email).toBe("user@e2e.com")
    expect(body.user.name).toBe("Test User")
    expect(body.user.plan).toBe("free")
    expect(body.user.expiresAt).toBeNull()
    expect(body.user.isActivated).toBe(false)
    expect(body.user.subscriptionStatus).toBe("inactive")
    expect(body.user.password).toBeUndefined()
    const setCookie = res.headers.get("set-cookie") ?? ""
    expect(setCookie).toContain("mingyuan_user_session=")
    expect(setCookie).toContain("HttpOnly")
    expect(setCookie).toContain("SameSite=lax")
    sessionCookie = setCookie.split(";", 1)[0]
  })

  it("rejects duplicate email", async () => {
    const res = await REGISTER(req("/api/auth/register", {
      method: "POST",
      body: { email: "user@e2e.com", password: "Pass123!", name: "Dup" },
    }))
    expect(res.status).toBe(409)
    const body = await json(res)
    expect(body.error).toContain("already registered")
  })

  // ─── Login ────────────────────────────────────────────

  it("rejects login with missing fields", async () => {
    const res = await LOGIN(req("/api/auth/login", { method: "POST", body: {} }))
    expect(res.status).toBe(400)
  })

  it("rejects wrong password", async () => {
    const res = await LOGIN(req("/api/auth/login", {
      method: "POST",
      body: { email: "user@e2e.com", password: "WrongPass" },
    }))
    expect(res.status).toBe(401)
  })

  it("rejects non-existent email", async () => {
    const res = await LOGIN(req("/api/auth/login", {
      method: "POST",
      body: { email: "nobody@e2e.com", password: "Pass123!" },
    }))
    expect(res.status).toBe(401)
  })

  it("logs in with correct credentials", async () => {
    const res = await LOGIN(req("/api/auth/login", {
      method: "POST",
      body: { email: "user@e2e.com", password: "Pass123!" },
    }))
    expect(res.status).toBe(200)

    const body = await json(res)
    expect(body.token).toBeUndefined()
    expect(body.user.email).toBe("user@e2e.com")
    expect(body.user.isActivated).toBe(false)
    expect(body.user.subscriptionStatus).toBe("inactive")
    sessionCookie = (res.headers.get("set-cookie") ?? "").split(";", 1)[0]
  })

  // ─── Me ───────────────────────────────────────────────

  it("rejects /me without token", async () => {
    const res = await ME(req("/api/auth/me"), undefined as never)
    expect(res.status).toBe(401)
  })

  it("rejects /me with invalid token", async () => {
    const res = await ME(
      req("/api/auth/me", { headers: { Authorization: "Bearer garbage" } }),
      undefined as never
    )
    expect(res.status).toBe(401)
  })

  it("returns user profile with valid token", async () => {
    const res = await ME(
      req("/api/auth/me", { headers: { Cookie: sessionCookie } }),
      undefined as never
    )
    expect(res.status).toBe(200)

    const body = await json(res)
    expect(body.user.email).toBe("user@e2e.com")
    expect(body.user.name).toBe("Test User")
    expect(body.user.plan).toBe("free")
    expect(body.user.createdAt).toBeDefined()
    expect(body.user.expiresAt).toBeNull()
    expect(body.user.isActivated).toBe(false)
    expect(body.user.subscriptionStatus).toBe("inactive")
  })

  // ─── DB verification ─────────────────────────────────

  it("stored password is hashed in DB", async () => {
    const dbUser = await prisma.user.findUnique({ where: { email: "user@e2e.com" } })
    expect(dbUser).not.toBeNull()
    expect(dbUser!.password).not.toBe("Pass123!")
    expect(dbUser!.password).toMatch(/^\$2[aby]?\$/)
  })
})
