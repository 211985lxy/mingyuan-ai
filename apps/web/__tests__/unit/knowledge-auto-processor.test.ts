import { describe, expect, it } from "vitest"

import { detectWeChatExport, parseWeChatExport } from "@/lib/knowledge-auto-processor"

describe("knowledge auto processor", () => {
  it("detects wechat export text", () => {
    const text = `2026-07-09 10:00 张三: 先看成交卡点\n继续补充一行\n2026-07-09 10:05 李四: 客户还是担心交付`

    expect(detectWeChatExport(text)).toBe(true)
  })

  it("parses multiline wechat messages", () => {
    const text = `2026-07-09 10:00 张三: 第一段\n第二段\n2026-07-09 10:05 李四: 第二条`

    expect(parseWeChatExport(text)).toEqual([
      {
        timestamp: "2026-07-09 10:00",
        sender: "张三",
        content: "第一段\n第二段",
      },
      {
        timestamp: "2026-07-09 10:05",
        sender: "李四",
        content: "第二条",
      },
    ])
  })
})
