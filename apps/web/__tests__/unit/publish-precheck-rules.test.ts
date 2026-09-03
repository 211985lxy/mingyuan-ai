import { describe, expect, it } from "vitest"
import {
  EXTRA_COMPLIANCE_RULE_IDS,
  PUBLISH_PRECHECK_RULES,
  runPublishPrecheck,
} from "@/lib/aim/publish-precheck-rules"

describe("publish-precheck-rules Task 10 开关打开时命中 R06~R09", () => {
  const ON = true

  it("R06_brand_tool_word: 「豆包 + 即梦」命中，severity=medium", () => {
    const hits = runPublishPrecheck("这期我们用豆包和即梦做了个 demo", ON)
    const r06 = hits.find((h) => h.ruleId === "R06_brand_tool_word")
    expect(r06).toBeDefined()
    expect(r06!.severity).toBe("medium")
  })

  it("R07_ai_generated_material_flag: 未标注 AI 声明的 Seedream 生成命中 severity=low", () => {
    const hits = runPublishPrecheck("这张图用 Seedream 生成，分享一下心得", ON)
    const r07 = hits.find((h) => h.ruleId === "R07_ai_generated_material_flag")
    expect(r07).toBeDefined()
    expect(r07!.severity).toBe("low")
  })

  it("R08_batch_account_wording: 批量生产内容 + 矩阵号命中 severity=high（封号高危）", () => {
    const hits = runPublishPrecheck("教你批量生产内容，矩阵号一人做 50 号", ON)
    const r08 = hits.find((h) => h.ruleId === "R08_batch_account_wording")
    expect(r08).toBeDefined()
    expect(r08!.severity).toBe("high")
  })

  it("R09_commercial_content_channel: 赞助 + 合作推广命中 severity=medium", () => {
    const hits = runPublishPrecheck("感谢 XX品牌 赞助本期内容，合作推广产品", ON)
    const r09 = hits.find((h) => h.ruleId === "R09_commercial_content_channel")
    expect(r09).toBeDefined()
    expect(r09!.severity).toBe("medium")
  })
})

describe("publish-precheck-rules Task 10 开关关闭时 R06~R09 均 0 命中", () => {
  const OFF = false

  const extraIds = new Set<string>([...EXTRA_COMPLIANCE_RULE_IDS])

  it("开关关：文本 1「豆包 + 即梦」不应命中任何新规则", () => {
    const hits = runPublishPrecheck("这期我们用豆包和即梦做了个 demo", OFF)
    const extraHits = hits.filter((h) => extraIds.has(h.ruleId))
    expect(extraHits).toHaveLength(0)
  })

  it("开关关：文本 2 Seedream 生成文案不应命中任何新规则", () => {
    const hits = runPublishPrecheck("这张图用 Seedream 生成，分享一下心得", OFF)
    const extraHits = hits.filter((h) => extraIds.has(h.ruleId))
    expect(extraHits).toHaveLength(0)
  })

  it("开关关：文本 3 批量生产内容/矩阵号不应命中任何新规则", () => {
    const hits = runPublishPrecheck("教你批量生产内容，矩阵号一人做 50 号", OFF)
    const extraHits = hits.filter((h) => extraIds.has(h.ruleId))
    expect(extraHits).toHaveLength(0)
  })

  it("开关关：文本 4 赞助+合作推广 不应命中任何新规则", () => {
    const hits = runPublishPrecheck("感谢 XX品牌 赞助本期内容，合作推广产品", OFF)
    const extraHits = hits.filter((h) => extraIds.has(h.ruleId))
    expect(extraHits).toHaveLength(0)
  })
})

describe("publish-precheck-rules Task 10 豁免与结构契约", () => {
  it("R06 命中但含豁免词「AI 工具」即清除", () => {
    const hits = runPublishPrecheck(
      "这期我们用豆包和即梦（一款主流 AI 工具）做了 demo",
      true,
    )
    expect(hits.find((h) => h.ruleId === "R06_brand_tool_word")).toBeUndefined()
  })

  it("R07 命中但含「本视频含 AI 创作」声明即清除", () => {
    const hits = runPublishPrecheck(
      "这张图用 Seedream 生成，声明：本视频含 AI 创作。分享心得。",
      true,
    )
    expect(hits.find((h) => h.ruleId === "R07_ai_generated_material_flag")).toBeUndefined()
  })

  it("R09 命中但含「星图」豁免词即清除", () => {
    const hits = runPublishPrecheck(
      "感谢 XX品牌 赞助本期内容，已通过星图合作平台报备。",
      true,
    )
    expect(hits.find((h) => h.ruleId === "R09_commercial_content_channel")).toBeUndefined()
  })

  it("PUBLISH_PRECHECK_RULES 中 R06_* ~ R09_* 四条新规则 id 字段契约完整", () => {
    const ids = PUBLISH_PRECHECK_RULES.map((r) => r.id)
    expect(ids).toEqual(expect.arrayContaining([...EXTRA_COMPLIANCE_RULE_IDS]))
    for (const id of EXTRA_COMPLIANCE_RULE_IDS) {
      const r = PUBLISH_PRECHECK_RULES.find((x) => x.id === id)
      expect(r).toBeDefined()
      expect(["high", "medium", "low", "mid"]).toContain(r!.severity)
      expect(Array.isArray(r!.surfaceTerms)).toBe(true)
      expect(r!.surfaceTerms.length).toBeGreaterThan(0)
      expect(typeof r!.reason).toBe("string")
      expect(typeof r!.suggest).toBe("string")
    }
  })
})
