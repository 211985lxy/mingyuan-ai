import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"

import { WorksView } from "@/features/studio/works-view"

const listVideoTasks = vi.fn()
vi.mock("@/lib/api/client", () => ({
  listVideoTasks: () => listVideoTasks(),
  retryVideoTask: vi.fn(),
  retryVideoTaskTransfer: vi.fn(),
}))

// 配音历史会独立拉取数据，与本次断言无关，置空以隔离
vi.mock("@/components/voice/voice-history-card", () => ({
  VoiceHistoryCard: () => null,
}))

beforeEach(() => {
  listVideoTasks.mockReset()
})

describe("WorksView 加载失败与空数据要区分", () => {
  it("加载失败时显示「读取失败」而不是「还没有成片任务」", async () => {
    listVideoTasks.mockRejectedValueOnce(new Error("网络不可达"))

    render(<WorksView />)

    expect(await screen.findByText("成片列表读取失败")).toBeTruthy()
    expect(screen.getByText("网络不可达")).toBeTruthy()
    // 关键：不能误报为「暂无数据」，否则用户会以为成片丢了
    expect(screen.queryByText("还没有成片任务")).toBeNull()
    expect(screen.getByRole("button", { name: "重新读取" })).toBeTruthy()
  })

  it("真的没有数据时才显示空态与创建引导", async () => {
    listVideoTasks.mockResolvedValueOnce([])

    render(<WorksView />)

    expect(await screen.findByText("还没有成片任务")).toBeTruthy()
    expect(screen.queryByText("成片列表读取失败")).toBeNull()
  })

  it("点「重新读取」会重新拉取", async () => {
    listVideoTasks.mockRejectedValueOnce(new Error("网络不可达"))

    render(<WorksView />)
    const retry = await screen.findByRole("button", { name: "重新读取" })

    listVideoTasks.mockResolvedValueOnce([])
    retry.click()

    await waitFor(() => expect(listVideoTasks).toHaveBeenCalledTimes(2))
    expect(await screen.findByText("还没有成片任务")).toBeTruthy()
  })
})
