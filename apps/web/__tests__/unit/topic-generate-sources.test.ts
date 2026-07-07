import { describe, expect, it } from "vitest"
import {
  buildBenchmarkAccountSources,
  buildProjectSource,
  buildTopicSources,
  buildVideoCopyExtractionSources,
} from "@/lib/topic-source-builders"

describe("topic generate sources", () => {
  it("marks project source as the IP operation baseline", () => {
    const source = buildProjectSource({
      name: "中汝达AI数字供暖",
      industry: "数字供暖",
      targetCustomer: "供暖项目业主",
      offer: "数字供暖改造",
      deliveryGoal: "获客转化",
    })

    expect(source).toMatchObject({
      category: "client_project",
      title: "IP操作方案基准线：中汝达AI数字供暖",
    })
    expect(source?.content).toContain("全站选题策划的基准线")
    expect(source?.content).toContain("目标客户：供暖项目业主")
  })

  it("builds benchmark sources from watched account videos", () => {
    const sources = buildBenchmarkAccountSources([
      {
        nickname: "对标账号",
        targetUrl: "https://example.com/u",
        viralVideos: [{ title: "爆款标题", likes: 100, comments: 2, shares: 3, collects: 4 }],
        latestVideos: [{ title: "近期标题", likes: 10, comments: 1, shares: 0, collects: 2 }],
      },
    ])

    expect(sources[0]).toMatchObject({
      category: "benchmark_reference",
      title: "对标账号",
    })
    expect(sources[0].content).toContain("爆款标题")
    expect(sources[0].content).toContain("近期标题")
    expect(sources[0].content).toContain("已验证内容信号")
  })

  it("builds benchmark sources from extracted copy analysis", () => {
    const sources = buildVideoCopyExtractionSources([
      {
        videoTitle: "拆解标题",
        sourceUrl: "https://example.com/video",
        transcript: "这是原文开头，里面有钩子和结构。",
        analysisResult: { hook: "反差开头", structure: "痛点到方案" },
      },
    ])

    expect(sources[0]).toMatchObject({
      category: "benchmark_reference",
      title: "拆解标题",
    })
    expect(sources[0].content).toContain("结构化拆解")
    expect(sources[0].content).toContain("原文摘要")
    expect(sources[0].content).toContain("反差开头")
    expect(sources[0].content).toContain("禁止照抄原句")
  })

  it("puts benchmark sources before selected knowledge and AI HOT", () => {
    const sources = buildTopicSources({
      projectSource: { category: "client_project", title: "项目", content: "项目资料" },
      benchmarkSources: [{ category: "benchmark_reference", title: "对标账号", content: "爆款作品" }],
      videoCopySources: [{ category: "benchmark_reference", title: "对标文案", content: "拆解文案" }],
      selectedKnowledge: [{ category: "daily_inspiration", title: "日常灵感", content: "灵感" }],
      hotTopicSources: [{ category: "industry_hot", title: "AI HOT", content: "热点" }],
    })

    expect(sources.map((source) => source.title)).toEqual(["项目", "对标账号", "对标文案", "日常灵感", "AI HOT"])
  })

  it("prioritizes imported benchmark knowledge ahead of other selected knowledge", () => {
    const sources = buildTopicSources({
      projectSource: { category: "client_project", title: "项目", content: "项目资料" },
      benchmarkSources: [],
      videoCopySources: [],
      selectedKnowledge: [
        { category: "daily_inspiration", title: "灵感便签", content: "随手记" },
        { category: "benchmark_reference", title: "23账号结构资产", content: "S级/A级 选题资产" },
      ],
      hotTopicSources: [{ category: "industry_hot", title: "AI HOT", content: "热点" }],
    })

    expect(sources.map((source) => source.title)).toEqual(["项目", "23账号结构资产", "灵感便签", "AI HOT"])
  })
})
