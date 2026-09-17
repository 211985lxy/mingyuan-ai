import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 选题联网线索。
 *
 * 业务约定（2026-09-16）：**只在选题时搜索，写稿链路不接**——写稿的知识来源是
 * 项目知识库 / IP 档案 / 爆款库；联网搜索会拖慢出稿（链路本就在 115 秒预算边缘），
 * 且把不可控的网页噪声引入成稿。
 *
 * 数据源选型：曾用 Bing 的 `format=rss`（零成本纯 HTTP），实测该表面已不可用——
 * 「空气源热泵群控」及其加引号短语、换词变体返回的是同一批无关缓存结果，
 * 而「特斯拉 财报」又正常（微软已退役 Bing Search API）。故改用 Tavily，
 * 并把开关交给配置：**没配 key 就不联网**，而不是降级到返回垃圾的免费表面。
 */

const { envMock, fetchMock } = vi.hoisted(() => ({
  envMock: { TOPIC_WEB_SEARCH_API_KEY: undefined as string | undefined },
  fetchMock: vi.fn(),
}))

vi.mock("@/env", () => ({ env: envMock }))

import {
  buildTopicWebResearchQuery,
  fetchTopicWebResearchSource,
  isTopicWebResearchEnabled,
  parseTopicSearchResults,
} from "@/lib/topic-web-research"

const TAVILY_PAYLOAD = {
  results: [
    {
      title: "多机头热泵并联运行的启停与负荷分配",
      url: "https://example.com/a",
      content: "群控策略决定多台机组能否均衡运行",
      score: 0.9,
      published_date: "2026-09-15T00:00:00Z",
    },
    {
      title: "热泵系统群控方案对比",
      url: "https://www.example.org/b",
      content: "从集中控制到分布式联动的几种做法",
      score: 0.7,
    },
  ],
}

function respondWith(payload: unknown, ok = true) {
  fetchMock.mockResolvedValue({ ok, status: ok ? 200 : 503, json: async () => payload })
}

