import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { InternalModelTestPanel } from "@/components/admin/internal-model-test-panel"

describe("admin knowledge components", () => {
  it("renders the internal model test panel collapsed without reading auth", () => {
    const getToken = vi.fn(() => "admin-token")
    const html = renderToStaticMarkup(createElement(InternalModelTestPanel, { getToken }))

    expect(html).toContain("中转站测试（内部）")
    expect(html).toContain("展开")
    expect(getToken).not.toHaveBeenCalled()
  })
})
