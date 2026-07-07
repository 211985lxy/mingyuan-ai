import { describe, it, expect, vi } from "vitest"
import jwt from "jsonwebtoken"
import type { NextRequest } from "next/server"
import { POST } from "@/app/api/scripts/quality-check/route"
import { req, json } from "./helpers"

type MockUser = { id: string; email: string }
type MockAuthContext = { params?: Record<string, string> }
type MockAuthedContext = { user: MockUser; params?: Record<string, string> }
type MockAuthHandler = (
  request: NextRequest,
  context: MockAuthedContext
) => Promise<Response> | Response

// Mock withUserAuth to avoid database dependency
vi.mock("@/lib/user-auth", () => ({
  withUserAuth: (handler: MockAuthHandler) => {
    return async (request: NextRequest, context?: MockAuthContext) => {
      // Mock successful auth - extract token and return user
      const token = request.headers.get("authorization")?.replace("Bearer ", "")
      if (!token) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        })
      }

      try {
        const payload = jwt.verify(token, process.env.JWT_SECRET!) as MockUser
        return handler(request, { user: payload, params: context?.params })
      } catch {
        return new Response(JSON.stringify({ error: "Invalid token" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        })
      }
    }
  },
}))

// Mock quality gate functions to avoid LLM calls
vi.mock("@/lib/quality-gate", () => ({
  runQualityCheck: vi.fn(),
  runQualityGateWithRewrite: vi.fn(),
}))

import { runQualityCheck, runQualityGateWithRewrite } from "@/lib/quality-gate"

const mockRunQualityCheck = vi.mocked(runQualityCheck)
const mockRunQualityGateWithRewrite = vi.mocked(runQualityGateWithRewrite)