beforeEach(() => {
  fetchMock.mockReset()
  // 必须逐用例装：afterEach 的 unstubAllGlobals 会还原真实 fetch，
  // 否则后续用例会真的发到 api.tavily.com
  vi.stubGlobal("fetch", fetchMock)
  envMock.TOPIC_WEB_SEARCH_API_KEY = "tvly-test-key"
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("搜索词构建", () => {
  it("内容支柱主题优先于行业与目标客户（更具体，命中率更高）", () => {
    expect(buildTopicWebResearchQuery({
      industry: "暖通设备",
      targetCustomer: "工程商",
      contentThemeNames: ["空气源热泵群控", "行业趋势"],
    })).toBe("空气源热泵群控")
  })

  it("没有内容主题时退到行业，再退到目标客户", () => {
    expect(buildTopicWebResearchQuery({ industry: "暖通设备", targetCustomer: "工程商" })).toBe("暖通设备")
    expect(buildTopicWebResearchQuery({ targetCustomer: "工程商" })).toBe("工程商")
  })

  it("空主题跳过，取下一个可用词", () => {
    expect(buildTopicWebResearchQuery({ industry: "暖通设备", contentThemeNames: ["   ", ""] })).toBe("暖通设备")
  })

  it("没有可用词时返回 null（不搜，也不报错）", () => {
    expect(buildTopicWebResearchQuery({})).toBeNull()
    expect(buildTopicWebResearchQuery({ industry: "  ", targetCustomer: "x" })).toBeNull()
    expect(buildTopicWebResearchQuery({ contentThemeNames: [] })).toBeNull()
  })

  it("过长的主题词截断，避免拼出宽泛查询", () => {
    expect(buildTopicWebResearchQuery({ industry: "空".repeat(80) })).toHaveLength(40)
  })
})

describe("解析搜索结果", () => {
  it("只保留字段完整的条目，并按 url 去重", () => {
    const parsed = parseTopicSearchResults({
      results: [
        { title: "有效", url: "https://a.com/1", content: "摘要" },
        { title: "无 url", content: "摘要" },
        { title: "无摘要", url: "https://a.com/2" },
        { title: "重复 url", url: "https://a.com/1", content: "摘要" },
        null,
      ],
    })
    expect(parsed).toHaveLength(1)
    expect(parsed[0]?.url).toBe("https://a.com/1")
  })

  it("响应形状不对时返回空数组（不抛错）", () => {
    expect(parseTopicSearchResults(null)).toEqual([])
    expect(parseTopicSearchResults({ results: "不是数组" })).toEqual([])
    expect(parseTopicSearchResults({})).toEqual([])
  })

  it("发布日期缺失时留空，不编造", () => {
    expect(parseTopicSearchResults({ results: [{ title: "t", url: "https://a.com", content: "c" }] })[0]?.publishedAt)
      .toBeNull()
  })
})

describe("未配置搜索能力：不联网，也不降级到免费表面", () => {
  it("没有 key 时直接返回 null，连请求都不发", async () => {
    envMock.TOPIC_WEB_SEARCH_API_KEY = undefined
    expect(isTopicWebResearchEnabled()).toBe(false)
    expect(await fetchTopicWebResearchSource("空气源热泵群控")).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("配置了 key 才算启用", () => {
    expect(isTopicWebResearchEnabled()).toBe(true)
  })
})

describe("搜索与降级：联网是可选增强，绝不阻塞选题", () => {
  it("空搜索词直接返回 null", async () => {
    expect(await fetchTopicWebResearchSource(null)).toBeNull()
    expect(await fetchTopicWebResearchSource("   ")).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("搜索成功时组装成一条「全网线索」来源", async () => {
    respondWith(TAVILY_PAYLOAD)
    const source = await fetchTopicWebResearchSource("空气源热泵群控")
    expect(source?.category).toBe("web_research")
    expect(source?.title).toBe("全网线索：空气源热泵群控")
    expect(source?.content).toContain("1. 多机头热泵并联运行的启停与负荷分配")
    expect(source?.content).toContain("example.com")
    expect(source?.content).toContain("2026-09-15")
    expect(source?.content).toContain("只用于启发选题角度")
  })

  it("按契约发送请求：Bearer 鉴权 + basic 深度", async () => {
    respondWith(TAVILY_PAYLOAD)
    await fetchTopicWebResearchSource("暖通设备")
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://api.tavily.com/search")
    expect(init.method).toBe("POST")
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tvly-test-key")
    expect(JSON.parse(String(init.body))).toMatchObject({ query: "暖通设备", search_depth: "basic" })
  })

  it("非 200 返回 null（不抛错、不中断选题）", async () => {
    respondWith({}, false)
    expect(await fetchTopicWebResearchSource("暖通设备")).toBeNull()
  })

  it("结果为空时返回 null", async () => {
    respondWith({ results: [] })
    expect(await fetchTopicWebResearchSource("暖通设备")).toBeNull()
  })

  it("请求抛错（超时/网络）时返回 null", async () => {
    fetchMock.mockRejectedValue(new Error("fetch failed"))
    expect(await fetchTopicWebResearchSource("暖通设备")).toBeNull()
  })
})

describe("边界：联网线索只进选题，不进写稿链路", () => {
  const ALLOWED_IMPORTERS = new Set([
    "features/topics/services/topic-selection-generation.ts",
  ])

  function collectSourceFiles(dir: string): string[] {
    return readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
      .map((entry) => join(entry.parentPath ?? dir, entry.name).replace(`${dir}/`, ""))
  }

  it("只有选题生成服务引用它", () => {
    const importers = collectSourceFiles(join(process.cwd(), "src"))
      .filter((relative) => readFileSync(join(process.cwd(), "src", relative), "utf8")
        .includes("@/lib/topic-web-research"))
    expect(importers.sort()).toEqual([...ALLOWED_IMPORTERS].sort())
  })
})
