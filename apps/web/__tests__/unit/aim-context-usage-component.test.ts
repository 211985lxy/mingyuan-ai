import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { AimContextUsage } from "@/components/aim/aim-context-usage"

describe("AIM context usage window", () => {
  it("shows the used and remaining token budget with segment breakdown", () => {
    const html = renderToStaticMarkup(createElement(AimContextUsage, {
      usedTokens: 70_000,
      maxTokens: 200_000,
      segments: [
        { id: "conversation", label: "对话记录", tokens: 40_000 },
        { id: "current_input", label: "当前输入", tokens: 5_000 },
        { id: "pasted_copy", label: "粘贴素材", tokens: 24_200 },
        { id: "images", label: "图片", tokens: 0 },
        { id: "system_reserve", label: "系统预留", tokens: 800 },
      ],
    }))

    expect(html).toContain("背景信息窗口")
    expect(html).toContain("35% 已用")
    expect(html).toContain("剩余 65%")
    expect(html).toContain("已用 7万 Token，共 20万")
    expect(html).toContain("对话记录")
    expect(html).toContain("粘贴素材")
    expect(html).toContain("系统预留")
    expect(html).not.toContain(">图片<")
    expect(html).toContain("aria-label=\"背景信息已使用 35%\"")
  })

  it("explains that overflow will be trimmed", () => {
    const html = renderToStaticMarkup(createElement(AimContextUsage, {
      usedTokens: 210_000,
      maxTokens: 200_000,
      segments: [
        { id: "pasted_copy", label: "粘贴素材", tokens: 209_200 },
        { id: "system_reserve", label: "系统预留", tokens: 800 },
      ],
    }))

    expect(html).toContain("100% 已用")
    expect(html).toContain("超出部分会在发送时自动精简")
  })
})
