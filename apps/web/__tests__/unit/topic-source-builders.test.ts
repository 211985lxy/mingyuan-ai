import { describe, expect, it } from "vitest"
import { buildTopicSources } from "@/lib/topic-source-builders"

describe("buildTopicSources", () => {
  it("keeps benchmark and hot signals ahead of knowledge when enriched sources exist", () => {
    const sources = buildTopicSources({
      projectSource: { category: "client_project", title: "项目基准线", content: "项目内容" },
      benchmarkSources: [{ category: "benchmark_reference", title: "对标账号", content: "对标内容" }],
      videoCopySources: [{ category: "benchmark_reference", title: "拆解文案", content: "拆解内容" }],
      hotTopicSources: [{ category: "industry_hot", title: "热点", content: "热点内容" }],
      selectedKnowledge: Array.from({ length: 6 }, (_, index) => ({
        category: "user_insight",
        title: `知识库${index + 1}`,
        content: `知识库内容${index + 1}`,
      })),
    })

    expect(sources.map((source) => source.title)).toEqual([
      "项目基准线",
      "对标账号",
      "拆解文案",
      "热点",
      "知识库1",
      "知识库2",
      "知识库3",
      "知识库4",
    ])
  })

  it("keeps full knowledge list when no higher-priority signals exist", () => {
    const sources = buildTopicSources({
      projectSource: null,
      benchmarkSources: [],
      videoCopySources: [],
      hotTopicSources: [],
      selectedKnowledge: Array.from({ length: 5 }, (_, index) => ({
        category: "user_insight",
        title: `知识库${index + 1}`,
        content: `知识库内容${index + 1}`,
      })),
    })

    expect(sources).toHaveLength(5)
    expect(sources[4].title).toBe("知识库5")
  })
})
