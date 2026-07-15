import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { EvidenceDashboard } from "@/components/competitor-diagnosis/evidence-dashboard"
import type { EvidenceData } from "@/lib/competitor-diagnosis/types"

describe("competitor report components", () => {
  it("renders the evidence metrics, top videos and posting heatmap", () => {
    const evidence: EvidenceData = {
      topVideos: [{
        title: "高互动样本",
        views: 12000,
        likes: 860,
        engagement_rate: 8.6,
        url: "https://example.com/video/1",
      }],
      postingHeatmap: { "1-9": 3 },
      avgEngagementRate: 5.25,
      avgLikes: 3200,
      avgComments: 180,
      avgShares: 75,
    }

    const html = renderToStaticMarkup(createElement(EvidenceDashboard, { evidence }))

    expect(html).toContain("数据证据")
    expect(html).toContain("5.25%")
    expect(html).toContain("高互动样本")
    expect(html).toContain("发布时间热力图")
    expect(html).toContain("https://example.com/video/1")
  })
})
