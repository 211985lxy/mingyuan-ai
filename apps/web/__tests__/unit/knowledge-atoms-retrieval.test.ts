import { describe, expect, it } from "vitest"
import {
  averageRetrievalScores,
  classifyAtom,
  graphHopLift,
  scoreRetrievalCase,
  splitKnowledgeAtoms,
} from "@/lib/aim/knowledge-atoms"
import { mergeVectorWithGraphHop } from "@/lib/aim/knowledge-graph-hop"

describe("知识原子与检索基线", () => {
  it("按文本特征分成观点/金句/事实/方法，并幂等切块", () => {
    expect(classifyAtom("客户说过「我最怕选错人」")).toBe("quote")
    expect(classifyAtom("先做诊断再给方案，这是 SOP")).toBe("method")
    expect(classifyAtom("调研显示 73% 老板不会拍")).toBe("fact")
    const atoms = splitKnowledgeAtoms({
      title: "成交卡点",
      content: "客户最怕选错人。先做诊断再给方案。调研显示 73% 老板不会拍。",
      valueGrade: "A",
    })
    expect(atoms.length).toBeGreaterThan(1)
    expect(new Set(atoms.map((item) => item.content)).size).toBe(atoms.length)
  })

  it("检索命中率、引用准确率、信噪比可算，图谱提升可证伪", () => {
    const baseline = scoreRetrievalCase({
      id: "r1",
      query: "成交卡点",
      retrievedIds: ["a", "x"],
      goldIds: ["a", "b"],
      citedIds: ["a"],
    })
    expect(baseline.hitRate).toBe(0.5)
    expect(baseline.citationAccuracy).toBe(1)
    expect(baseline.signalToNoise).toBe(0.5)
    const withGraph = averageRetrievalScores([
      { id: "r1", query: "成交卡点", retrievedIds: ["a", "b"], goldIds: ["a", "b"], citedIds: ["a", "b"] },
    ])
    expect(graphHopLift(baseline, withGraph)).toBeGreaterThanOrEqual(0.1)
  })

  it("图扩展一跳只补漏，不冲掉向量命中", () => {
    const merged = mergeVectorWithGraphHop(
      [{ id: "a", score: 0.9 }, { id: "b", score: 0.4 }],
      [{ id: "c", score: 0.5 }, { id: "b", score: 0.8 }],
      3,
    )
    expect(merged.map((item) => item.id)).toEqual(["a", "b", "c"])
    expect(merged.find((item) => item.id === "b")?.score).toBe(0.8)
  })
})
