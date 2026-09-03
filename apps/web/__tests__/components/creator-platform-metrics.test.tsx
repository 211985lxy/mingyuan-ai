import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { CreatorPlatformMetrics } from "@/features/aim/components/creator-platform-metrics"
import type { CreatorMetricsResult } from "@/lib/api/creator-metrics"

// 创作者平台表现组件：ok / not_configured / error 三态 + 数据展示。

const okMetrics: CreatorMetricsResult = {
  status: "ok",
  fetchedAt: "2026-09-03T08:00:00.000Z",
  lastSyncedAt: "2026-09-03T07:30:00.000Z",
  posts: [],
  skipped: 0,
  warnings: [],
  period: { start: "2026-08-27T00:00:00.000Z", end: "2026-09-03T00:00:00.000Z", publishedCount: 3, views: 15000, interactions: 460 },
  platformTotals: [
    { platform: "douyin", label: "抖音", posts: 2, views: 12000, likes: 300, comments: 40, shares: 60, collects: 25 },
    { platform: "xiaohongshu", label: "小红书", posts: 1, views: 3000, likes: 35, comments: 25, shares: null, collects: null },
  ],
}

describe("CreatorPlatformMetrics", () => {
  it("未加载时渲染 null", () => {
    const { container } = render(<CreatorPlatformMetrics metrics={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("not_configured 展示配置引导，不出现自动同步徽标", () => {
    render(<CreatorPlatformMetrics metrics={{ status: "not_configured", message: "未配置" }} />)
    expect(screen.getByLabelText("创作者平台表现").textContent).toContain("自动同步未配置")
    expect(screen.getByLabelText("创作者平台表现").textContent).toContain("人工回填")
    expect(screen.queryByText("自动同步")).not.toBeInTheDocument()
  })

  it("error 展示可行动错误信息", () => {
    render(<CreatorPlatformMetrics metrics={{ status: "error", message: "base 不存在或无权限" }} />)
    expect(screen.getByLabelText("创作者平台表现").textContent).toContain("base 不存在或无权限")
    expect(screen.getByLabelText("创作者平台表现").textContent).toContain("人工回填")
  })

  it("ok 展示自动同步徽标、周期汇总与平台汇总，万级播放格式化", () => {
    render(<CreatorPlatformMetrics metrics={okMetrics} />)
    const section = screen.getByLabelText("创作者平台表现")
    expect(screen.getByText("自动同步")).toBeInTheDocument()
    expect(section.textContent).toContain("本周期发布 3 条")
    expect(section.textContent).toContain("播放 1.5w")
    expect(section.textContent).toContain("数据截至")
    expect(screen.getByText("抖音（2 条）")).toBeInTheDocument()
    expect(screen.getByText("小红书（1 条）")).toBeInTheDocument()
    expect(screen.getByText(/播放 3000/)).toBeInTheDocument()
    expect(screen.getByText(/分 — · 藏 —/)).toBeInTheDocument()
  })

  it("ok 但日志缺失时提示新鲜度未知；warnings 显式透出", () => {
    const metrics: CreatorMetricsResult = {
      ...okMetrics,
      lastSyncedAt: null,
      warnings: ["同步日志表读取失败，无法判断数据新鲜度：权限不足"],
    }
    render(<CreatorPlatformMetrics metrics={metrics} />)
    expect(screen.getByLabelText("创作者平台表现").textContent).toContain("未知（未读同步日志）")
    expect(screen.getByLabelText("创作者平台表现").textContent).toContain("同步日志表读取失败")
  })
})
