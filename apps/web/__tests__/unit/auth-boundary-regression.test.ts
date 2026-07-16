import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import jwt from "jsonwebtoken"
import { NextRequest } from "next/server"
import { describe, expect, it } from "vitest"
import { allowAuthAttempt } from "@/features/auth/auth-rate-limit"
import { signAdminToken, verifyAdminToken } from "@/lib/admin-auth"

describe("authentication boundaries", () => {
  it("uses an admin-only signing secret", () => {
    const token = signAdminToken({
      id: "admin-1",
      email: "admin@example.com",
      role: "admin",
      sessionVersion: 3,
    })

    expect(verifyAdminToken(token)).toMatchObject({ id: "admin-1", sessionVersion: 3 })
    expect(() => jwt.verify(token, process.env.JWT_SECRET!)).toThrow()
  })

  it("does not retain the historical password bypass", () => {
    const source = [
      "src/app/api/auth/login/route.ts",
      "src/app/api/admin/auth/login/route.ts",
      "create-codes.ts",
    ].map((file) => readFileSync(resolve(process.cwd(), file), "utf8")).join("\n")

    expect(source).not.toContain("skip-password-check")
  })

  it("does not persist browser session tokens", () => {
    expect(existsSync(resolve(process.cwd(), "src/lib/auth-storage.ts"))).toBe(false)

    const browserAuthSource = [
      "src/lib/store.ts",
      "src/lib/admin-store.ts",
      "src/lib/api/core.ts",
      "src/lib/api/admin-client.ts",
    ].map((file) => readFileSync(resolve(process.cwd(), file), "utf8")).join("\n")

    expect(browserAuthSource).not.toMatch(/localStorage[^\n]*(token|session)/i)
    expect(browserAuthSource).not.toMatch(/Authorization[^\n]*Bearer/i)
  })

  it("rejects attempts beyond the configured authentication limit", async () => {
    const request = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.9" },
    })
    const scope = `unit-${Date.now()}-${Math.random()}`

    await expect(allowAuthAttempt(scope, request, "user@example.com", {
      limit: 2,
      windowSeconds: 60,
    })).resolves.toBe(true)
    await expect(allowAuthAttempt(scope, request, "user@example.com", {
      limit: 2,
      windowSeconds: 60,
    })).resolves.toBe(true)
    await expect(allowAuthAttempt(scope, request, "user@example.com", {
      limit: 2,
      windowSeconds: 60,
    })).resolves.toBe(false)
  })
})
