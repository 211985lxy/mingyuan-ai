import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { AudioSegmentEditor } from "@/features/studio/audio-segment-editor"
import type { SegmentStatus } from "@/lib/voice/segment-audio"

const segments = ["第一段正文。", "第二段正文。", "第三段正文。"]
const ready: SegmentStatus[] = ["ready", "ready", "ready"]

function renderEditor(overrides: Partial<Parameters<typeof AudioSegmentEditor>[0]> = {}) {
  const onRegenerate = vi.fn()
  render(
    <AudioSegmentEditor
      segments={segments}
      statuses={ready}
      segmentUrls={[null, null, null]}
      busy={false}
      onRegenerate={onRegenerate}
      {...overrides}
    />,
  )
  return { onRegenerate }
}

describe("AudioSegmentEditor", () => {
  it("只有一段时不渲染（整体试听已覆盖，列出来是噪音）", () => {
    render(
      <AudioSegmentEditor
        segments={["单段文案。"]}
        statuses={["ready"]}
        segmentUrls={[null]}
        busy={false}
        onRegenerate={vi.fn()}
      />,
    )
    expect(screen.queryByText(/分段试听/)).toBeNull()
  })

  it("多段时逐段列出，并提示可单独重生成", () => {
    renderEditor()

    expect(screen.getByText("分段试听（3 段）")).toBeTruthy()
    expect(screen.getByText("第一段正文。")).toBeTruthy()
    expect(screen.getByText("第三段正文。")).toBeTruthy()
    expect(screen.getByText("某段不满意可单独重生成，不用整篇重跑")).toBeTruthy()
  })

  it("点击「重生成该段」传出对应下标（只重跑该段）", async () => {
    const user = userEvent.setup()
    const { onRegenerate } = renderEditor()

    await user.click(screen.getAllByRole("button", { name: /重生成该段/ })[1])

    expect(onRegenerate).toHaveBeenCalledWith(1)
    expect(onRegenerate).toHaveBeenCalledTimes(1)
  })

  it("某段失败时该行显示重试入口，不影响其他段", () => {
    renderEditor({ statuses: ["ready", "error", "ready"] })

    expect(screen.getByRole("button", { name: /重试该段/ })).toBeTruthy()
    expect(screen.getAllByRole("button", { name: /重生成该段/ })).toHaveLength(2)
    expect(screen.getByText("已就绪 2/3")).toBeTruthy()
  })

  it("合成中禁用按钮并显示进度，避免重复提交", () => {
    renderEditor({ statuses: ["ready", "loading", "loading"], busy: true })

    expect(screen.getByText("已就绪 1/3")).toBeTruthy()
    for (const button of screen.getAllByRole("button")) {
      expect((button as HTMLButtonElement).disabled).toBe(true)
    }
  })
})
