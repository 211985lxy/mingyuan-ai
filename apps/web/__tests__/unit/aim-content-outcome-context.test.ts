import { describe, expect, it } from "vitest"
import {
  formatPublishOutcomeBlock,
  type AttributionRecordLike,
  type SanitizedOutcomeLike,
} from "@/lib/aim/content-outcome-context"

function outcome(overrides: Partial<SanitizedOutcomeLike> = {}): SanitizedOutcomeLike {
  return {
    collectWindowDay: 7,
    platform: "抖音",
    publishedAt: new Date("2026-07-01T00:00:00.000Z"),
    qualifiedCommentCount: 4,
    dmCount: 2,
    qualifiedLeadCount: 1,
    appointmentCount: 1,
    dealCount: 1,
    revenue: 9800,
    views: 1200,
    likes: 88,
    comments: 16,
    saves: 9,
    shares: 5,
    audienceFeedback: "用户追问了报价",
    userVerdict: null,
    verdictNote: "转化效果不错",
    verdictCode: "effective",
    ...overrides,
  }
}

function attribution(overrides: Partial<AttributionRecordLike> = {}): AttributionRecordLike {
  return {
    externalLeadId: "wx-lead-01",
    externalDealId: null,
    externalPaymentId: null,
    attributionMethod: "explicit",
    occurredAt: new Date("2026-08-20T00:00:00.000Z"),
    ...overrides,
  }
}

describe("formatPublishOutcomeBlock", () => {
  it("完整数据会带出真实数值和单位", () => {
    const result = formatPublishOutcomeBlock({
      outcomes: [outcome()],
      retroSnapshots: [],
    })

    expect(result.hasData).toBe(true)
    expect(result.block).toContain("播放 1200 次")
    expect(result.block).toContain("有效线索 1 条")
    expect(result.block).toContain("营收 9800 元")
    expect(result.block).toContain("判定：有效")
  })

  it("空字段渲染为未填写，不当成零", () => {
    const result = formatPublishOutcomeBlock({
      outcomes: [outcome({ views: null, revenue: null, audienceFeedback: null })],
      retroSnapshots: [],
    })

    expect(result.block).toContain("播放 未填写 次")
    expect(result.block).toContain("营收 未填写 元")
    expect(result.block).toContain("观众反馈：未填写")
    expect(result.block).not.toContain("播放 0 次")
  })

  it("真实零值保留为零", () => {
    const result = formatPublishOutcomeBlock({
      outcomes: [outcome({ views: 0, dealCount: 0, revenue: 0 })],
      retroSnapshots: [],
    })

    expect(result.block).toContain("播放 0 次")
    expect(result.block).toContain("成交 0 单")
    expect(result.block).toContain("营收 0 元")
  })

  it("完全没有数据时给出明确说明且不含数字", () => {
    const result = formatPublishOutcomeBlock({ outcomes: [], retroSnapshots: [] })

    expect(result.hasData).toBe(false)
    expect(result.block).toContain("未登记发布数据")
    expect(result.block).not.toMatch(/\d/)
  })

  it("同时展示多个采集窗口", () => {
    const result = formatPublishOutcomeBlock({
      outcomes: [
        outcome({ collectWindowDay: 7, views: 100 }),
        outcome({ collectWindowDay: 14, views: 300 }),
        outcome({ collectWindowDay: 30, views: 900 }),
      ],
      retroSnapshots: [],
    })

    expect(result.block).toContain("7 天窗口")
    expect(result.block).toContain("14 天窗口")
    expect(result.block).toContain("30 天窗口")
    expect(result.block).toContain("播放 100 次")
    expect(result.block).toContain("播放 300 次")
    expect(result.block).toContain("播放 900 次")
  })

  it("会带出已保存的复盘快照", () => {
    const result = formatPublishOutcomeBlock({
      outcomes: [outcome()],
      retroSnapshots: [{
        summary: "开头有效",
        actualData: "播放完成率更高",
        verdict: "继续使用",
        nextRule: "下次保留同类开头",
      }],
    })

    expect(result.block).toContain("已有复盘")
    expect(result.block).toContain("结论：开头有效")
    expect(result.block).toContain("下次规则：下次保留同类开头")
  })

  it("WP-D：线索归因逐条列出，方式如实呈现、不明不许美化", () => {
    const result = formatPublishOutcomeBlock({
      outcomes: [],
      retroSnapshots: [],
      attributions: [
        attribution(),
        attribution({
          externalLeadId: "wx-lead-02",
          attributionMethod: "unknown",
          externalDealId: "deal-9",
        }),
      ],
    })

    expect(result.hasData).toBe(true)
    expect(result.block).toContain("线索归因：共 2 条登记")
    expect(result.block).toContain("线索「wx-lead-01」｜明确归因｜未挂成交｜登记 2026-08-20")
    expect(result.block).toContain("线索「wx-lead-02」｜来源不明｜已挂成交/回款｜登记 2026-08-20")
  })

  it("WP-D：有发布数据但没归因记录时，明确提示未登记并引导回登记", () => {
    const result = formatPublishOutcomeBlock({
      outcomes: [outcome()],
      retroSnapshots: [],
      attributions: [],
    })

    expect(result.block).toContain("线索归因：未登记")
    expect(result.block).toContain("回内容卡片登记")
    expect(result.block).not.toContain("线索归因：共")
  })

  it("WP-D：只有线索归因也算有数据，空窗口照常显示未登记", () => {
    const result = formatPublishOutcomeBlock({
      outcomes: [],
      retroSnapshots: [],
      attributions: [attribution()],
    })

    expect(result.hasData).toBe(true)
    expect(result.block).toContain("线索「wx-lead-01」")
    expect(result.block).toContain("7 天窗口：未登记")
  })
})
