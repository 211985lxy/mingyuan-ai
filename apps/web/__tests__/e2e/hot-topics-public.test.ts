import { describe, it, expect, beforeAll, afterAll } from "vitest"
import {
  redis, cleanDatabase, disconnectAll, cleanRedis,
  createAdminUser, createTemplate, json, req,
} from "./helpers"
import { GET } from "@/app/api/hot-topics/route"

describe("Public Hot Topics E2E", () => {
  beforeAll(async () => {
    await cleanDatabase()
    await cleanRedis()

    const admin = await createAdminUser()

    // Seed a published template with hot topic keywords
    await createTemplate(admin.id, {
      name: "hot-match-tpl",
      displayName: "房产推荐模板",
      status: "published",
      publishedAt: new Date(),
      hotTopicKeywords: ["房价", "楼市"],
    })

    // Seed hot topics in Redis (simulating a successful cron fetch)
    const topics = [
      {
        id: "s1",
        rank: 1,
        title: "房价走势分析",
        hotValue: 8000000,
        label: "hot",
        videoCount: 5000,
        coverUrl: null,
        douyinSearchUrl: "https://www.douyin.com/search/房价走势分析",
        fetchedAt: new Date().toISOString(),
      },
      {
        id: "s2",
        rank: 2,
        title: "美食探店",
        hotValue: 6000000,
        label: "normal",
        videoCount: 3000,
        coverUrl: null,
        douyinSearchUrl: "https://www.douyin.com/search/美食探店",
        fetchedAt: new Date().toISOString(),
      },
    ]
    await redis.setex("douyin:hot:latest", 3600, JSON.stringify(topics))
  })

  afterAll(async () => {
    await cleanDatabase()
    await cleanRedis()
    await disconnectAll()
  })

  it("returns hot topics with template recommendations from real data", async () => {
    const res = await GET(req("/api/hot-topics"))
    expect(res.status).toBe(200)

    const body = await json(res)
    expect(body.data.topics.length).toBe(2)
    expect(body.data.updatedAt).toBeDefined()

    // First topic "房价走势分析" should match template with keyword "房价"
    const topic1 = body.data.topics[0]
    expect(topic1.title).toBe("房价走势分析")
    expect(topic1.recommendedTemplates.length).toBeGreaterThanOrEqual(1)
    expect(topic1.recommendedTemplates[0].name).toBe("房产推荐模板")

    // Second topic "美食探店" should NOT match the 房产 template
    const topic2 = body.data.topics[1]
    expect(topic2.title).toBe("美食探店")
    expect(
      topic2.recommendedTemplates.some(
        (t: { name: string }) => t.name === "房产推荐模板"
      )
    ).toBe(false)
  })

  it("includes Cache-Control header", async () => {
    const res = await GET(req("/api/hot-topics"))
    expect(res.headers.get("Cache-Control")).toContain("max-age=300")
  })
})
