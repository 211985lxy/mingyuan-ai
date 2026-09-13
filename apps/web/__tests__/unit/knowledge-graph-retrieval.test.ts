import { describe, expect, it } from "vitest"

import { GRAPH_EXPANSION_BUDGET, mergeGraphEntries } from "@/lib/aim/knowledge-graph-retrieval"

function vectorEntry(id: string, score: number) {
  return { id, title: `V-${id}`, content: "内容", category: "customer_pain", tags: [], valueGrade: "B", score }
}

function graphEntry(id: string) {
  return { id, title: `G-${id}`, content: "图内容", category: "boss_experience", tags: [], valueGrade: "A" }
}

describe("mergeGraphEntries", () => {
  it("向量结果保持原顺序，图补条目追加在后", () => {
    const { entries, added } = mergeGraphEntries(
      [vectorEntry("a", 0.9), vectorEntry("b", 0.8)],
      [graphEntry("x")],
    )
    expect(entries.map((entry) => entry.id)).toEqual(["a", "b", "x"])
    expect(added).toBe(1)
  })

  it("图补条目分数略低于向量最低分（补强语义，不抢排序）", () => {
    const { entries } = mergeGraphEntries([vectorEntry("a", 0.5)], [graphEntry("x"), graphEntry("y")])
    const vectorMin = 0.5
    const graphScores = entries.slice(1).map((entry) => entry.score)
    expect(Math.max(...graphScores)).toBeLessThan(vectorMin)
  })

  it("去重：图补条目若已在向量结果中则跳过", () => {
    const { entries, added } = mergeGraphEntries([vectorEntry("a", 0.9)], [graphEntry("a"), graphEntry("x")])
    expect(added).toBe(1)
    expect(entries.map((entry) => entry.id)).toEqual(["a", "x"])
  })

  it("预算封顶：最多补 GRAPH_EXPANSION_BUDGET 条", () => {
    const many = Array.from({ length: 10 }, (_, index) => graphEntry(`g${index}`))
    const { added } = mergeGraphEntries([vectorEntry("a", 0.9)], many)
    expect(added).toBe(GRAPH_EXPANSION_BUDGET)
  })

  it("向量为空时不产生负分", () => {
    const { entries } = mergeGraphEntries([], [graphEntry("x")])
    expect(entries[0]?.score).toBeLessThanOrEqual(0)
    expect(Number.isFinite(entries[0]?.score)).toBe(true)
  })
})
