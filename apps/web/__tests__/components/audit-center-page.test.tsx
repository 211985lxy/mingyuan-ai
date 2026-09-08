import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const searchParams = new URLSearchParams()
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}))

import AuditCenterPage from "@/app/admin/audit-center/page"

function auditEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt-1",
    occurredAt: "2026-09-08T01:02:03.000Z",
    source: "aim",
    category: "execution",
    severity: "info",
    status: "success",
    action: "aim.execute",
    summary: "模型请求成功",
    actorType: "user",
    actorIdHash: "a1b2c3d4e5f6a7b8",
    targetType: "aim_run",
    targetId: "run-1",
    projectId: "project-1",
    environment: "production",
    correlationId: "corr-1",
    requestId: "req-1",
    traceId: "trace-1",
    gitSha: "abcdef1234567890",
    sourceRecordType: "AimExecutionTrace",
    sourceRecordId: "trace-1",
    idempotencyKey: "aim:AimExecutionTrace:trace-1",
    metadata: { provider: "openai" },
    externalLogUrl: null,
    ...overrides,
  }
}

describe("AuditCenterPage", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    fetchMock.mockImplementation((input: string) => {
      if (input.includes("/api/admin/audit-events/evt-1")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { event: auditEvent(), related: [auditEvent(), auditEvent({ id: "evt-2", source: "server", summary: "服务器健康检查" })] } }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: [auditEvent()], total: 1, nextCursor: null }),
      })
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("加载统一事件时间线并显示关键筛选器", async () => {
    render(<AuditCenterPage />)

    expect(await screen.findByText("模型请求成功")).toBeTruthy()
    expect(screen.getByLabelText("事件日期")).toBeTruthy()
    expect(screen.getByLabelText("事件来源")).toBeTruthy()
    expect(screen.getByLabelText("事件类别")).toBeTruthy()
    expect(screen.getByText("统一审计中心")).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/admin/audit-events?"))
  })

  it("点击事件后显示详情和关联链路", async () => {
    const user = userEvent.setup()
    render(<AuditCenterPage />)

    const eventRow = await screen.findByRole("button", { name: /模型请求成功/ })
    await user.click(eventRow)

    expect(await screen.findByText("安全元数据")).toBeTruthy()
    expect(screen.getByText("关联链路")).toBeTruthy()
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/audit-events/evt-1")
    })
    expect(screen.getByText("服务器健康检查")).toBeTruthy()
  })
})
