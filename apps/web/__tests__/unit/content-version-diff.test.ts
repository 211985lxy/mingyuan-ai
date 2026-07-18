import { describe, expect, it } from "vitest"
import { diffLines } from "@/components/aim/version-timeline"

describe("version-timeline diffLines（行级 LCS diff）", () => {
  it("完全相同的文本全部标记为 same", () => {
    const result = diffLines("第一行\n第二行", "第一行\n第二行")
    expect(result).toEqual([
      { type: "same", text: "第一行" },
      { type: "same", text: "第二行" },
    ])
  })

  it("识别新增与删除的行", () => {
    const result = diffLines("开头\n旧中间\n结尾", "开头\n新中间\n结尾")
    expect(result).toEqual([
      { type: "same", text: "开头" },
      { type: "removed", text: "旧中间" },
      { type: "added", text: "新中间" },
      { type: "same", text: "结尾" },
    ])
  })

  it("旧版为空时全部行为 added", () => {
    const result = diffLines("", "一行\n两行")
    // 空字符串 split 出一行空串，与新增内容不同 → 首行为 removed，其余 added
    expect(result.filter((line) => line.type === "added")).toHaveLength(2)
    expect(result.some((line) => line.type === "same")).toBe(false)
  })

  it("末尾追加行识别为 added", () => {
    const result = diffLines("A\nB", "A\nB\nC")
    expect(result).toEqual([
      { type: "same", text: "A" },
      { type: "same", text: "B" },
      { type: "added", text: "C" },
    ])
  })
})
