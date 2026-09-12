import { describe, expect, it } from "vitest"

import {
  buildEveningReportCard,
  formatSelectionLines,
  formatStatusLines,
  type EveningSelectionSummary,
} from "@/lib/aim/feishu-topic-evening-report"

function selection(overrides: Partial<EveningSelectionSummary> = {}): EveningSelectionSummary {
  return {
    selectionId: "tsel_abcdef123456",
    reviewStatus: "pending",
    selectedIndex: null,
    candidates: [
      { title: "候选一" },
      { title: "候选二" },
    ],
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

describe("evening report selection lines", () => {
  it("采用批次带选题标题，未裁决只报状态", () => {
    const lines = formatSelectionLines([
      selection({ reviewStatus: "adopted", selectedIndex: 1 }),
      selection(),
    ])
    expect(lines[0]).toContain("已采用｜采用「候选二」")
    expect(lines[1]).toContain("未裁决")
    expect(lines[1]).not.toContain("候选")
  })

  it("空天提示没有生成批次", () => {
    expect(formatSelectionLines([])).toEqual(["今日没有生成选题批次。"])
  })

  it("都不行与换一批状态正确映射", () => {
    const lines = formatSelectionLines([
      selection({ reviewStatus: "archived" }),
      selection({ reviewStatus: "regenerated" }),
    ])
    expect(lines[0]).toContain("都不行（观察池）")
    expect(lines[1]).toContain("已换一批")
  })
})

describe("evening report card", () => {
  it("包含项目名、选题区、灵感与采集健康度", () => {
    const card = buildEveningReportCard(
      {
        selections: [selection({ reviewStatus: "adopted", selectedIndex: 0 })],
        inspirationCount: 3,
        inspirationExtracted: 2,
        inspirationFailed: 0,
        hotSnapshotAt: new Date(Date.now() - 3_600_000),
      },
      "明动远见｜相宇个人IP",
    )
    const text = markdown(card)
    expect(text).toContain("明动远见｜相宇个人IP")
    expect(text).toContain("已采用｜采用「候选一」")
    expect(text).toContain("今日灵感：3 条（已提取 2｜失败 0）")
    expect(text).toContain("热点采集：正常")
  })

  it("热榜停摆时给出警告而不是静默", () => {
    const card = buildEveningReportCard(
      {
        selections: [],
        inspirationCount: 0,
        inspirationExtracted: 0,
        inspirationFailed: 0,
        hotSnapshotAt: null,
      },
      null,
    )
    const text = markdown(card)
    expect(text).toContain("⚠️ 无快照")
    expect(text).toContain("今日没有生成选题批次")
  })
})

describe("evening report status lines", () => {
  it("快照超过 24 小时仍显示小时数供人判断", () => {
    const lines = formatStatusLines({
      inspirationCount: 0,
      inspirationExtracted: 0,
      inspirationFailed: 0,
      hotSnapshotAt: new Date(Date.now() - 30 * 3_600_000),
    })
    expect(lines[1]).toContain("30 小时前")
  })
})
