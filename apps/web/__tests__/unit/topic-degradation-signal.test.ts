/**
 * 降级信号闭环测试：fallback 选题卡在任何读取入口都必须可见。
 *
 * 覆盖两条此前会丢信号的路：
 *   1. topic-bridge.extractTopicsFromVideo（聊天/飞书 5c 入口）——degraded 必须透传。
 *   2. GET /api/topics/today（每日缓存入口）——缓存命中时必须从 model 的
 *      ":fallback" 后缀推导 degraded，否则降级模板会以"今日推荐"名义反复展示。
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import jwt from "jsonwebtoken"

// ─── 共享 mock（topic-bridge 与 today 路由共用 @/lib/prisma，必须统一注册）──

const { generateTopicCards, sharedPrisma } = vi.hoisted(() => ({
  generateTopicCards: vi.fn(),
  sharedPrisma: {
    user: {
      findUnique: vi.fn(async () => ({
        id: "today-user",
        email: "today@test.com",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })),
    },
    ipProfile: {
      findUnique: vi.fn(async () => ({ id: "profile-1", displayName: "测试IP" })),
    },
    topicElement: {
      findMany: vi.fn(async () => [
        { code: "practical", name: "实用", typeLabel: "t", description: "d" },
        { code: "identity", name: "人设", typeLabel: "t", description: "d" },
      ]),
    },
    topicSelection: {
      create: vi.fn(async () => ({ id: "selection-bridge-1" })),
      findFirst: vi.fn(),
    },
  },
}))

vi.mock("@/lib/topic-generation", () => ({ generateTopicCards }))
vi.mock("@/lib/prisma", () => ({ prisma: sharedPrisma }))

import { extractTopicsFromVideo } from "@/lib/content-pipeline/topic-bridge"

describe("topic-bridge degraded 透传（聊天/飞书 5c 入口）", () => {
  beforeEach(() => vi.clearAllMocks())

  it("模型链全败时 result.degraded=true，调用方（飞书卡片/聊天回复）可提示用户", async () => {
    generateTopicCards.mockResolvedValue({
      success: true,
      cards: [{ title: "降级模板卡" }],
      elementCodes: ["practical", "identity"],
      promptText: "p",
      model: "business_diagnosis-route:fallback",
      strategy: "fresh",
      degraded: true,
    })

    const result = await extractTopicsFromVideo({
      transcript: "完整的视频转录文本",
      userId: "user-1",
      projectId: "project-1",
    })

    expect(result.success).toBe(true)
    expect(result.degraded).toBe(true)
    // 持久化时 model 带 :fallback 后缀，供缓存入口推导
    expect(sharedPrisma.topicSelection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ model: "business_diagnosis-route:fallback" }),
      }),
    )
  })

  it("正常生成时 degraded=false", async () => {
    generateTopicCards.mockResolvedValue({
      success: true,
      cards: [{ title: "真卡" }],
      elementCodes: ["practical", "identity"],
      promptText: "p",
      model: "deepseek-flash",
      strategy: "fresh",
      degraded: false,
    })

    const result = await extractTopicsFromVideo({
      transcript: "完整的视频转录文本",
      userId: "user-1",
    })

    expect(result.success).toBe(true)
    expect(result.degraded).toBe(false)
  })
})

// ─── /api/topics/today 部分 ─────────────────────────────────────

vi.mock("@/lib/account-project-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/account-project-context")>()
  return {
    ...actual,
    resolveBoundProject: vi.fn(async () => ({ id: "project-1" })),
  }
})

import { GET as getToday } from "@/app/api/topics/today/route"

function todayReq() {
  const token = jwt.sign(
    { id: "today-user", email: "today@test.com" },
    process.env.JWT_SECRET || "user-secret-change-me",
    { expiresIn: "1h" },
  )
  return new NextRequest(new URL("/api/topics/today?mode=daily", "http://localhost:3000"), {
    headers: { Authorization: `Bearer ${token}` },
  })
}

describe("/api/topics/today 缓存降级推导", () => {
  beforeEach(() => vi.clearAllMocks())

  it("缓存记录 model 以 :fallback 结尾 → degraded=true", async () => {
    sharedPrisma.topicSelection.findFirst.mockResolvedValue({
      id: "sel-fallback",
      candidates: [{ title: "降级模板卡" }],
      sourceHighlights: [],
      model: "business_diagnosis-route:fallback",
      createdAt: new Date(),
    })

    const res = await getToday(todayReq(), { params: Promise.resolve({}) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.mode).toBe("cached")
    expect(body.degraded).toBe(true)
    expect(body.model).toBe("business_diagnosis-route:fallback")
  })

  it("正常记录（model 无后缀）→ degraded=false", async () => {
    sharedPrisma.topicSelection.findFirst.mockResolvedValue({
      id: "sel-real",
      candidates: [{ title: "真卡" }],
      sourceHighlights: [],
      model: "deepseek-flash",
      createdAt: new Date(),
    })

    const res = await getToday(todayReq(), { params: Promise.resolve({}) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.degraded).toBe(false)
  })

  it("未命中缓存 → mode=missing", async () => {
    sharedPrisma.topicSelection.findFirst.mockResolvedValue(null)

    const res = await getToday(todayReq(), { params: Promise.resolve({}) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.mode).toBe("missing")
  })
})
