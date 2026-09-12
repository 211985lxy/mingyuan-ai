import { describe, expect, it } from "vitest"

import {
  aggregateRetrievalEval,
  evaluateRetrievalCase,
  runRetrievalEval,
  type RetrievalCase,
} from "@/lib/aim/retrieval-eval"

describe("evaluateRetrievalCase", () => {
  it("按 id 标注计算命中与倒数排名", () => {
    const result = evaluateRetrievalCase({
      caseId: "c1",
      rankedEntries: [
        { id: "a", title: "t1", content: "c1" },
        { id: "b", title: "t2", content: "c2" },
        { id: "rel", title: "t3", content: "c3" },
      ],
      relevantEntryIds: ["rel"],
    })
    expect(result.hitAtK).toBe(true)
    expect(result.firstRelevantRank).toBe(3)
    expect(result.reciprocalRank).toBeCloseTo(1 / 3)
    expect(result.pass).toBe(true)
  })

  it("未命中时 pass 为 false，reciprocalRank 为 0", () => {
    const result = evaluateRetrievalCase({
      caseId: "c1",
      rankedEntries: [{ id: "a", title: "t1", content: "c1" }],
      relevantEntryIds: ["rel"],
    })
    expect(result.hitAtK).toBe(false)
    expect(result.firstRelevantRank).toBeNull()
    expect(result.reciprocalRank).toBe(0)
    expect(result.pass).toBe(false)
  })

  it("关键词标注大小写不敏感、要求标题或正文包含全部关键词", () => {
    const hit = evaluateRetrievalCase({
      caseId: "c1",
      rankedEntries: [{ id: "a", title: "Delivery 交付标准", content: "所有成品必须通过质检" }],
      mustIncludeKeywords: ["交付", "质检"],
    })
    expect(hit.keywordHit).toBe(true)
    expect(hit.pass).toBe(true)

    const miss = evaluateRetrievalCase({
      caseId: "c2",
      rankedEntries: [{ id: "a", title: "交付标准", content: "此处完全不含期望词" }],
      mustIncludeKeywords: ["交付", "质检"],
    })
    expect(miss.keywordHit).toBe(false)
    expect(miss.pass).toBe(false)
  })

  it("同时给 id 与关键词时需同时满足", () => {
    const result = evaluateRetrievalCase({
      caseId: "c1",
      rankedEntries: [{ id: "a", title: "交付标准", content: "包含关键词" }],
      relevantEntryIds: ["b"],
      mustIncludeKeywords: ["关键词"],
    })
    expect(result.keywordHit).toBe(true)
    expect(result.pass).toBe(false)
  })
})

describe("aggregateRetrievalEval", () => {
  it("聚合 hitRate/MRR/关键词命中率/通过率，并按用例顺序排列明细", () => {
    const cases: RetrievalCase[] = [
      { id: "c1", query: "q1", relevantEntryIds: ["rel1"] },
      { id: "c2", query: "q2", relevantEntryIds: ["rel2"] },
      { id: "c3", query: "q3", mustIncludeKeywords: ["关键词"] },
    ]
    const results = [
      evaluateRetrievalCase({ caseId: "c1", rankedEntries: [{ id: "rel1", title: "t", content: "c" }], relevantEntryIds: ["rel1"] }),
      evaluateRetrievalCase({ caseId: "c2", rankedEntries: [{ id: "x", title: "t", content: "c" }], relevantEntryIds: ["rel2"] }),
      evaluateRetrievalCase({ caseId: "c3", rankedEntries: [{ id: "y", title: "有关键词", content: "c" }], mustIncludeKeywords: ["关键词"] }),
    ]
    const aggregate = aggregateRetrievalEval(cases, results)
    expect(aggregate.totalCases).toBe(3)
    expect(aggregate.hitRateAtK).toBeCloseTo(2 / 3)
    expect(aggregate.mrr).toBeCloseTo((1 + 0 + 0) / 2) // id 口径用例仅 c1/c2
    expect(aggregate.keywordHitRate).toBe(1)
    expect(aggregate.passRate).toBeCloseTo(2 / 3)
    expect(aggregate.perCase.map((item) => item.caseId)).toEqual(["c1", "c2", "c3"])
  })

  it("无 id 标注时 MRR 只按关键词口径聚合", () => {
    const cases: RetrievalCase[] = [{ id: "c1", query: "q1", mustIncludeKeywords: ["词"] }]
    const results = [
      evaluateRetrievalCase({ caseId: "c1", rankedEntries: [], mustIncludeKeywords: ["词"] }),
    ]
    const aggregate = aggregateRetrievalEval(cases, results)
    expect(aggregate.mrr).toBe(0)
    expect(aggregate.keywordHitRate).toBe(0)
  })
})

describe("runRetrievalEval", () => {
  it("用注入的 retrieve 函数跑通端到端", async () => {
    const cases: RetrievalCase[] = [
      { id: "c1", query: "q1", mustIncludeKeywords: ["目标"] },
    ]
    const aggregate = await runRetrievalEval(cases, 12, async () => [
      { id: "a", title: "目标条目", content: "正文" },
    ])
    expect(aggregate.passRate).toBe(1)
  })
})
