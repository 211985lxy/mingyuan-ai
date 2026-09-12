import { describe, expect, it } from "vitest"

import {
  INSPIRATION_DIGEST_LIMIT,
  buildInspirationDigestCard,
  formatDigestEntryLine,
  type InspirationDigestEntry,
} from "@/lib/aim/feishu-inspiration-digest-notify"

function entry(overrides: Partial<InspirationDigestEntry> = {}): InspirationDigestEntry {
  return {
    id: "insp_1",
    content: "这个视频讲获客型视频的结构，值得抄 https://v.douyin.com/abc/",
    sourceUrl: "https://v.douyin.com/abc/",
    processingStage: "captured",
    aiStatus: "completed",
    createdAt: new Date("2026-09-12T09:30:00"),
    ...overrides,
  }
}

function markdown(card: Record<string, unknown>): string {
  const elements = card.elements as Array<Record<string, unknown>>
  const parts: string[] = []
  for (const element of elements) {
    const text = element.text as { content?: string } | undefined
    if (typeof text?.content === "string") parts.push(text.content)
    const noteElements = element.elements as Array<{ content?: string }> | undefined
    for (const note of noteElements ?? []) {
      if (typeof note?.content === "string") parts.push(note.content)
    }
  }
  return parts.join("\n")
}

describe("inspiration digest entry line", () => {
  it("评述剥掉链接、带时间与状态、附原片", () => {
    const line = formatDigestEntryLine(entry())
    // 评述部分不含 URL（URL 只出现在末尾的原片 markdown 里）
    expect(line.startsWith("- 这个视频讲获客型视频的结构，值得抄｜")).toBe(true)
    expect(line).toContain("[原片](https://v.douyin.com/abc/)")
    expect(line).toContain("文案扒好了")
    expect(line).toContain("9月12日 09:30")
  })

  it("长评述截断，纯链接消息给出占位文案", () => {
    const long = formatDigestEntryLine(entry({ content: `长评述${"字".repeat(80)} https://x.com/1` }))
    expect(long).toContain("…")

    const linkOnly = formatDigestEntryLine(entry({ content: "https://v.douyin.com/only/" }))
    expect(linkOnly).toContain("只丢了个链接")
  })

  it("失败状态映射为人话", () => {
    expect(formatDigestEntryLine(entry({ aiStatus: "failed", processingStage: null }))).toContain("没扒到文案")
    expect(formatDigestEntryLine(entry({ aiStatus: "pending", processingStage: "queued" }))).toContain("正在扒文案")
  })
})

describe("inspiration digest card", () => {
  it("有灵感时返回卡片，含条数与 note 提示", () => {
    const card = buildInspirationDigestCard([entry()])
    expect(card).not.toBeNull()
    const text = markdown(card!)
    expect(text).toContain("随手记了 1 条")
    expect(text).toContain("写选题的素材")
  })

  it("空列表不返回卡片（不推空卡）", () => {
    expect(buildInspirationDigestCard([])).toBeNull()
  })

  it("超过上限只展示上限条数，多出以合计行提示", () => {
    const entries = Array.from({ length: INSPIRATION_DIGEST_LIMIT + 3 }, (_, index) =>
      entry({ id: `insp_${index}`, content: `灵感 ${index}` }),
    )
    const text = markdown(buildInspirationDigestCard(entries)!)
    expect(text).toContain(`随手记了 ${INSPIRATION_DIGEST_LIMIT + 3} 条`)
    expect(text).toContain("还有 3 条")
  })
})
