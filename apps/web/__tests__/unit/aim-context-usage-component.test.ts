import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { AimContextUsage } from "@/components/aim/aim-context-usage"

describe("AIM context usage window", () => {
  it("shows the used and remaining token budget", () => {
    const html = renderToStaticMarkup(createElement(AimContextUsage, {
      usedTokens: 70_000,
      maxTokens: 200_000,
    }))

    expect(html).toContain("背景信息窗口")
    expect(html).toContain("35% 已用")
    expect(html).toContain("剩余 65%")
    expect(html).toContain("已用 7万 Token，共 20万")
    expect(html).toContain("aria-label=\"背景信息已使用 35%\"")
  })

  it("explains that overflow will be trimmed", () => {
    const html = renderToStaticMarkup(createElement(AimContextUsage, {
      usedTokens: 210_000,
      maxTokens: 200_000,
    }))

    expect(html).toContain("100% 已用")
    expect(html).toContain("超出部分会在发送时自动精简")
  })
})
