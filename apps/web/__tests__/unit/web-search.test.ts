import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 共享搜索层。
 *
 * 选型依据（2026-09-16 实测）：Bing 的 `format=rss` 表面已不可用，且**不报错**——
 * 「某地暴雨内涝」返回斗地主页面、「教师节送礼引发争议」返回教育考试网导航页、
 * 「空气源热泵群控」的加引号短语与换词变体返回同一批「空气」百科页，
 * 而「特斯拉 财报」又正常。任何"至少 N 条"校验都会把垃圾当有效结果放行，
 * 所以统一走 Tavily，并由配置决定开关：没配 key 就明确返回不可用。
 */

const { envMock, fetchMock } = vi.hoisted(() => ({
  envMock: { WEB_SEARCH_API_KEY: undefined as string | undefined },
  fetchMock: vi.fn(),
}))

vi.mock("@/env", () => ({ env: envMock }))

import { isWebSearchEnabled, parseSearchResults, runWebSearch } from "@/lib/web-search"

const TAVILY_PAYLOAD = {
  results: [
    { title: "多机头热泵并联运行的启停与负荷分配", url: "https://example.com/a", content: "群控策略决定多台机组能否均衡运行", published_date: "2026-09-15T00:00:00Z" },
    { title: "热泵系统群控方案对比", url: "https://www.example.org/b", content: "从集中控制到分布式联动", published_date: null },
  ],
}

function respondWith(payload: unknown, ok = true) {
  fetchMock.mockResolvedValue({ ok, status: ok ? 200 : 503, json: async () => payload })
}

beforeEach(() => {
  fetchMock.mockReset()
  // 必须逐用例装：afterEach 会还原真实 fetch，否则后续用例会真的打到 api.tavily.com
  vi.stubGlobal("fetch", fetchMock)
  envMock.WEB_SEARCH_API_KEY = "tvly-test-key"
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("开关：没配 key 就不搜", () => {
  it("未配置时返回不可用，且一次请求都不发", async () => {
    envMock.WEB_SEARCH_API_KEY = undefined
    expect(isWebSearchEnabled()).toBe(false)
    expect(await runWebSearch("暖通设备", { limit: 5 })).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("配置后视为可用", () => {
    expect(isWebSearchEnabled()).toBe(true)
  })
})

describe("解析结果", () => {
  it("字段不全的条目直接丢弃，按 url 去重，并按上限截断", () => {
    const parsed = parseSearchResults({
      results: [
        { title: "有效", url: "https://a.com/1", content: "摘要" },
        { title: "无 url", content: "摘要" },
        { title: "无摘要", url: "https://a.com/2" },
        { title: "重复 url", url: "https://a.com/1", content: "摘要" },
        null,
      ],
    }, 5)
    expect(parsed).toHaveLength(1)
    expect(parsed[0]?.url).toBe("https://a.com/1")
  })

  it("形状不对时返回空数组（不抛错）", () => {
    expect(parseSearchResults(null, 5)).toEqual([])
    expect(parseSearchResults({ results: "不是数组" }, 5)).toEqual([])
    expect(parseSearchResults({}, 5)).toEqual([])
  })

  it("发布日期缺失时留空，不编造", () => {
    const parsed = parseSearchResults({ results: [{ title: "t", url: "https://a.com", content: "c" }] }, 5)
    expect(parsed[0]?.publishedAt).toBeNull()
  })
})

describe("搜索与降级", () => {
  it("按契约发送请求：POST + Bearer + basic 深度 + 条数上限", async () => {
    respondWith(TAVILY_PAYLOAD)
    await runWebSearch("暖通设备", { limit: 5 })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://api.tavily.com/search")
    expect(init.method).toBe("POST")
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tvly-test-key")
    expect(JSON.parse(String(init.body))).toMatchObject({ query: "暖通设备", max_results: 5, search_depth: "basic" })
  })

  it("成功时返回归一化结果", async () => {
    respondWith(TAVILY_PAYLOAD)
    const hits = await runWebSearch("暖通设备", { limit: 5 })
    expect(hits).toHaveLength(2)
    expect(hits?.[0]).toMatchObject({
      title: "多机头热泵并联运行的启停与负荷分配",
      url: "https://example.com/a",
      publishedAt: "2026-09-15",
    })
  })

  it("非 200 返回 null（不抛错）", async () => {
    respondWith({}, false)
    expect(await runWebSearch("暖通设备", { limit: 5 })).toBeNull()
  })

  it("结果为空时返回 null", async () => {
    respondWith({ results: [] })
    expect(await runWebSearch("暖通设备", { limit: 5 })).toBeNull()
  })

  it("请求抛错（超时/网络）时返回 null", async () => {
    fetchMock.mockRejectedValue(new Error("fetch failed"))
    expect(await runWebSearch("暖通设备", { limit: 5 })).toBeNull()
  })

  it("空查询词直接返回 null，不发请求", async () => {
    expect(await runWebSearch("   ", { limit: 5 })).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
