import { describe, expect, it } from "vitest"

import {
  buildBenchmarkMethodologyPage,
  hasBenchmarkMethodologyMaterial,
} from "@/lib/aim/benchmark-methodology-save"

describe("对标拆解存为爆款方法论页", () => {
  it("只有原文或只有拆解都允许沉淀，两者都没有则不生成", () => {
    expect(hasBenchmarkMethodologyMaterial({ sourceOriginalText: "原文", sourceAnalysisText: "" })).toBe(true)
    expect(hasBenchmarkMethodologyMaterial({ sourceOriginalText: "", sourceAnalysisText: "拆解" })).toBe(true)
    expect(hasBenchmarkMethodologyMaterial({})).toBe(false)
    expect(buildBenchmarkMethodologyPage({})).toBeNull()
  })

  it("标题优先用选题标题，缺失时退回原文开头", () => {
    const page = buildBenchmarkMethodologyPage({
      sourceOriginalText: "他是我见过最傻的螺蛳粉店老板。为什么说他傻？",
      sourceAnalysisText: "结构：傻人设开场 → 反差细节 → 员工视角 → 收口金句",
      sourceTopicTitle: "螺蛳粉傻老板",
    })
    expect(page?.pageType).toBe("viral_methodology")
    expect(page?.title).toBe("爆款方法论·螺蛳粉傻老板")
    expect(page?.frontmatter.origin).toBe("benchmark_save")
    expect(page?.content).toContain("## 对标原文")
    expect(page?.content).toContain("## 结构拆解（怎么写）")
  })

  it("无标题时用原文前 12 字做标题，超长内容截断到 8000 字", () => {
    const page = buildBenchmarkMethodologyPage({
      sourceOriginalText: "零一二三四五六七八九".repeat(1000),
      sourceAnalysisText: "",
    })
    expect(page?.title).toBe("爆款方法论·零一二三四五六七八九零一")
    expect(page?.content.length).toBeLessThanOrEqual(8000)
  })
})
