import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 选题联网线索：组装层。
 *
 * 范围约定（2026-09-16 与业务确认）：**只在选题时搜索，写稿链路不接**——
 * 写稿的知识来源是项目知识库 / IP 档案 / 爆款库；联网搜索会拖慢出稿
 * （链路本就在 115 秒预算边缘）且把不可控的网页噪声引入成稿。
 *
 * 搜索能力本身在 lib/web-search（独立用例覆盖）；这里只测"用什么词搜"与
 * "搜到的东西怎么进 prompt"。
 */

const { runWebSearchMock, enabledMock } = vi.hoisted(() => ({
  runWebSearchMock: vi.fn(),
  enabledMock: vi.fn(() => true),
}))

vi.mock("@/lib/web-search", () => ({
  runWebSearch: runWebSearchMock,
  isWebSearchEnabled: enabledMock,
}))

import {
  buildTopicWebResearchContent,
  buildTopicWebResearchQuery,
  fetchTopicWebResearchSource,
  isTopicWebResearchEnabled,
} from "@/lib/topic-web-research"

const HITS = [
  { title: "多机头热泵并联运行的启停与负荷分配", url: "https://example.com/a", snippet: "群控策略决定多台机组能否均衡运行", publishedAt: "2026-09-15" },
  { title: "热泵系统群控方案对比", url: "https://www.example.org/b", snippet: "从集中控制到分布式联动", publishedAt: null },
]

beforeEach(() => {
  runWebSearchMock.mockReset()
  enabledMock.mockReturnValue(true)
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

describe("线索渲染", () => {
  it("编号列出标题/摘要/来源域名/日期，并声明只用于启发角度", () => {
    const content = buildTopicWebResearchContent("空气源热泵群控", HITS)
    expect(content).toContain("1. 多机头热泵并联运行的启停与负荷分配")
    expect(content).toContain("example.com")
    expect(content).toContain("2026-09-15")
    expect(content).toContain("只用于启发选题角度")
    expect(content).toContain("不要当作事实依据引用")
  })

  it("无日期的条目不留占位符", () => {
    const content = buildTopicWebResearchContent("暖通设备", [HITS[1]!])
    expect(content).toContain("example.org）")
    expect(content).not.toContain("null")
  })
})

describe("组装成选题来源", () => {
  it("搜到结果时生成一条 web_research 来源", async () => {
    runWebSearchMock.mockResolvedValue(HITS)
    const source = await fetchTopicWebResearchSource("空气源热泵群控")
    expect(source?.category).toBe("web_research")
    expect(source?.title).toBe("全网线索：空气源热泵群控")
    expect(source?.content).toContain("多机头热泵并联运行的启停与负荷分配")
    expect(runWebSearchMock).toHaveBeenCalledWith("空气源热泵群控", { limit: 5 })
  })

  it("空搜索词不调用搜索层", async () => {
    expect(await fetchTopicWebResearchSource(null)).toBeNull()
    expect(await fetchTopicWebResearchSource("   ")).toBeNull()
    expect(runWebSearchMock).not.toHaveBeenCalled()
  })

  it("搜索层返回 null（未配 key / 失败 / 空结果）时返回 null，不阻塞选题", async () => {
    runWebSearchMock.mockResolvedValue(null)
    expect(await fetchTopicWebResearchSource("暖通设备")).toBeNull()
  })

  it("能力开关透传自共享层", () => {
    enabledMock.mockReturnValue(false)
    expect(isTopicWebResearchEnabled()).toBe(false)
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
