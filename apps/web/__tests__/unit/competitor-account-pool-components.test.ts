import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { MonitoredAccountGrid } from "@/components/competitor/monitored-account-grid"
import { RecentReportsCard } from "@/components/competitor/recent-reports-card"
import { CompetitorVideoSections, type CompetitorWatchVideo } from "@/components/competitor/competitor-video-sections"
import { CompetitorAddAccountPanel } from "@/components/competitor/competitor-add-account-panel"
import { CompetitorDiscoveryPanel } from "@/components/competitor/competitor-discovery-panel"
import { CompetitorWebResearchPanel } from "@/components/competitor/competitor-web-research-panel"
import type { WatchAccount } from "@/lib/api/client"
import type { ApiCompetitorReport } from "@/types/api"

const account: WatchAccount = {
  id: "account-1",
  targetUrl: "https://www.douyin.com/user/test-account",
  platform: "douyin",
  platformUserId: "test-account",
  nickname: "测试监控账号",
  avatar: null,
  followerCount: 12500,
  latestVideos: [],
  viralVideos: [],
  refreshStatus: "failed",
  refreshError: "Timeout while loading",
  lastRefreshedAt: null,
  createdAt: "2026-07-15T00:00:00.000Z",
}

describe("competitor account pool components", () => {
  it("renders monitored account status and actions", () => {
    const html = renderToStaticMarkup(createElement(MonitoredAccountGrid, {
      accounts: [account],
      loading: false,
      activeAccountId: account.id,
      analyzingUrl: null,
      refreshingId: null,
      deletingId: null,
      onActivate: () => {},
      onAnalyze: () => {},
      onRefresh: () => {},
      onDelete: () => {},
    }))

    expect(html).toContain("测试监控账号")
    expect(html).toContain("1.3w 粉丝")
    expect(html).toContain("AI 深度调查")
    expect(html).toContain("本地浏览器访问抖音超时")
  })

  it("renders recent report score and status", () => {
    const report: ApiCompetitorReport = {
      id: "report-1",
      platform: "douyin",
      targetUrl: account.targetUrl,
      status: "completed",
      accountName: "测试监控账号",
      accountAvatar: null,
      followerCount: 12500,
      overallScore: 88,
      collectionSource: null,
      fallbackUsed: false,
      fallbackReason: null,
      createdAt: "2026-07-15T00:00:00.000Z",
      completedAt: "2026-07-15T01:00:00.000Z",
      errorMessage: null,
    }
    const html = renderToStaticMarkup(createElement(RecentReportsCard, { reports: [report], loading: false }))

    expect(html).toContain("测试监控账号 · 分析报告")
    expect(html).toContain("88分")
    expect(html).toContain("已完成")
    expect(html).toContain("/competitor/report-1")
  })

  it("renders latest videos, viral rank and completed extraction", () => {
    const video: CompetitorWatchVideo = {
      videoId: "video-1",
      title: "高互动作品",
      coverUrl: "https://example.com/cover.jpg",
      videoUrl: "https://example.com/video/1",
      createTime: 1,
      views: 10000,
      likes: 800,
      comments: 60,
      shares: 20,
      collects: 30,
      engagementScore: 910,
      account,
    }
    const html = renderToStaticMarkup(createElement(CompetitorVideoSections, {
      latestVideos: [video],
      viralVideos: [video],
      extractions: {
        "account-1-video-1": {
          id: "extraction-1",
          sourceUrl: video.videoUrl!,
          platform: "douyin",
          status: "completed",
          errorMessage: null,
          analysisError: null,
          videoTitle: video.title,
          videoCover: video.coverUrl,
          videoDuration: "30",
          transcript: "这是原文案",
          analysisResult: { markdown: "## 文案拆解\n核心判断" },
          createdAt: "2026-07-15T00:00:00.000Z",
          updatedAt: "2026-07-15T01:00:00.000Z",
          completedAt: "2026-07-15T01:00:00.000Z",
        },
      },
      extractingVideoId: null,
      onExtract: () => {},
    }))

    expect(html).toContain("最新作品")
    expect(html).toContain("爆款作品")
    expect(html).toContain("TOP 1")
    expect(html).toContain("文案拆解预览")
    expect(html).toContain("生成内容资产包")
  })

  it("keeps monitor, add-account and web-research entries visible", () => {
    const discoveryHtml = renderToStaticMarkup(createElement(CompetitorDiscoveryPanel, {
      activeAccount: account,
      accounts: [account],
      discovering: false,
      discoveryAttempted: false,
      peerAccounts: [],
      leaderAccounts: [],
      ignoredUrls: new Set<string>(),
      adding: false,
      refreshingId: null,
      onActivate: () => {},
      onRefresh: async () => {},
      onDiscover: async () => {},
      onAdd: async () => {},
      onIgnore: () => {},
    }))
    const addHtml = renderToStaticMarkup(createElement(CompetitorAddAccountPanel, {
      value: "",
      adding: false,
      accountCount: 1,
      onChange: () => {},
      onAdd: async () => {},
    }))
    const researchHtml = renderToStaticMarkup(createElement(CompetitorWebResearchPanel, {
      activeAccount: account,
      query: "",
      loading: false,
      result: null,
      onQueryChange: () => {},
      onResearch: async () => {},
    }))

    expect(discoveryHtml).toContain("监控对标")
    expect(discoveryHtml).toContain("刷新作品池")
    expect(discoveryHtml).toContain("扩展同赛道")
    expect(addHtml).toContain("添加监控账号")
    expect(researchHtml).toContain("全网补证")
    expect(researchHtml).toContain("这里不替你直接下结论")
  })
})
