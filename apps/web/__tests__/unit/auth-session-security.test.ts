import { NextRequest, NextResponse } from "next/server"
import { describe, expect, it } from "vitest"
import { z } from "zod"
import { parseJsonBody } from "@/lib/api-contract"
import {
  clearSessionCookie,
  isCsrfSafe,
  readSessionToken,
  setSessionCookie,
} from "@/lib/auth-session"

function request(
  method: string,
  headers: Record<string, string> = {},
  body?: string,
) {
  return new NextRequest("http://localhost:3000/api/test", { method, headers, body })
}

describe("session cookie security", () => {
  it("sets and clears HttpOnly same-site cookies", () => {
    const response = NextResponse.json({ ok: true })
    setSessionCookie(response, "user", "signed-token")
    const cookie = response.headers.get("set-cookie") ?? ""

    expect(cookie).toContain("mingyuan_user_session=signed-token")
    expect(cookie).toContain("HttpOnly")
    expect(cookie).toContain("SameSite=lax")
    expect(cookie).toContain("Path=/")

    const logout = NextResponse.json({ ok: true })
    clearSessionCookie(logout, "user")
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0")
  })

  it("prefers explicit bearer credentials and otherwise reads the session cookie", () => {
    expect(readSessionToken(request("GET", {
      Cookie: "mingyuan_user_session=cookie-token",
      Authorization: "Bearer agent-token",
    }), "user")).toEqual({ token: "agent-token", source: "bearer" })

    expect(readSessionToken(request("GET", {
      Cookie: "mingyuan_user_session=cookie-token",
    }), "user")).toEqual({ token: "cookie-token", source: "cookie" })
  })

  it("rejects cross-site writes authenticated by cookies", () => {
    expect(isCsrfSafe(request("POST", { Origin: "https://attacker.example" }), "cookie")).toBe(false)
    expect(isCsrfSafe(request("POST", { Origin: "http://localhost:3000" }), "cookie")).toBe(true)
    expect(isCsrfSafe(request("POST", { Origin: "https://attacker.example" }), "bearer")).toBe(true)
    expect(isCsrfSafe(request("GET", { Origin: "https://attacker.example" }), "cookie")).toBe(true)
  })

  it("accepts same-origin writes behind a reverse proxy", () => {
    expect(isCsrfSafe(request("POST", {
      Origin: "https://mingyuan-ai.cn",
      Host: "127.0.0.1:3000",
      "X-Forwarded-Host": "mingyuan-ai.cn",
      "X-Forwarded-Proto": "https",
    }), "cookie")).toBe(true)
  })
})

describe("JSON request contracts", () => {
  const schema = z.object({ name: z.string().min(1).max(20) }).strict()

  it("parses valid bodies and rejects invalid fields", async () => {
    await expect(parseJsonBody(request("POST", {}, JSON.stringify({ name: "AIM" })), schema))
      .resolves.toEqual({ name: "AIM" })
    await expect(parseJsonBody(request("POST", {}, JSON.stringify({ name: "" })), schema))
      .rejects.toMatchObject({ status: 400, code: "INVALID_REQUEST", field: "name" })
  })

  it("rejects malformed and oversized JSON before route logic", async () => {
    await expect(parseJsonBody(request("POST", {}, "{"), schema))
      .rejects.toMatchObject({ status: 400, code: "INVALID_JSON" })
    await expect(parseJsonBody(
      request("POST", {}, JSON.stringify({ name: "too long" })),
      schema,
      { maxBytes: 4 },
    )).rejects.toMatchObject({ status: 413, code: "PAYLOAD_TOO_LARGE" })
  })
})
