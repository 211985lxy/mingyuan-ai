/**
 * /api/topics/generate — degraded 透传契约测试。
 *
 * 验证要点：generateTopicCards 返回 degraded:true（模型链全败、降级模板卡）时，
 * 响应必须带 degraded:true 与 model，前端才能提示"重新生成"；正常生成时 degraded 为 false。
 * 修复前该字段在响应构造时被丢弃，前端无法区分真卡与降级模板。
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import jwt from "jsonwebtoken"

const { generateTopicCards, accountContextMocks } = vi.hoisted(() => {
  class AccountProjectContextError extends Error {
    status: number
    code: string
    constructor(code: string, message: string, status = 400) {
      super(message)
      this.code = code
      this.status = status
    }
  }
  return {
    generateTopicCards: vi.fn(),
    accountContextMocks: {
      AccountProjectContextError,
      resolveBoundProject: vi.fn(async () => ({ id: "project-1" })),
    },
  }
})

vi.mock("@/lib/topic-generation", () => ({ generateTopicCards }))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () => ({
        id: "topic-degraded-user",
        email: "degraded@test.com",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })),
    },
    topicSelection: {
      create: vi.fn(async () => ({ id: "selection-1" })),
    },
  },
}))

vi.mock("@/lib/account-project-context", () => accountContextMocks)

vi.mock("@/features/topics/services/topic-generation-request", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/topics/services/topic-generation-request")>()
  return {
    ...actual,
    loadTopicGenerationContext: vi.fn(async () => [
      { id: "project-1", name: "测试项目", industry: null, targetCustomer: null, offer: null, deliveryGoal: null },
      [
        { code: "practical", name: "实用", description: "d1", typeLabel: "t", conflictCodes: [] },
        { code: "identity", name: "人设", description: "d2", typeLabel: "t", conflictCodes: [] },
      ],
      [],
      [],
      null,
      [],
      [],
    ]),
    getHotTopicSources: vi.fn(async () => []),
    ensureTopicIpProfile: vi.fn(async () => ({
      ipProfileRecord: { id: "profile-1" },
      contentThemes: [],
      topicIpProfile: { id: "profile-1" },
    })),
  }
})

import { POST } from "@/app/api/topics/generate/route"

function req(body: unknown) {
  const token = jwt.sign(
    { id: "topic-degraded-user", email: "degraded@test.com" },
    process.env.JWT_SECRET || "user-secret-change-me",
    { expiresIn: "1h" },
  )
  return new NextRequest(new URL("/api/topics/generate", "http://localhost:3000"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

const okResult = {
  success: true,
  cards: [{ title: "真卡" }],
  elementCodes: ["practical", "identity"],
  promptText: "p",
  model: "zenmux/claude",
  strategy: "fresh",
  degraded: false,
}

describe("topics/generate degraded 透传", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("degraded:true 时响应携带 degraded 与 model，前端可提示重新生成", async () => {
    generateTopicCards.mockResolvedValue({
      ...okResult,
      cards: [{ title: "降级模板卡" }],
      model: "business_diagnosis-route:fallback",
      degraded: true,
    })

    const res = await POST(req({ recommendationMode: "normal" }), { params: Promise.resolve({}) })
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.data.degraded).toBe(true)
    expect(body.data.model).toBe("business_diagnosis-route:fallback")
  })

  it("正常生成时 degraded 为 false", async () => {
    generateTopicCards.mockResolvedValue(okResult)

    const res = await POST(req({ recommendationMode: "normal" }), { params: Promise.resolve({}) })
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.data.degraded).toBe(false)
    expect(body.data.model).toBe("zenmux/claude")
  })
})
