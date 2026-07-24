/**
 * ContentPackagePanel 状态同步回归测试。
 *
 * 对应已修复的 bug：`selected` 初始化后不随 `available` 缩减，
 * 导致生成成功后按钮计数虚高、并会把已完成格式重复发给后端重新生成。
 *
 * 关键回归断言：生成成功后再次勾选并生成，只发送新勾选的可用格式，
 * 绝不重发已完成格式（旧实现下会发送 4 个，其中 3 个是已完成的）。
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { ContentPackagePanel } from "@/components/aim/content-package-panel"
import type { AimGenerateResponse } from "@/lib/api/client"

const confirmedCanonical = {
  schemaVersion: 1,
  version: 1,
  status: "confirmed",
  coreMessage: "核心观点：把供暖改造这件事讲清楚",
}

function makeDeliverables(
  results: Array<{ format: string; content: string }> = [],
): AimGenerateResponse {
  return {
    id: "gen-1",
    taskSpec: { canonical: confirmedCanonical },
    results,
  } as unknown as AimGenerateResponse
}

describe("ContentPackagePanel 状态同步（已修 bug 回归）", () => {
  it("生成成功后，已完成格式不再被选中、不会被重复发送", async () => {
    const user = userEvent.setup()
    const onGeneratePackage = vi.fn()
    const { rerender } = render(
      <ContentPackagePanel
        deliverables={makeDeliverables()}
        isBusy={false}
        onGeneratePackage={onGeneratePackage}
      />,
    )

    // 打开多选面板
    await user.click(screen.getByRole("button", { name: "拆成多平台" }))

    // 初始默认选中前 3 个可用格式
    const firstButton = screen.getByRole("button", { name: /一次生成 3 个格式/ })
    expect(firstButton).toBeInTheDocument()

    // 触发第一批生成
    await user.click(firstButton)
    expect(onGeneratePackage).toHaveBeenCalledTimes(1)
    const firstBatch = onGeneratePackage.mock.calls[0][0] as string[]
    expect(firstBatch).toHaveLength(3)

    // 模拟生成成功：这 3 个格式均已有正文
    const doneResults = firstBatch.map((format) => ({
      format,
      content: "已生成的正文内容，长度足够，可发布。",
    }))
    rerender(
      <ContentPackagePanel
        deliverables={makeDeliverables(doneResults)}
        isBusy={false}
        onGeneratePackage={onGeneratePackage}
      />,
    )

    // 已完成格式从可选列表消失（短视频口播 = video_script）
    expect(screen.queryByRole("button", { name: "短视频口播" })).not.toBeInTheDocument()

    // 勾选一个剩余可用格式（朋友圈文案 = moments_post）
    await user.click(screen.getByRole("button", { name: "朋友圈文案" }))

    // 关键回归：按钮计数只算有效勾选（1 个），而非把 3 个已完成格式也算进去（4 个）
    await user.click(screen.getByRole("button", { name: /一次生成 1 个格式/ }))
    expect(onGeneratePackage).toHaveBeenCalledTimes(2)
    expect(onGeneratePackage.mock.calls[1][0]).toEqual(["moments_post"])
  })

  it("全部格式完成后，生成按钮不可用且不发送任何格式", () => {
    const onGeneratePackage = vi.fn()
    const allDone = [
      { format: "video_script", content: "口播正文".repeat(5) },
      { format: "xiaohongshu_post", content: "小红书正文".repeat(5) },
      { format: "wechat_article", content: "公众号正文".repeat(5) },
      { format: "moments_post", content: "朋友圈正文".repeat(5) },
      { format: "shooting_brief", content: "拍摄交接单正文".repeat(5) },
    ]
    render(
      <ContentPackagePanel
        deliverables={makeDeliverables(allDone)}
        isBusy={false}
        onGeneratePackage={onGeneratePackage}
      />,
    )

    // 全部格式完成后：展开按钮禁用，无法再发起生成
    const toggleButton = screen.getByRole("button", { name: "拆成多平台" })
    expect(toggleButton).toBeDisabled()
    expect(screen.queryByRole("button", { name: /一次生成/ })).not.toBeInTheDocument()
    expect(onGeneratePackage).not.toHaveBeenCalled()
  })

  it("母内容未确认时不展示多选面板", () => {
    const deliverables = {
      id: "gen-1",
      taskSpec: { canonical: { ...confirmedCanonical, status: "draft" } },
      results: [],
    } as unknown as AimGenerateResponse
    render(
      <ContentPackagePanel
        deliverables={deliverables}
        isBusy={false}
        onGeneratePackage={vi.fn()}
      />,
    )
    expect(screen.queryByRole("button", { name: "拆成多平台" })).not.toBeInTheDocument()
    expect(screen.getByText(/确认母内容后/)).toBeInTheDocument()
  })
})
