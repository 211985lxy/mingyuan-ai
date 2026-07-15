import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { MonitoredAccountGrid } from "@/components/competitor/monitored-account-grid"
import { RecentReportsCard } from "@/components/competitor/recent-reports-card"
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
})
