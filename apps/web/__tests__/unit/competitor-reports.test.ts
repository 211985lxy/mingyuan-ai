import { describe, expect, it } from "vitest"

import { buildCompetitorReportsPath } from "@/lib/api/client"
import { buildPublicVideoUrl } from "@/lib/competitor-analysis/analyzer"
import { buildCompetitorDiagnosisViewModel } from "@/lib/competitor-diagnosis/build-view-model"
import type { ApiCompetitorAnalysis } from "@/types/api"

describe("competitor report paths", () => {
  it("filters reports by target account url", () => {
    const path = buildCompetitorReportsPath(1, 10, "https://www.douyin.com/user/sec_user_1")

    expect(path).toBe(
      "/api/competitor/reports?page=1&limit=10&targetUrl=https%3A%2F%2Fwww.douyin.com%2Fuser%2Fsec_user_1",
    )
  })

  it("builds public Douyin video links for top videos", () => {
    expect(buildPublicVideoUrl({ videoId: "123", videoUrl: "" })).toBe("https://www.douyin.com/video/123")
    expect(buildPublicVideoUrl({ videoId: "123", videoUrl: "https://www.douyin.com/video/456" })).toBe(
      "https://www.douyin.com/video/456",
    )
  })

  it("keeps strategic falsification out of the visible diagnosis model", () => {
    const vm = buildCompetitorDiagnosisViewModel({
      id: "a1",
      status: "completed",
      platform: "douyin",
      targetUrl: "https://www.douyin.com/user/sec_user_1",
      accountName: "测试账号",
      accountAvatar: null,
      followerCount: 1000,
      videoCount: 10,
      accountSignature: null,
      accountTotalLikes: null,
      accountFollowingCount: null,
      accountIsVerified: false,
      accountVerifyInfo: null,
      metricsData: null,
      overallScore: 70,
      collectionSource: null,
      fallbackUsed: false,
      fallbackReason: null,
      errorMessage: null,
      createdAt: "2026-06-30T00:00:00.000Z",
      completedAt: "2026-06-30T00:00:00.000Z",
      analysisResult: {
        scores: {
          content_power: 72,
          growth_power: 60,
          engagement_power: 55,
          monetization_power: 40,
          persona_power: 65,
          operation_power: 50,
          overall: 70,
        },
        sections: {
          account_overview: {
            account_type: "知识型账号",
            content_vertical: "商业",
            positioning: "商业知识",
            differentiator: "",
          },
          content_strategy: {
            topic_distribution: [{ topic: "教程", percentage: 60 }],
            content_formats: [],
            hook_patterns: [],
            posting_frequency: "",
            best_posting_times: "",
            viral_formula: "",
          },
          growth_analysis: { growth_trend: "", growth_drivers: [], follower_quality: "" },
          engagement_analysis: {
            avg_engagement_rate: 0,
            avg_likes: 0,
            avg_comments: 0,
            avg_shares: 0,
            comment_quality: "",
            anomaly_detection: "",
          },
          monetization_analysis: {
            monetization_paths: [],
            product_categories: [],
            estimated_revenue_level: "",
          },
          recommendations: {
            reusable_strategies: [],
            differentiation_points: [],
            action_plan_30d: [],
            risks: [],
          },
        },
        stats: {
          total_videos_analyzed: 0,
          date_range: { from: "2026-06-01", to: "2026-06-30" },
          top_videos: [],
          posting_heatmap: {},
        },
      },
    } satisfies ApiCompetitorAnalysis)

    expect(vm.diagnosisQuestions.map((q) => q.layerName)).not.toContain("战略反证层")
    expect(vm).not.toHaveProperty("bets")
    expect(vm).not.toHaveProperty("falsificationSummary")
  })
})
