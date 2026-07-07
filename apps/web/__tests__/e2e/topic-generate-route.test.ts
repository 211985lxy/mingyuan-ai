import { describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import jwt from "jsonwebtoken"
import { POST } from "@/app/api/topics/generate/route"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () => ({
        id: "topic-mode-user",
        email: "topic-mode@test.com",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })),
    },
  },
}))

function req(body: unknown) {
  const token = jwt.sign(
    { id: "topic-mode-user", email: "topic-mode@test.com" },
    process.env.JWT_SECRET || "user-secret-change-me",
    { expiresIn: "1h" },
  )

  return new NextRequest(new URL("/api/topics/generate", "http://localhost:3000"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
}

describe("topic generate route", () => {
  it("rejects invalid recommendationMode", async () => {
    const res = await POST(req({ recommendationMode: "tomorrow" }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain("recommendationMode")
  })
})
