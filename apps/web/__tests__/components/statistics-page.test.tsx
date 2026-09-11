import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }))

import StatisticsPage from "@/app/admin/statistics/page"

const overview = {
  period: { from: "2026-09-04", to: "2026-09-10", timezone: "Asia/Shanghai", previousFrom: "2026-08-28", previousTo: "2026-09-03" },
  freshness: [{ source: "aim_execution_trace", lastUpdatedAt: "2026-09-10T00:00:00Z", lagMs: 0, degraded: false }],
  operations: { runCount: 12, successCount: 10, failedCount: 2, staleRunningCount: 1, successRate: 10 / 12, p50DurationMs: 100, p95DurationMs: 300, totalTokens: 1000, totalCostCny: 4.5, coverage: { available: 12, total: 12, ratio: 1 } },
  business: { publishedCount: 3, qualifiedLeadCount: 2, appointmentCount: 1, dealCount: 1, revenue: 19800, paymentCount: 1, paymentAmountCny: null, firstPassAcceptanceRate: 0.8, rewriteRate: 0.1, rejectionRate: 0.1, humanTakeoverCount: 1, p0FailureCount: 0, p1FailureCount: 1, directCostPerSuccess: 4.5, fullyLoadedCost: 8 },
  channels: { days: [{ day: "2026-09-10", "feishu.received": 4 }], total: { "feishu.received": 4 }, degraded: false },
  dailyTrend: [{ day: "2026-09-10", operations: { runCount: 12, successCount: 10, failedCount: 2, successRate: 10 / 12 }, channels: { "feishu.received": 4 } }],
  comparison: { dealCount: { current: 1, previous: 0, delta: null, rate: null }, revenue: { current: 19800, previous: 0, delta: null, rate: null } },
  degradedSources: [],
}

describe("StatisticsPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn((input: string) => input.includes("/api/admin/alerts")
      ? Promise.resolve({ ok: true, json: async () => ({ data: [] }) })
      : Promise.resolve({ ok: true, json: async () => ({ data: overview }) })))
  })

  it("shows operations and business panels side by side", async () => {
    render(<StatisticsPage />)
    expect(await screen.findByText("运营健康")).toBeTruthy()
    expect(screen.getByText("业务结果")).toBeTruthy()
    expect(screen.getByText("执行次数")).toBeTruthy()
    expect(screen.getByText("成交")).toBeTruthy()
    expect(screen.getByText("统一日趋势")).toBeTruthy()
    expect(screen.getByText("渠道日趋势")).toBeTruthy()
  })
})
