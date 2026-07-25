import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { BenchmarkEditorPanel } from "@/components/aim/benchmark-editor-panel"
import type { EditorPanelLabels } from "@/lib/aim-editor-labels"
import {
  getAimWorkflowStatusLabel,
  normalizeScriptBodySpacing,
  splitAimMethodNote,
} from "@/lib/aim/workbench-display"

const labels: EditorPanelLabels = {
  title: "文案编辑",
  collapsedTitle: "展开文案编辑",
  referenceTitle: "对标文案",
  referencePlaceholder: "暂无对标原文案",
  draftTitle: "我的稿子",
  draftPlaceholder: "在这里编辑",
  currentLabel: "当前稿",
  selectActionLabel: "修改选中文案",
  documentType: "copy",
}

function renderEditor(open: boolean) {
  return renderToStaticMarkup(createElement(BenchmarkEditorPanel, {
    open,
    width: 420,
    labels,
    referenceText: "参考内容",
    editorText: "当前稿件",
    editorFormat: "video_script",
    onOpen: vi.fn(),
    onClose: vi.fn(),
    onWidthChange: vi.fn(),
    onEditorTextChange: vi.fn(),
    onReferenceSelection: vi.fn(),
    onDraftSelection: vi.fn(),
    onSave: vi.fn(),
    onImitate: vi.fn(),
    imitating: false,
    imitateStyleId: "default",
    onImitateStyleChange: vi.fn(),
  }))
}

describe("BenchmarkEditorPanel", () => {
  it("keeps a compact advanced-edit entry visible when collapsed", () => {
    const html = renderEditor(false)

    expect(html).toContain("展开高级编辑")
    expect(html).toContain("高级编辑 · 4字")
  })

  it("renders the reference and editable draft when open", () => {
    const html = renderEditor(true)

    expect(html).toContain("文案编辑")
    expect(html).toContain("口播文案")
    expect(html).toContain("对标文案")
    expect(html).toContain("参考内容")
    expect(html).toContain("我的稿子")
    expect(html).toContain("当前稿件")
    expect(html).toContain("保存")
    expect(html).toContain("隐藏")
  })
})

describe("AIM workbench display helpers", () => {
  it("separates a method note from the user-facing result", () => {
    expect(splitAimMethodNote("正文\n[[AIM_METHOD_NOTE]]依据说明[[/AIM_METHOD_NOTE]]")).toEqual({
      methodNote: "依据说明",
      result: "正文",
    })
  })

  it("collapses excessive blank lines in script bodies", () => {
    const p1 = "这是一段刻意写得很长的第一段正文，用来确认长段落之间仍保留空行分隔，不会被短句合并逻辑误伤。"
    const p2 = "这是一段刻意写得很长的第二段正文，用来确认长段落之间仍保留空行分隔，不会被短句合并逻辑误伤。"
    const p3 = "这是一段刻意写得很长的第三段正文，用来确认长段落之间仍保留空行分隔，不会被短句合并逻辑误伤。"
    expect(normalizeScriptBodySpacing(`${p1}\n\n\n\n${p2}\n\n\n${p3}`)).toBe(`${p1}\n\n${p2}\n\n${p3}`)
    expect(
      splitAimMethodNote(`${p1}\n\n\n${p2}\n[[AIM_METHOD_NOTE]]note[[/AIM_METHOD_NOTE]]`),
    ).toEqual({
      methodNote: "note",
      result: `${p1}\n\n${p2}`,
    })
  })

  it("merges consecutive short script paragraphs into soft line breaks", () => {
    expect(
      normalizeScriptBodySpacing("说实话，这两头都容易踩坑。\n\n我们直接开始。\n\n第一层，单点级。"),
    ).toBe("说实话，这两头都容易踩坑。\n我们直接开始。\n第一层，单点级。")
  })

  it("keeps unknown workflow states compatible with draft", () => {
    expect(getAimWorkflowStatusLabel("published")).toBe("已发布")
    expect(getAimWorkflowStatusLabel("unknown")).toBe("草稿")
  })
})
