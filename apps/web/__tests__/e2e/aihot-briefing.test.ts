import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { GET as CRON } from "@/app/api/cron/aihot-briefing/route"
import { GET as TODAY } from "@/app/api/aihot-briefing/today/route"
import { cronReq, disconnectAll, json, prisma, req } from "./helpers"

const now = new Date("2099-01-01T01:00:00.000Z")

function mockAiHotFetch(titleSuffix: string) {
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    const userAgent = (init?.headers as Record<string, string>)?.["User-Agent"] ?? ""
    return Response.json({
        count: 2,
        hasNext: false,
        nextCursor: null,
        items: [
          {
            id: `model-${titleSuffix}`,
            title: `模型更新 ${titleSuffix}`,
            source: "AI HOT Source",
            url: `https://example.com/model-${titleSuffix}`,
            publishedAt: "2099-01-01T00:00:00.000Z",
            summary: "模型能力更新，适合关注发布节奏。",
            category: "ai-models",
          },
          {
            id: `paper-${titleSuffix}`,
            title: `论文研究 ${titleSuffix}`,
            source: "Paper Source",
            url: `https://example.com/paper-${titleSuffix}`,
            publishedAt: "2098-12-31T23:00:00.000Z",
            summary: "研究提出新方法，值得内容团队跟进。",
            category: "paper",
          },
        ],
        userAgent,
    })
  }))
}

describe("AI HOT briefing endpoints", () => {
  beforeAll(async () => {
    await prisma.aiHotBriefing.deleteMany({ where: { date: "2099-01-01" } })
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  afterAll(async () => {
    vi.useRealTimers()
    await prisma.aiHotBriefing.deleteMany({ where: { date: "2099-01-01" } })
    await disconnectAll()
  })

  it("rejects cron without cron secret", async () => {
    const res = await CRON(req("/api/cron/aihot-briefing"))
    expect(res.status).toBe(401)
  })

  it("upserts one briefing for the Beijing date", async () => {
    mockAiHotFetch("one")
    const first = await CRON(cronReq("/api/cron/aihot-briefing"))
    expect(first.status).toBe(200)

    mockAiHotFetch("two")
    const second = await CRON(cronReq("/api/cron/aihot-briefing"))
    expect(second.status).toBe(200)

    const records = await prisma.aiHotBriefing.findMany({ where: { date: "2099-01-01" } })
    expect(records).toHaveLength(1)
    expect(records[0].markdown).toContain("模型更新 two")
  })

  it("returns an existing briefing from today endpoint", async () => {
    const res = await TODAY(req("/api/aihot-briefing/today"))
    expect(res.status).toBe(200)

    const body = await json(res)
    expect(body.data.title).toBe("每日选题雷达 · 今日 9 点")
    expect(body.data.items).toHaveLength(2)
    expect(body.data.markdown).toContain("https://example.com/model-two")
  })
})
