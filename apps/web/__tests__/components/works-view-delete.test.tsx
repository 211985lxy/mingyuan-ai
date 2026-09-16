import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { WorksView } from "@/features/studio/works-view"
import { ConfirmProvider } from "@/components/ui/confirm-dialog"
import type { ApiVideoTask } from "@/types/api"

const listVideoTasks = vi.fn()
const deleteVideoTask = vi.fn()
vi.mock("@/lib/api/client", () => ({
  listVideoTasks: () => listVideoTasks(),
  retryVideoTask: vi.fn(),
  retryVideoTaskTransfer: vi.fn(),
  deleteVideoTask: (id: string) => deleteVideoTask(id),
}))
vi.mock("@/components/voice/voice-history-card", () => ({ VoiceHistoryCard: () => null }))

function task(overrides: Partial<ApiVideoTask> = {}): ApiVideoTask {
  return {
    id: "t1",
    status: "completed",
    provider: "chanjing",
    deliveryStatus: "durable",
    scriptContent: "口播正文",
    avatarName: "李老师",
    videoUrl: "https://example.com/v.mp4",
    createdAt: "2026-09-15T10:00:00Z",
    ...overrides,
  } as ApiVideoTask
}

function renderWorks() {
  return render(
    <ConfirmProvider>
      <WorksView />
    </ConfirmProvider>,
  )
}

beforeEach(() => {
  listVideoTasks.mockReset()
  deleteVideoTask.mockReset()
})

describe("作品页删除任务", () => {
  it("点删除弹确认，确认后调用接口并把该条移出列表", async () => {
    const user = userEvent.setup()
    listVideoTasks.mockResolvedValue([task()])
    deleteVideoTask.mockResolvedValue(undefined)

    renderWorks()
    await user.click(await screen.findByRole("button", { name: "删除该任务记录" }))

    // 确认框明确说明「成片文件不会被删除」，避免用户误以为成片没了
    expect(await screen.findByText("删除任务「李老师」？")).toBeTruthy()
    expect(screen.getByText(/已转存的成片文件不会被删除/)).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "删除" }))

    await waitFor(() => expect(deleteVideoTask).toHaveBeenCalledWith("t1"))
    await waitFor(() => expect(screen.getByText("还没有成片任务")).toBeTruthy())
  })

  it("取消确认时不调用接口，任务保留", async () => {
    const user = userEvent.setup()
    listVideoTasks.mockResolvedValue([task()])

    renderWorks()
    await user.click(await screen.findByRole("button", { name: "删除该任务记录" }))
    await screen.findByText("删除任务「李老师」？")
    await user.click(screen.getByRole("button", { name: "取消" }))

    expect(deleteVideoTask).not.toHaveBeenCalled()
    expect(screen.getByText("李老师")).toBeTruthy()
  })

  it("生成中的任务不可删除（按钮禁用并说明原因）", async () => {
    listVideoTasks.mockResolvedValue([task({ status: "processing" })])

    renderWorks()

    const button = await screen.findByRole("button", { name: "删除该任务记录" })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(button.getAttribute("title")).toContain("生成中")
  })
})
