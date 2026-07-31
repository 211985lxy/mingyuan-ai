import { describe, expect, it } from "vitest"
import { prepareAnalyticsIngest } from "@/lib/aim/platform-analytics-ingest"
import {
  buildRetroKnowledgeContent,
  buildRetroKnowledgeTags,
  resolveAimKnowledgeCategory,
} from "@/lib/aim/retro-knowledge"
import {
  getAllowedPasteUsages,
  isAnalyticsPasteCandidate,
  resolveInitialPasteUsage,
} from "@/lib/aim/paste-copy-attachment"
import { getAimAgentCapabilities } from "@/lib/aim/agent-capabilities"

describe("prepareAnalyticsIngest", () => {
  const sample = "抖音\n近7天\n播放量：1200\n点赞数：10\n评论数：2"

  it("未选目标时不给可写 body", () => {
    const result = prepareAnalyticsIngest({ text: sample })
    expect(result.status).toBe("need_target")
    if (result.status === "need_target") {
      expect(result.parsed.ok).toBe(true)
      expect(result.message).toContain("成稿")
    }
  })

  it("选中目标后给出 upsert body，且未识别字段不出现", () => {
    const result = prepareAnalyticsIngest({ text: sample, generationId: "gen_1" })
    expect(result.status).toBe("ready")
    if (result.status === "ready") {
      expect(result.body.views).toBe(1200)
      expect(result.body.likes).toBe(10)
      expect(result.body).not.toHaveProperty("dealCount")
    }
  })

  it("解析失败时失败可见", () => {
    const result = prepareAnalyticsIngest({ text: "今天天气不错", generationId: "gen_1" })
    expect(result.status).toBe("parse_failed")
  })
})

describe("content_retro paste analytics", () => {
  it("能力矩阵为 analytics，用途自动固定", () => {
    const caps = getAimAgentCapabilities("content_retro")
    expect(caps.pasteMode).toBe("analytics")
    expect(getAllowedPasteUsages(caps)).toEqual(["analytics"])
    expect(resolveInitialPasteUsage({
      pasteMode: "analytics",
      allowedUsages: ["analytics"],
    })).toBe("analytics")
  })

  it("短导出文档也可作为复盘粘贴候选", () => {
    expect(isAnalyticsPasteCandidate("播放量 100\n点赞数 1")).toBe(true)
    expect(isAnalyticsPasteCandidate("你好")).toBe(false)
  })
})

describe("retro knowledge", () => {
  it("复盘分类与溯源标签", () => {
    expect(resolveAimKnowledgeCategory("content_retro")).toBe("user_insight")
    expect(buildRetroKnowledgeTags({ generationId: "abc", collectWindowDay: 7, source: "paste" }))
      .toEqual(["aim_retro", "source:paste", "generation:abc", "window:7"])
    expect(buildRetroKnowledgeContent({
      generationId: "abc",
      platform: "douyin",
      metricsSummary: "播放 100",
      retroBody: "五段结论",
    })).toContain("内容 ID：abc")
  })
})
