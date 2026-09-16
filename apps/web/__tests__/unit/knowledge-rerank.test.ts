import { describe, expect, it } from "vitest"
import { FUSION_SCORE_FLOOR, normalizeScoreToFloor } from "@/lib/llm/rank-fusion"
import {
  APPENDED_SCORE_STEP,
  MAX_RERANK_CANDIDATES,
  MIN_RERANK_CANDIDATES,
  RERANK_DOC_MAX_CHARS,
  applyRerankOrder,
  buildRerankDocuments,
  parseRerankResponse,
  resolveRerankCandidateLimit,
  shouldRerank,
} from "@/lib/llm/rerank"

/**
 * P2 精排层契约测试（纯函数层）
 *
 * 三条最关键的断言：
 * 1. **归一化的存在理由**：Cross-Encoder 的分值跨度由模型对该批候选的判别力决定，
 *    实测横跨 1.0×～2493× 共 4 个数量级。不归一化，业务倍率在跨度小的查询下翻盘、
 *    在跨度大的查询下彻底失效。归一化把跨度锁死在 `1 / FUSION_SCORE_FLOOR`。
 * 2. **响应边界**：`index` 与 `relevance_score` 来自网络，越界 / 非整数 / 非有限值
 *    必须逐项丢弃 —— 直接拿去索引数组会静默丢条目或抛 TypeError。
 * 3. **不丢候选**：未被 `top_n` 覆盖的候选要追加在后，否则召回凭空缩水。
 */

const cand = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `e${i + 1}`,
    title: `T${i + 1}`,
    content: `C${i + 1}`,
    score: 1 / (i + 1),
  }))

describe("rerank / 候选池与短路判定", () => {
  it("候选数由 topK 推导并钳制在 [MIN, MAX]", () => {
    expect(resolveRerankCandidateLimit(1)).toBe(MIN_RERANK_CANDIDATES)
    expect(resolveRerankCandidateLimit(5)).toBe(15)
    expect(resolveRerankCandidateLimit(12)).toBe(36)
    expect(resolveRerankCandidateLimit(100)).toBe(MAX_RERANK_CANDIDATES)
  })

  it("非法 topK 不产生非法候选数", () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const n = resolveRerankCandidateLimit(bad)
      expect(Number.isInteger(n)).toBe(true)
      expect(n).toBeGreaterThanOrEqual(MIN_RERANK_CANDIDATES)
      expect(n).toBeLessThanOrEqual(MAX_RERANK_CANDIDATES)
    }
  })

  it("精排候选始终是融合深度的子集（topK=12 时 36 ≤ 48）", () => {
    expect(resolveRerankCandidateLimit(12)).toBeLessThanOrEqual(Math.max(40, 12 * 4))
  })

  it("池子不大于取出量时不值得付一次 HTTP", () => {
    expect(shouldRerank(36, 12)).toBe(true)
    expect(shouldRerank(12, 12)).toBe(false)
    expect(shouldRerank(0, 12)).toBe(false)
    expect(shouldRerank(Number.NaN, 12)).toBe(false)
  })
})

describe("rerank / 文档构造", () => {
  it("标题与正文换行拼接", () => {
    expect(buildRerankDocuments([{ title: "SOP", content: "正文" }])[0]).toBe("SOP\n正文")
  })

  it("空标题不留前导换行", () => {
    expect(buildRerankDocuments([{ title: "", content: "正文" }])[0]).toBe("正文")
  })

  it("按预算截断，标题保留在最前", () => {
    const [doc] = buildRerankDocuments([{ title: "T", content: "甲".repeat(2000) }])
    expect(doc.length).toBe(RERANK_DOC_MAX_CHARS)
    expect(doc.startsWith("T\n甲")).toBe(true)
  })

  it("全空条目给空格兜底，不与入参错位", () => {
    const docs = buildRerankDocuments([{ title: null, content: null }, {}])
    expect(docs).toEqual([" ", " "])
  })
})

