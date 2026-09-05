/**
 * AimPromptComposer 粘贴/拖拽文件分流测试。
 *
 * 覆盖：粘贴事件携带文件 → 图片走 onAddImages / 非图片走 onAddFiles，
 * 且阻止默认（不让文件名落入输入框）；纯文本粘贴不受影响。
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

import { AimPromptComposer } from "@/components/aim/aim-prompt-composer"

function baseProps(overrides: Partial<React.ComponentProps<typeof AimPromptComposer>> = {}) {
  return {
    value: "",
    placeholder: "说说你的需求",
    busy: false,
    isRecording: false,
    isTranscribing: false,
    isGenerating: false,
    canGenerate: true,
    primaryActionLabel: "生成",
    onChange: vi.fn(),
    onGenerate: vi.fn(),
    onStartRecording: vi.fn(),
    onStopRecording: vi.fn(),
    ...overrides,
  }
}

function firePasteWithFiles(files: File[]) {
  const dt = { files } as unknown as DataTransfer
  const event = new Event("paste", { bubbles: true, cancelable: true })
  Object.defineProperty(event, "clipboardData", { value: dt })
  return event
}

describe("AimPromptComposer 粘贴文件分流", () => {
  it("粘贴非图片文件 → 调 onAddFiles 且阻止默认插入", () => {
    const onAddFiles = vi.fn()
    const onAddImages = vi.fn()
    render(<AimPromptComposer {...baseProps({ onAddFiles, onAddImages })} />)
    const textarea = screen.getByPlaceholderText("说说你的需求")

    const file = new File(["日期,播放量\nA,100"], "发布数据.tst", { type: "" })
    const event = firePasteWithFiles([file])
    fireEvent(textarea, event)

    expect(event.defaultPrevented).toBe(true)
    expect(onAddFiles).toHaveBeenCalledTimes(1)
    expect(onAddFiles.mock.calls[0][0][0].name).toBe("发布数据.tst")
    expect(onAddImages).not.toHaveBeenCalled()
  })

  it("粘贴图片文件 → 调 onAddImages 且阻止默认插入", () => {
    const onAddFiles = vi.fn()
    const onAddImages = vi.fn()
    render(<AimPromptComposer {...baseProps({ onAddFiles, onAddImages })} />)
    const textarea = screen.getByPlaceholderText("说说你的需求")

    const file = new File(["png"], "shot.png", { type: "image/png" })
    const event = firePasteWithFiles([file])
    fireEvent(textarea, event)

    expect(event.defaultPrevented).toBe(true)
    expect(onAddImages).toHaveBeenCalledTimes(1)
    expect(onAddFiles).not.toHaveBeenCalled()
  })

  it("纯文本粘贴（无文件）→ 不调文件通道、不阻止默认", () => {
    const onAddFiles = vi.fn()
    const onAddImages = vi.fn()
    render(<AimPromptComposer {...baseProps({ onAddFiles, onAddImages })} />)
    const textarea = screen.getByPlaceholderText("说说你的需求")

    const dt = { files: [], getData: () => "普通文本" } as unknown as DataTransfer
    const event = new Event("paste", { bubbles: true, cancelable: true })
    Object.defineProperty(event, "clipboardData", { value: dt })
    fireEvent(textarea, event)

    expect(event.defaultPrevented).toBe(false)
    expect(onAddFiles).not.toHaveBeenCalled()
    expect(onAddImages).not.toHaveBeenCalled()
  })

  it("拖放文件到输入框 → 调 onAddFiles", () => {
    const onAddFiles = vi.fn()
    render(<AimPromptComposer {...baseProps({ onAddFiles })} />)
    const textarea = screen.getByPlaceholderText("说说你的需求")

    const file = new File(["内容"], "data.tst", { type: "" })
    const dropEvent = new Event("drop", { bubbles: true, cancelable: true })
    Object.defineProperty(dropEvent, "dataTransfer", {
      value: { files: [file], types: ["Files"] },
    })
    fireEvent(textarea, dropEvent)

    expect(dropEvent.defaultPrevented).toBe(true)
    expect(onAddFiles).toHaveBeenCalledTimes(1)
    expect(onAddFiles.mock.calls[0][0][0].name).toBe("data.tst")
  })
})
