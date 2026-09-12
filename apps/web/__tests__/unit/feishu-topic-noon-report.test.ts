import { describe, expect, it } from "vitest"

import {
  buildNoonReportCard,
  formatHotLines,
  formatProgressLines,
  formatShootLines,
  type NoonReportData,
} from "@/lib/aim/feishu-topic-noon-report"
import type { DailyTopicSnapshot } from "@/lib/aim/daily-topic-snapshot"

function snapshot(overrides: Partial<DailyTopicSnapshot> = {}): DailyTopicSnapshot {
  return {
    selections: [],
    inspirationCount: 0,
    inspirationExtracted: 0,
    inspirationFailed: 0,
    hotSnapshotAt: new Date(),
    ...overrides,
  }
}

function selection(reviewStatus: string, selectedIndex: number | null = null, titles = ["候选一", "候选二"]) {
  return {
    selectionId: `tsel_${reviewStatus}_${selectedIndex ?? "x"}`,
    reviewStatus,
    selectedIndex,
    candidates: titles.map((title) => ({ title })),
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

describe("noon progress lines", () => {
  it("未挑的批次单独点名提醒", () => {
    const lines = formatProgressLines(
      snapshot({ selections: [selection("pending"), selection("adopted", 0)] }),
    )
    expect(lines[0]).toContain("出了 2 批选题，已挑 1 批")
    expect(lines[1]).toContain("还有 1 批没挑")
  })

  it("全部挑完时不提醒", () => {
    const lines = formatProgressLines(snapshot({ selections: [selection("adopted", 0)] }))
    expect(lines.join("\n")).not.toContain("没挑")
  })

  it("无批次时如实说明", () => {
    expect(formatProgressLines(snapshot())).toEqual(["- 今天还没生成选题。"])
  })
})

describe("noon shoot lines", () => {
  it("已挑的选题带出下午开拍提示", () => {
    const lines = formatShootLines(snapshot({ selections: [selection("adopted", 1)] }))
    expect(lines).toEqual(["- 下午可以拍：「候选二」"])
  })

  it("没有已挑选题时不产出该区", () => {
    expect(formatShootLines(snapshot({ selections: [selection("pending")] }))).toEqual([])
  })
})

describe("noon hot lines", () => {
  it("热点带热度与可点链接", () => {
    const lines = formatHotLines([{ title: "某热点", score: 82, url: "https://example.com/hot" }])
    expect(lines[0]).toBe("**下午可以借势的热点**")
    expect(lines[1]).toContain("某热点（热度 82）")
    expect(lines[1]).toContain("[去看看](https://example.com/hot)")
  })

  it("无热点时不产出该区", () => {
    expect(formatHotLines([])).toEqual([])
  })
})

describe("noon report card", () => {
  it("包含进度、开拍提示、灵感与热点借势", () => {
    const data: NoonReportData = {
      snapshot: snapshot({
        selections: [selection("pending"), selection("adopted", 0)],
        inspirationCount: 2,
        inspirationExtracted: 1,
        inspirationFailed: 0,
      }),
      hotItems: [{ title: "某热点", score: 82, url: "https://example.com/hot" }],
    }
    const text = markdown(buildNoonReportCard(data, "明动远见｜相宇个人IP"))

    expect(text).toContain("明动远见｜相宇个人IP")
    expect(text).toContain("还有 1 批没挑")
    expect(text).toContain("下午可以拍：「候选一」")
    expect(text).toContain("2 条（扒好 1｜没扒到 0）")
    expect(text).toContain("下午可以借势的热点")
  })

  it("无热点且无已挑选题时仍给出进度与灵感", () => {
    const data: NoonReportData = { snapshot: snapshot({ selections: [selection("pending")] }), hotItems: [] }
    const text = markdown(buildNoonReportCard(data, null))
    expect(text).toContain("还有 1 批没挑")
    expect(text).not.toContain("借势")
  })
})