describe("rerank / 响应解析（网络边界）", () => {
  it("正常响应按分降序，index 保留为原始下标", () => {
    const parsed = parseRerankResponse(
      { results: [{ index: 2, relevance_score: 0.952 }, { index: 0, relevance_score: 0.834 }] },
      3,
    )
    expect(parsed).toEqual([
      { index: 2, score: 0.952 },
      { index: 0, score: 0.834 },
    ])
  })

  it("服务端乱序时自己重排", () => {
    const parsed = parseRerankResponse(
      { results: [{ index: 0, relevance_score: 0.1 }, { index: 1, relevance_score: 0.9 }] },
      2,
    )
    expect(parsed[0].index).toBe(1)
  })

  it("越界 index 全部丢弃", () => {
    const parsed = parseRerankResponse(
      {
        results: [
          { index: 5, relevance_score: 0.9 },
          { index: -1, relevance_score: 0.8 },
        ],
      },
      3,
    )
    expect(parsed).toHaveLength(0)
  })

  it("非整数 index / 非有限分全部丢弃", () => {
    const parsed = parseRerankResponse(
      {
        results: [
          { index: 1.5, relevance_score: 0.9 },
          { index: "2", relevance_score: 0.9 },
          { index: 0, relevance_score: Number.NaN },
          { index: 1, relevance_score: Number.POSITIVE_INFINITY },
        ],
      },
      3,
    )
    expect(parsed).toHaveLength(0)
  })

  it("重复 index 只取首个", () => {
    const parsed = parseRerankResponse(
      { results: [{ index: 1, relevance_score: 0.9 }, { index: 1, relevance_score: 0.3 }] },
      2,
    )
    expect(parsed).toHaveLength(1)
    expect(parsed[0].score).toBe(0.9)
  })

  it("畸形 payload 一律返回空数组，不抛", () => {
    for (const bad of [null, undefined, 42, "x", [], {}, { results: "nope" }, { results: [] }]) {
      expect(parseRerankResponse(bad, 3)).toEqual([])
    }
  })

  it("部分 index 缺失不算错误（top_n 截断是正常现象）", () => {
    expect(parseRerankResponse({ results: [{ index: 0, relevance_score: 0.9 }] }, 36)).toHaveLength(1)
  })
})

describe("rerank / 重排赋分", () => {
  it("按 reranker 判定重排，未评分候选追加在后且不丢", () => {
    const out = applyRerankOrder(
      cand(6),
      [{ index: 5, score: 0.9 }, { index: 0, score: 0.5 }],
      6,
    )
    expect(out).toHaveLength(6)
    expect(out[0].id).toBe("e6")
    expect(out[1].id).toBe("e1")
    expect(out.slice(2).every((x) => x.score < FUSION_SCORE_FLOOR)).toBe(true)
  })

  it("获评分条目归一化到 [floor, 1]", () => {
    const out = applyRerankOrder(cand(6), [{ index: 5, score: 0.9 }, { index: 0, score: 0.5 }], 6)
    expect(out[0].score).toBe(1)
    expect(out[1].score).toBe(FUSION_SCORE_FLOOR)
  })

  it("截断到 topK，且首位仍是 reranker 首选", () => {
    const out = applyRerankOrder(cand(10), [{ index: 3, score: 0.7 }], 4)
    expect(out).toHaveLength(4)
    expect(out[0].id).toBe("e4")
  })

  it("返回的是候选本身的结构，不是 { item, score } 包装", () => {
    const out = applyRerankOrder(cand(4), [{ index: 2, score: 0.8 }], 4)
    expect(out[0]).toMatchObject({ id: "e3", title: "T3", content: "C3" })
  })

  it("scores 为空时保持原候选顺序", () => {
    expect(applyRerankOrder(cand(5), [], 3).map((x) => x.id)).toEqual(["e1", "e2", "e3"])
  })

  it("空候选返回空，topK 非法不返回空数组", () => {
    expect(applyRerankOrder([], [{ index: 0, score: 1 }], 5)).toEqual([])
    expect(applyRerankOrder(cand(6), [{ index: 0, score: 0.9 }], 0)).toHaveLength(1)
    expect(applyRerankOrder(cand(6), [{ index: 0, score: 0.9 }], Number.NaN)).toHaveLength(1)
  })

  it("仅一条获评分时给 1，同分时统一给 1", () => {
    expect(applyRerankOrder(cand(3), [{ index: 1, score: 0.4 }], 3)[0].score).toBe(1)
    const same = applyRerankOrder(
      cand(4),
      [{ index: 0, score: 0.8 }, { index: 1, score: 0.8 }, { index: 2, score: 0.8 }],
      4,
    )
    expect(same.slice(0, 3).every((x) => x.score === 1)).toBe(true)
  })

  it("同输入必得同输出", () => {
    const run = () =>
      JSON.stringify(applyRerankOrder(cand(8), [{ index: 2, score: 0.5 }, { index: 5, score: 0.5 }], 8))
    expect(run()).toBe(run())
  })
})

