import { describe, expect, it } from "vitest"
import {
  parseAnalyticsNumber,
  parsePlatformAnalyticsText,
  parsedAnalyticsToOutcomeInput,
} from "@/lib/aim/platform-analytics-parse"

const DOUYIN_SAMPLE = `
抖音创作者中心 · 作品数据
统计周期：近 7 天
播放量：12,000
点赞数：86
评论数：14
收藏数：31
分享数：9
私信数：3
有效线索：1
成交数：0
`

const CHANNELS_SAMPLE = `
微信视频号数据
近14天
播放次数 800
点赞 4
评论 0
转发数 2
`

describe("parseAnalyticsNumber", () => {
  it("区分未填写与 0", () => {
    expect(parseAnalyticsNumber(null)).toBeNull()
    expect(parseAnalyticsNumber("")).toBeNull()
    expect(parseAnalyticsNumber("无")).toBeNull()
    expect(parseAnalyticsNumber("0")).toBe(0)
    expect(parseAnalyticsNumber("00")).toBe(0)
  })

  it("支持万/w 与千分位", () => {
    expect(parseAnalyticsNumber("1.2万")).toBe(12_000)
    expect(parseAnalyticsNumber("3w")).toBe(30_000)
    expect(parseAnalyticsNumber("12,000")).toBe(12_000)
  })
})

describe("parsePlatformAnalyticsText", () => {
  it("解析抖音风格导出并保留真实 0", () => {
    const parsed = parsePlatformAnalyticsText(DOUYIN_SAMPLE)
    expect(parsed.ok).toBe(true)
    expect(parsed.platform).toBe("douyin")
    expect(parsed.collectWindowDay).toBe(7)
    expect(parsed.fields.views).toBe(12_000)
    expect(parsed.fields.likes).toBe(86)
    expect(parsed.fields.comments).toBe(14)
    expect(parsed.fields.saves).toBe(31)
    expect(parsed.fields.shares).toBe(9)
    expect(parsed.fields.dmCount).toBe(3)
    expect(parsed.fields.qualifiedLeadCount).toBe(1)
    expect(parsed.fields.dealCount).toBe(0)
    expect(parsed.fields).not.toHaveProperty("appointmentCount")
  })

  it("解析视频号风格导出", () => {
    const parsed = parsePlatformAnalyticsText(CHANNELS_SAMPLE)
    expect(parsed.ok).toBe(true)
    expect(parsed.platform).toBe("channels")
    expect(parsed.collectWindowDay).toBe(14)
    expect(parsed.fields.views).toBe(800)
    expect(parsed.fields.likes).toBe(4)
    expect(parsed.fields.comments).toBe(0)
    expect(parsed.fields.shares).toBe(2)
  })

  it("残缺样例仍可识别已有字段", () => {
    const parsed = parsePlatformAnalyticsText("播放量 500\n点赞数 2")
    expect(parsed.ok).toBe(true)
    expect(parsed.fields.views).toBe(500)
    expect(parsed.fields.likes).toBe(2)
    expect(parsed.fields).not.toHaveProperty("comments")
    expect(parsed.missingHints.length).toBeGreaterThan(0)
  })

  it("全空样例失败可见，不瞎填", () => {
    const parsed = parsePlatformAnalyticsText("今天天气不错，适合拍视频")
    expect(parsed.ok).toBe(false)
    expect(parsed.fields).toEqual({})
    expect(parsed.summary).toContain("没有识别到")
  })

  it("转 Outcome 输入时不带未识别键", () => {
    const parsed = parsePlatformAnalyticsText("播放量：100\n点赞数：0")
    const body = parsedAnalyticsToOutcomeInput(parsed)
    expect(body).toMatchObject({
      collectWindowDay: 7,
      views: 100,
      likes: 0,
    })
    expect(body).not.toHaveProperty("comments")
    expect(parsedAnalyticsToOutcomeInput(parsePlatformAnalyticsText("你好"))).toBeNull()
  })
})