describe("POST /api/scripts/quality-check", () => {
  const mockUser = { id: "test-user-id", email: "test@example.com" }
  const token = jwt.sign(mockUser, process.env.JWT_SECRET!, { expiresIn: "1h" })

  beforeEach(() => {
    mockRunQualityCheck.mockReset()
    mockRunQualityGateWithRewrite.mockReset()
  })

  it("returns 401 for unauthenticated request", async () => {
    const res = await POST(
      req("/api/scripts/quality-check", {
        method: "POST",
        body: { content: "test content" },
      }),
      undefined as never
    )
    expect(res.status).toBe(401)
    const body = await json(res)
    expect(body.error).toBe("Unauthorized")
  })

  it("returns 400 for missing content", async () => {
    const res = await POST(
      req("/api/scripts/quality-check", {
        method: "POST",
        body: {},
        headers: { Authorization: `Bearer ${token}` },
      }),
      undefined as never
    )
    expect(res.status).toBe(400)
    const body = await json(res)
    expect(body.error).toContain("缺少文案内容")
  })

  it("returns 400 for invalid content type", async () => {
    const res = await POST(
      req("/api/scripts/quality-check", {
        method: "POST",
        body: { content: 123 },
        headers: { Authorization: `Bearer ${token}` },
      }),
      undefined as never
    )
    expect(res.status).toBe(400)
    const body = await json(res)
    expect(body.error).toContain("缺少文案内容")
  })

  it("returns 400 for invalid topicTitle type", async () => {
    const res = await POST(
      req("/api/scripts/quality-check", {
        method: "POST",
        body: { content: "test content", topicTitle: 123 },
        headers: { Authorization: `Bearer ${token}` },
      }),
      undefined as never
    )
    expect(res.status).toBe(400)
    const body = await json(res)
    expect(body.error).toContain("topicTitle 必须是字符串")
  })

  it("returns 400 for invalid persona type", async () => {
    const res = await POST(
      req("/api/scripts/quality-check", {
        method: "POST",
        body: { content: "test content", persona: 123 },
        headers: { Authorization: `Bearer ${token}` },
      }),
      undefined as never
    )
    expect(res.status).toBe(400)
    const body = await json(res)
    expect(body.error).toContain("persona 必须是对象或字符串")
  })

  it("returns 400 for invalid autoRewrite type", async () => {
    const res = await POST(
      req("/api/scripts/quality-check", {
        method: "POST",
        body: { content: "test content", autoRewrite: "true" },
        headers: { Authorization: `Bearer ${token}` },
      }),
      undefined as never
    )
    expect(res.status).toBe(400)
    const body = await json(res)
    expect(body.error).toContain("autoRewrite 必须是布尔值")
  })

  it("returns 200 with quality report for valid request", async () => {
    const mockReport = {
      editorial: { score: 8, passed: true, feedback: "good", details: "" },
      aiTaste: { score: 9, passed: true, feedback: "ok", details: "" },
      attraction: { score: 7, passed: true, feedback: "good", details: "" },
      logic: { score: 8, passed: true, feedback: "good", details: "" },
      overall: { score: 8, passed: true, needsRewrite: false },
      rewriteCount: 0,
    }

    mockRunQualityCheck.mockResolvedValue(mockReport)

    const res = await POST(
      req("/api/scripts/quality-check", {
        method: "POST",
        body: {
          content: "这是一个测试文案，用于验证质量门控功能。",
          topicTitle: "测试选题",
          openingType: "反差开头",
          structure: "对比结构",
          endingType: "行动号召",
          persona: {
            roleType: "专家",
            oneLiner: "擅长将复杂问题拆解成实用技巧",
            toneOfVoice: "接地气、真实、有底气",
          },
        },
        headers: { Authorization: `Bearer ${token}` },
      }),
      undefined as never
    )
    expect(res.status).toBe(200)
    const body = await json(res)
    expect(body.success).toBe(true)
    expect(body.data.content).toBe("这是一个测试文案，用于验证质量门控功能。")
    expect(body.data.report).toEqual(mockReport)
    expect(mockRunQualityCheck).toHaveBeenCalledWith({
      content: "这是一个测试文案，用于验证质量门控功能。",
      topicTitle: "测试选题",
      openingType: "反差开头",
      structure: "对比结构",
      endingType: "行动号召",
      persona: {
        roleType: "专家",
        oneLiner: "擅长将复杂问题拆解成实用技巧",
        toneOfVoice: "接地气、真实、有底气",
      },
    })
  })

  it("returns douyin publish check when publishPlatform=douyin", async () => {
    const mockReport = {
      editorial: { score: 8, passed: true, feedback: "good", details: "" },
      aiTaste: { score: 9, passed: true, feedback: "ok", details: "" },
      attraction: { score: 7, passed: true, feedback: "good", details: "" },
      logic: { score: 8, passed: true, feedback: "good", details: "" },
      overall: { score: 8, passed: true, needsRewrite: false },
      rewriteCount: 0,
    }

    mockRunQualityCheck.mockResolvedValue(mockReport)

    const res = await POST(
      req("/api/scripts/quality-check", {
        method: "POST",
        body: {
          content: "这是全网第一的 AI 神器，私信我领取，100%有效。",
          publishPlatform: "douyin",
        },
        headers: { Authorization: `Bearer ${token}` },
      }),
      undefined as never
    )

    expect(res.status).toBe(200)
    const body = await json(res)
    expect(body.data.report).toEqual(mockReport)
    expect(body.data.publishCheck.verdict).toMatch(/高风险勿发|改完可发/)
    expect(body.data.publishCheck.violations.map((item: { text: string }) => item.text)).toEqual(
      expect.arrayContaining(["全网第一", "私信我", "100%有效"])
    )
    expect(body.data.publishCheck.trafficScore.score).toBeLessThan(80)
    expect(body.data.publishCheck.trafficScore.reasons.length).toBeGreaterThan(0)
  })

  it("accepts string persona and maps it into quality check input", async () => {
    const mockReport = {
      editorial: { score: 8, passed: true, feedback: "good", details: "" },
      aiTaste: { score: 9, passed: true, feedback: "ok", details: "" },
      attraction: { score: 7, passed: true, feedback: "good", details: "" },
      logic: { score: 8, passed: true, feedback: "good", details: "" },
      overall: { score: 8, passed: true, needsRewrite: false },
      rewriteCount: 0,
    }

    mockRunQualityCheck.mockResolvedValue(mockReport)

    const res = await POST(
      req("/api/scripts/quality-check", {
        method: "POST",
        body: {
          content: "这是一个测试文案，用于验证字符串人设也能通过。",
          persona: "真实、接地气的行业顾问",
        },
        headers: { Authorization: `Bearer ${token}` },
      }),
      undefined as never
    )

    expect(res.status).toBe(200)
    expect(mockRunQualityCheck).toHaveBeenCalledWith({
      content: "这是一个测试文案，用于验证字符串人设也能通过。",
      topicTitle: undefined,
      openingType: undefined,
      structure: undefined,
      endingType: undefined,
      persona: { oneLiner: "真实、接地气的行业顾问" },
    })
  })

  it("returns 200 with rewritten content when autoRewrite=true", async () => {
    const mockReport = {
      editorial: { score: 8, passed: true, feedback: "good", details: "" },
      aiTaste: { score: 9, passed: true, feedback: "ok", details: "" },
      attraction: { score: 7, passed: true, feedback: "good", details: "" },
      logic: { score: 8, passed: true, feedback: "good", details: "" },
      overall: { score: 8, passed: true, needsRewrite: false },
      rewriteCount: 1,
    }

    mockRunQualityGateWithRewrite.mockResolvedValue({
      content: "这是改写后的文案内容。",
      report: mockReport,
    })

    const res = await POST(
      req("/api/scripts/quality-check", {
        method: "POST",
        body: {
          content: "这是一个需要重写的文案。",
          autoRewrite: true,
        },
        headers: { Authorization: `Bearer ${token}` },
      }),
      undefined as never
    )
    expect(res.status).toBe(200)
    const body = await json(res)
    expect(body.success).toBe(true)
    expect(body.data.originalContent).toBe("这是一个需要重写的文案。")
    expect(body.data.content).toBe("这是改写后的文案内容。")
    expect(body.data.rewritten).toBe(true)
    expect(body.data.report).toEqual(mockReport)
    expect(mockRunQualityGateWithRewrite).toHaveBeenCalledWith({
      content: "这是一个需要重写的文案。",
      topicTitle: undefined,
      openingType: undefined,
      structure: undefined,
      endingType: undefined,
      persona: undefined,
    })
  })
})