describe("rerank / 归一化与业务倍率的关系（本层的存在理由）", () => {
  /** 业务倍率：非优先类 ×0.85、优先类 ×1.15（`rankKnowledgeEntriesForAgent`） */
  const BUSINESS_WORST = 0.85
  const BUSINESS_BEST = 1.15

  /** 真实 Cross-Encoder 输出的四种典型形态 */
  const distributions = {
    强相关弱相关混合: [0.9974, 0.9821, 0.9033, 0.721, 0.5088, 0.3102, 0.1509, 0.0771, 0.0332, 0.0108, 0.0031, 0.0004],
    top2断层: [0.9852, 0.4417, 0.4203, 0.4102, 0.3988, 0.3871, 0.376, 0.3654, 0.3541, 0.3433, 0.332, 0.3211],
    典型相关集: [0.9912, 0.9876, 0.9743, 0.9502, 0.9104, 0.8733, 0.8102, 0.7655, 0.7012, 0.6021, 0.512, 0.4308],
    候选几乎并列: [0.8331, 0.8328, 0.8319, 0.831, 0.8298, 0.8291, 0.8284, 0.8277, 0.8269, 0.8261, 0.8255, 0.8249],
  }

  const applyBy = (scores: number[]) =>
    applyRerankOrder(
      scores.map((_, i) => ({ ...cand(12)[i] })),
      scores.map((score, i) => ({ index: i, score })),
      scores.length,
    )

  it("★ 原始跨度横跨 4 个数量级（1.0× ～ 2493×）", () => {
    const spreads = Object.values(distributions).map((s) => s[0] / s[s.length - 1])
    expect(Math.min(...spreads)).toBeCloseTo(1.0099, 3)
    expect(Math.max(...spreads)).toBeCloseTo(2493.5, 0)
  })

  it("★ 归一化把跨度一律锁死为 2×", () => {
    for (const scores of Object.values(distributions)) {
      const out = applyBy(scores)
      expect(out[0].score / out[out.length - 1].score).toBeCloseTo(1 / FUSION_SCORE_FLOOR, 6)
    }
  })

  it("★ 跨度≈1.0× 时，原始分下检索首位会被 1.35× 业务倍率实翻（归一化后保住）", () => {
    const weak = distributions.候选几乎并列
    expect(weak[0] * BUSINESS_WORST).toBeLessThan(weak[weak.length - 1] * BUSINESS_BEST)

    const norm = applyBy(weak)
    expect(norm[0].score * BUSINESS_WORST).toBeGreaterThan(
      norm[norm.length - 1].score * BUSINESS_BEST,
    )
  })

  it("★ 跨度 2493× 时，末位吃满业务倍率仍沉底（业务偏好形同虚设）", () => {
    const strong = distributions.强相关弱相关混合
    const stacked = strong[strong.length - 1] * BUSINESS_BEST * 1.2 * 1.35 * 1.3
    expect(stacked).toBeLessThan(strong[0] * BUSINESS_WORST)
  })

  it("归一化后业务倍率仍能调整相邻位次——能力边界，不是缺陷", () => {
    const out = applyBy(distributions.典型相关集)
    const adjacentGap = out[0].score / out[1].score
    // 相邻位次分差小于业务倍率跨度时必然互换，这是数学上的必然
    expect(out[0].score * BUSINESS_WORST < out[1].score * BUSINESS_BEST).toBe(
      adjacentGap < BUSINESS_BEST / BUSINESS_WORST,
    )
  })

  it("追加条目的分数以相对步长递减（不是会被业务倍率抹平的绝对间隔）", () => {
    const out = applyRerankOrder(cand(8), [{ index: 0, score: 0.9 }], 8)
    const rest = out.filter((x) => x.score < FUSION_SCORE_FLOOR)
    expect(rest.length).toBeGreaterThan(1)
    expect(rest[0].score).toBeCloseTo(FUSION_SCORE_FLOOR * (1 - APPENDED_SCORE_STEP), 6)
    expect(rest.every((x, i, arr) => i === 0 || arr[i - 1].score > x.score)).toBe(true)
  })
})

describe("rank-fusion / P2 抽取泛型归一化后行为不变", () => {
  it("normalizeScoreToFloor 对任意带 score 的结构可用", () => {
    const out = normalizeScoreToFloor([{ id: "a", score: 0 }, { id: "b", score: 10 }])
    expect(out[0].score).toBe(FUSION_SCORE_FLOOR)
    expect(out[1].score).toBe(1)
  })

  it("空数组 / 同分 / 单条 的退化行为", () => {
    expect(normalizeScoreToFloor([])).toEqual([])
    expect(normalizeScoreToFloor([{ score: 3 }, { score: 3 }]).every((x) => x.score === 1)).toBe(true)
    expect(normalizeScoreToFloor([{ score: 7 }])[0].score).toBe(1)
  })

  it("不入参修改", () => {
    const input = [{ score: 1 }, { score: 5 }]
    normalizeScoreToFloor(input)
    expect(input[0].score).toBe(1)
  })
})
