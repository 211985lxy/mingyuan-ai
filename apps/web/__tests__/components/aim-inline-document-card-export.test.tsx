import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { AimInlineDocumentCard } from "@/components/aim/aim-inline-document-card"

const clickSpy = vi.fn()

beforeEach(() => {
  clickSpy.mockClear()
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:mock"),
    revokeObjectURL: vi.fn(),
  })
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(clickSpy)
})

function baseProps(overrides: Partial<React.ComponentProps<typeof AimInlineDocumentCard>> = {}) {
  return {
    messageId: "m1",
    generationId: "g1",
    format: "raw_copy" as const,
    content: "这是正文内容",
    renderView: (text: string) => text,
    isSessionOwner: true,
    canStartEdit: true,
    onRequestEditOwnership: () => true,
    onReleaseEditOwnership: vi.fn(),
    onContentSaved: vi.fn(),
    onSelectionRewrite: vi.fn(),
    topicTitle: "中汝达口播",
    ...overrides,
  }
}

describe("交付物导出 Markdown", () => {
  it("点击「导出」触发 .md 下载，文件名含主题", async () => {
    const user = userEvent.setup()
    render(<AimInlineDocumentCard {...baseProps()} />)

    await user.click(screen.getByRole("button", { name: /导出/ }))
    expect(URL.createObjectURL).toHaveBeenCalled()
    expect(clickSpy).toHaveBeenCalled()
  })
})
