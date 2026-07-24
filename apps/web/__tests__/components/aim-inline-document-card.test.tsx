/**
 * AimInlineDocumentCard 交互测试。
 *
 * 覆盖：进入编辑 → 修改正文 → 保存成功回调；空正文保存被拦截。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { AimInlineDocumentCard } from "@/components/aim/aim-inline-document-card"

function baseProps(overrides: Partial<React.ComponentProps<typeof AimInlineDocumentCard>> = {}) {
  return {
    messageId: "msg-1",
    generationId: "gen-1",
    format: "raw_copy" as const,
    content: "原始文案内容",
    renderView: (text: string) => <div data-testid="view">{text}</div>,
    isSessionOwner: false,
    canStartEdit: true,
    onRequestEditOwnership: () => true,
    onReleaseEditOwnership: vi.fn(),
    onContentSaved: vi.fn(),
    onSelectionRewrite: vi.fn(),
    ...overrides,
  }
}

describe("AimInlineDocumentCard 编辑/保存", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { content: "保存后的文案" } }),
      }),
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("进入编辑 → 修改正文 → 保存成功后回调并退出编辑态", async () => {
    const user = userEvent.setup()
    const props = baseProps()
    render(<AimInlineDocumentCard {...props} />)

    // 初始为查看态
    expect(screen.getByTestId("view")).toHaveTextContent("原始文案内容")

    // 进入编辑态
    await user.click(screen.getByRole("button", { name: "编辑" }))
    const textarea = screen.getByPlaceholderText("在这里编辑文案")
    expect(textarea).toBeInTheDocument()

    // 修改正文
    await user.clear(textarea)
    await user.type(textarea, "改写后的文案内容")

    // 保存
    await user.click(screen.getByRole("button", { name: /保存/ }))

    // 保存成功：用服务端返回的正文回调父组件，并释放编辑占用
    expect(props.onContentSaved).toHaveBeenCalledWith("保存后的文案")
    expect(props.onReleaseEditOwnership).toHaveBeenCalledTimes(1)
    // 退出编辑态，回到查看态
    expect(screen.queryByPlaceholderText("在这里编辑文案")).not.toBeInTheDocument()
  })

  it("正文为空时保存被拦截，不发起请求", async () => {
    const user = userEvent.setup()
    const props = baseProps()
    render(<AimInlineDocumentCard {...props} />)

    await user.click(screen.getByRole("button", { name: "编辑" }))
    const textarea = screen.getByPlaceholderText("在这里编辑文案")
    await user.clear(textarea)

    await user.click(screen.getByRole("button", { name: /保存/ }))

    // 空正文：不发起保存请求，也不回调
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
    expect(props.onContentSaved).not.toHaveBeenCalled()
  })

  it("未获得编辑占用时不进入编辑态", async () => {
    const user = userEvent.setup()
    const props = baseProps({ onRequestEditOwnership: () => false })
    render(<AimInlineDocumentCard {...props} />)

    await user.click(screen.getByRole("button", { name: "编辑" }))
    // 占用申请被拒：仍为查看态
    expect(screen.queryByPlaceholderText("在这里编辑文案")).not.toBeInTheDocument()
    expect(screen.getByTestId("view")).toBeInTheDocument()
  })
})
