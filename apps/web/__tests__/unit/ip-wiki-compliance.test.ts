import { describe, expect, it } from "vitest"
import {
  verifyIpWikiCompliance,
  buildIpWikiComplianceRewritePrompt,
  formatIpWikiComplianceIssues,
} from "@/lib/ip-wiki/compliance"
import type { IpWikiPageRow } from "@/lib/ip-wiki/repo"
import type { IpWikiPageType } from "@/lib/ip-wiki/types"

function emptyRow(pageType: IpWikiPageType, frontmatter: Record<string, unknown> = {}): IpWikiPageRow {
  return {
    id: `t-${pageType}`,
    projectId: "p1",
    pageType,
    title: `${pageType}-test`,
    content: "",
    frontmatter,
    sources: [],
    links: [],
    version: 1,
    status: "active",
    updatedAt: "2025-01-01",
  } as unknown as IpWikiPageRow
}

describe("ip-wiki compliance", () => {
  it("无操盘案资料时默认跳过所有判定，返回 ok=true", async () => {
    const result = await verifyIpWikiCompliance(["一条正常的文案"], {})
    expect(result.ok).toBe(true)
    expect(result.issues).toHaveLength(0)
    expect(result.summary).toMatch(/六维度均未发现问题/)
  })

  it("人设页 taboos 命中时生成必改 issue", async () => {
    const pages = {
      persona: emptyRow("persona", {
        taboos: ["最低价", "全网最低", "绝对化"],
      }),
    }
    // 不含自我介绍堆头衔，只看 taboos 命中
    const result = await verifyIpWikiCompliance(
      ["今天给大家讲一下避坑点，这个方案保证全网最低价，千万别错过。"],
      pages,
    )
    expect(result.ok).toBe(false)
    const mustFix = result.issues.filter((i) => i.mustFix)
    expect(mustFix.length).toBeGreaterThanOrEqual(1)
    const tabooIssue = mustFix.find((i) => i.reason.includes("全网最低"))
    expect(tabooIssue).toBeDefined()
    expect(tabooIssue?.dimension).toBe("persona")
  })

  it("自我介绍堆头衔触发人设硬规则必改 issue（patterns 未登记允许）", async () => {
    const pages = { persona: emptyRow("persona", {}) }
    const result = await verifyIpWikiCompliance(
      ["大家好我是XX创始人，从事财税行业15年，是业内知名专家。"],
      pages,
    )
    const introIssue = result.issues.find(
      (i) => i.dimension === "persona" && i.mustFix && /堆头衔开场/.test(i.reason),
    )
    expect(introIssue).toBeDefined()
    expect(introIssue?.suggestedFix).toContain("具体场景/问题/细节")
  })

  it("成交路径 forbiddenCtas 命中时生成必改 issue", async () => {
    const pages = {
      conversion_path: emptyRow("conversion_path", {
        forbiddenCtas: ["立即下单", "马上购买", "点击购买"],
        allowedCtas: ["评论关键词", "私信领取清单"],
      }),
    }
    const result = await verifyIpWikiCompliance(
      ["...讲完痛点后结尾：大家赶紧点击购买，名额有限！"],
      pages,
    )
    const ctaIssue = result.issues.find(
      (i) => i.dimension === "conversion_path" && i.mustFix,
    )
    expect(ctaIssue).toBeDefined()
    expect(ctaIssue?.reason).toContain("点击购买")
  })

  it("buildIpWikiComplianceRewritePrompt 仅在必改问题时返回附录", () => {
    const okResult = { ok: true as const, issues: [], summary: "" }
    expect(buildIpWikiComplianceRewritePrompt(okResult)).toBe("")

    const failResult = {
      ok: false as const,
      summary: "",
      issues: [
        {
          dimension: "persona" as const,
          dimensionLabel: "人设",
          mustFix: true,
          reason: "出现人设页禁止词：最低价",
          suggestedFix: "删掉最低价，换成操盘案里的价值锚点表达",
        },
      ],
    }
    const appendix = buildIpWikiComplianceRewritePrompt(failResult)
    expect(appendix).toContain("【IP 操盘案合规校验未通过")
    expect(appendix).toContain("必须逐条修正")
    expect(appendix).toContain("建议：删掉最低价")
  })

  it("formatIpWikiComplianceIssues 无问题时返回 无问题", () => {
    expect(formatIpWikiComplianceIssues({ ok: true, issues: [], summary: "" })).toBe("无问题")
  })

  it("缺资料时 summary 标注资料不足与缺页", async () => {
    const pages = {
      positioning: emptyRow("positioning", {}),
      persona: emptyRow("persona", {}),
      // 只给 2/6 页，应标注缺 4 页
    }
    const result = await verifyIpWikiCompliance(["一条文案"], pages)
    expect(result.summary).toContain("资料不足")
    expect(result.summary).toContain("内容策略底盘")
    expect(result.summary).toContain("目标人群")
  })
})
