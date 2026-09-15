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
      onTextChange={vi.fn()}
      segmentVoices={[null, null, null]}
      voices={[]}
      defaultVoiceTitle="默认音色"
      onVoiceChange={vi.fn()}
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
        onTextChange={vi.fn()}
        segmentVoices={[null]}
        voices={[]}
        defaultVoiceTitle="默认音色"
        onVoiceChange={vi.fn()}
      />,
    )
    expect(screen.queryByText(/分段试听/)).toBeNull()
  })

  it("多段时逐段列出，并提示可单独重生成", () => {
    renderEditor()

    expect(screen.getByText("分段试听（3 段）")).toBeTruthy()
    expect(screen.getByText("第一段正文。")).toBeTruthy()
    expect(screen.getByText("第三段正文。")).toBeTruthy()
    expect(screen.getByText("可直接改某段文字并只重生成该段，不用整篇重跑")).toBeTruthy()
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

  it("合成中禁用重生成按钮并显示进度，避免重复提交", () => {
    renderEditor({ statuses: ["ready", "loading", "loading"], busy: true })

    expect(screen.getByText("已就绪 1/3")).toBeTruthy()
    for (const button of screen.getAllByRole("button", { name: /重生成该段|重试该段/ })) {
      expect((button as HTMLButtonElement).disabled).toBe(true)
    }
  })

  it("有可切换音色时露出音色选择，默认项标注（默认）", async () => {
    const user = userEvent.setup()
    renderEditor({
      voices: [
        { id: "v1", title: "沉稳男声" },
        { id: "v2", title: "活泼女声" },
      ],
    })

    await user.click(screen.getAllByRole("combobox", { name: "该段音色" })[0])

    expect(await screen.findByText("默认音色（默认）")).toBeTruthy()
    expect(screen.getByText("沉稳男声")).toBeTruthy()
    expect(screen.getByText("活泼女声")).toBeTruthy()
  })

  it("无可切换音色时不渲染音色选择（不干扰主流程）", () => {
    renderEditor({ voices: [] })
    expect(screen.queryByRole("combobox", { name: "该段音色" })).toBeNull()
  })

  it("切换某段音色时回调该段下标", async () => {
    const user = userEvent.setup()
    const onVoiceChange = vi.fn()
    renderEditor({
      voices: [{ id: "v1", title: "沉稳男声" }],
      onVoiceChange,
    })

    await user.click(screen.getAllByRole("combobox", { name: "该段音色" })[1])
    await user.click(await screen.findByText("沉稳男声"))

    expect(onVoiceChange).toHaveBeenCalledWith(1, "v1")
  })

  it("点击段文字进入编辑态，保存后回调新文字", async () => {
    const user = userEvent.setup()
    const onTextChange = vi.fn()
    renderEditor({ onTextChange })

    await user.click(screen.getByRole("button", { name: "第二段正文。" }))
    const textarea = screen.getByRole("textbox", { name: "第 2 段文字" })
    await user.clear(textarea)
    await user.type(textarea, "改过的第二段。")
    await user.click(screen.getByRole("button", { name: "保存文字" }))

    expect(onTextChange).toHaveBeenCalledWith(1, "改过的第二段。")
  })

  it("编辑态按 Esc 取消，不触发回调", async () => {
    const user = userEvent.setup()
    const onTextChange = vi.fn()
    renderEditor({ onTextChange })

    await user.click(screen.getByRole("button", { name: "第一段正文。" }))
    const textarea = screen.getByRole("textbox", { name: "第 1 段文字" })
    await user.type(textarea, "临时改动")
    await user.keyboard("{Escape}")

    expect(onTextChange).not.toHaveBeenCalled()
    expect(screen.queryByRole("textbox")).toBeNull()
  })
})
