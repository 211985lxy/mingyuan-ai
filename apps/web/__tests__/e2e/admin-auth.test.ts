import { describe, it, expect, beforeAll, afterAll } from "vitest"
import {
  cleanDatabase, disconnectAll, cleanRedis,
  createAdminUser, req, json,
} from "./helpers"
import { POST } from "@/app/api/admin/auth/login/route"

describe("Admin Auth E2E", () => {
  beforeAll(async () => {
    await cleanDatabase()
    await cleanRedis()
    await createAdminUser({ email: "admin@e2e.com", rawPassword: "Secret123!" })
    await createAdminUser({
      email: "disabled@e2e.com",
      rawPassword: "Secret123!",
      isActive: false,
    })
  })

  afterAll(async () => {
    await cleanDatabase()
    await disconnectAll()
  })

  it("rejects missing fields", async () => {
    const res = await POST(req("/api/admin/auth/login", { method: "POST", body: {} }))
    expect(res.status).toBe(400)
  })

  it("rejects non-existent email", async () => {
    const res = await POST(
      req("/api/admin/auth/login", {
        method: "POST",
        body: { email: "nobody@e2e.com", password: "x" },
      })
    )
    expect(res.status).toBe(401)
  })

  it("rejects wrong password", async () => {
    const res = await POST(
      req("/api/admin/auth/login", {
        method: "POST",
        body: { email: "admin@e2e.com", password: "WrongPass" },
      })
    )
    expect(res.status).toBe(401)
  })

  it("rejects disabled admin", async () => {
    const res = await POST(
      req("/api/admin/auth/login", {
        method: "POST",
        body: { email: "disabled@e2e.com", password: "Secret123!" },
      })
    )
    expect(res.status).toBe(401)
  })

  it("returns JWT token on correct credentials", async () => {
    const res = await POST(
      req("/api/admin/auth/login", {
        method: "POST",
        body: { email: "admin@e2e.com", password: "Secret123!" },
      })
    )
    expect(res.status).toBe(200)

    const body = await json(res)
    expect(body.token).toBeDefined()
    expect(typeof body.token).toBe("string")
    expect(body.admin.email).toBe("admin@e2e.com")
    expect(body.admin.role).toBe("admin")
    expect(body.admin.id).toBeDefined()
    // password should NOT be in the response
    expect(body.admin.password).toBeUndefined()
  })
})
