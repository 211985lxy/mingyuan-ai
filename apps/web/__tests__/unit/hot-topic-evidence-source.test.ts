import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 热点证据的来源选择。
 *
 * 回归背景（2026-09-16 实测）：`fetchSearchEvidence` 原先只用 Bing 的 `format=rss`，
 * 而该表面已不可用且**不报错**——「某地暴雨内涝」返回斗地主页面、
 * 「教师节送礼引发争议」返回教育考试网导航页、「小米发布新一代自研芯片」
 * 返回小米商城/招聘/售后导航页。由于下游只校验"至少 N 条"，垃圾被当作
 * 有效证据放行，模型据此生成"事实核实过的洞察"。
 *
 * 修法：共享搜索层（Tavily）可用时走可靠源；未配置时**退回既有实现**，
 * 保持零回归——而不是让热点洞察在缺 key 时直接失败。
 */

const { runWebSearchMock, enabledMock, fetchMock } = vi.hoisted(() => ({
  runWebSearchMock: vi.fn(),
  enabledMock: vi.fn(() => true),
  fetchMock: vi.fn(),
}))

vi.mock("@/lib/web-search", () => ({
  runWebSearch: runWebSearchMock,
  isWebSearchEnabled: enabledMock,
}))

import { fetchSearchEvidence } from "@/lib/hot-topic-intelligence/evidence"
import { HotTopicIntelligenceError } from "@/lib/hot-topic-intelligence/types"

const RSS_WITH_TWO_ITEMS = `<rss><channel>
<item><title>暴雨预警发布</title><description>多地启动应急响应</description><link>https://news.example.com/1</link></item>
<item><title>内涝路段已封控</title><description>排水作业连夜进行</description><link>https://news.example.com/2</link></item>
</channel></rss>`

beforeEach(() => {
  runWebSearchMock.mockReset()
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
  enabledMock.mockReturnValue(true)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("配了共享搜索层：走可靠源", () => {
  it("把搜索结果映射成证据，且不再打 Bing", async () => {
    runWebSearchMock.mockResolvedValue([
      { title: "多地暴雨预警", url: "https://news.example.com/a", snippet: "气象台连续发布预警", publishedAt: "2026-09-15" },
      { title: "城市内涝处置进展", url: "https://news.example.com/b", snippet: "排水与交通管制同步推进", publishedAt: null },
    ])

    const evidence = await fetchSearchEvidence("某地暴雨内涝")

    expect(evidence).toHaveLength(2)
    expect(evidence[0]).toMatchObject({
      title: "多地暴雨预警",
      url: "https://news.example.com/a",
      publishedAt: "2026-09-15",
    })
    expect(runWebSearchMock).toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("可靠源拿不到证据时抛既有错误类型（语义不变）", async () => {
    runWebSearchMock.mockResolvedValue(null)
    await expect(fetchSearchEvidence("某地暴雨内涝")).rejects.toBeInstanceOf(HotTopicIntelligenceError)
  })
})

describe("未配共享搜索层：退回既有实现（零回归）", () => {
  it("走 Bing RSS 路径并返回证据", async () => {
    enabledMock.mockReturnValue(false)
    fetchMock.mockResolvedValue({ ok: true, text: async () => RSS_WITH_TWO_ITEMS })

    const evidence = await fetchSearchEvidence("某地暴雨内涝")

    expect(evidence.length).toBeGreaterThanOrEqual(2)
    expect(evidence[0]?.url).toContain("news.example.com")
    expect(runWebSearchMock).not.toHaveBeenCalled()
  })

  it("Bing 也拿不到时抛错，不静默返回空数组", async () => {
    enabledMock.mockReturnValue(false)
    fetchMock.mockResolvedValue({ ok: true, text: async () => "<rss><channel></channel></rss>" })
    await expect(fetchSearchEvidence("某地暴雨内涝")).rejects.toBeInstanceOf(HotTopicIntelligenceError)
  })
})
