import { describe, expect, it } from "vitest"
import {
  DEFAULT_RRF_K,
  FUSION_SCORE_FLOOR,
  fuseEntryLists,
  normalizeFusedScores,
  reciprocalRankFusion,
} from "@/lib/llm/rank-fusion"
import {
  MAX_KEYWORD_QUERY_CHARS,
  bestRelevanceByEntry,
  buildKeywordQueryText,
  buildKeywordSearchSql,
  countPlaceholders,
  sanitizeKeywordQuery,
} from "@/lib/llm/keyword-query"

/**
 * P1 混合检索契约测试（融合层 + 关键词纯函数层）
 *
 * 两条最关键的断言：
 * 1. **归一化的存在理由**：RRF 原始分跨度随两路重合结构在 1.18×～2.36× 间浮动，
 *    而业务倍率跨度可达 1.35×（`rankKnowledgeEntriesForAgent`）。不归一化，
 *    「关键词路降级」这一档（跨度 1.18×）的检索首位会被业务倍率翻盘。
 * 2. **注入防线**：用户输入只出现在 `values`，绝不出现在 SQL 文本里。
 */

const entry = (id: string, score = 1) => ({
  id,
  score,
  title: `T-${id}`,
  content: `C-${id}`,
  category: "customer_pain",
  tags: ["kb_scope:ip"],
  valueGrade: "S",
})
const ranked = (...ids: string[]) => ids.map((id, index) => entry(id, 1 - index * 0.05))
const spreadOf = (ranks: Array<{ score: number }>) => ranks[0].score / ranks[ranks.length - 1].score
const PROJECT_SCOPE = { projectId: "proj_1", userId: "user_1" }

describe("rank-fusion / RRF 基本行为", () => {
  it("空输入与空榜单都返回空", () => {
    expect(reciprocalRankFusion([])).toEqual([])
    expect(reciprocalRankFusion([[], []])).toEqual([])
  })

  it("记下各榜单的 1-based 名次，未出现处为 0", () => {
    // b 被两路都命中（1/62 + 1/61）分数高于只被一路命中的 a（1/61），故 b 在前
    const fused = reciprocalRankFusion([ranked("a", "b"), ranked("b")])
    expect(fused.map((r) => r.id)).toEqual(["b", "a"])
    expect(fused.map((r) => r.ranks)).toEqual([
      [2, 1],
      [1, 0],
    ])
  })

  it("在两路都命中的条目优先于只被一路命中的", () => {
    const fused = reciprocalRankFusion([ranked("a", "b", "c", "z"), ranked("b", "c", "a", "y")])
    const zIndex = fused.findIndex((r) => r.id === "z")
    expect(zIndex).toBeGreaterThan(2)
  })

  it("同一榜单内重复 id 只记首次名次", () => {
    const fused = reciprocalRankFusion([[entry("a"), entry("a"), entry("b")]])
    expect(fused).toHaveLength(2)
    expect(fused.find((r) => r.id === "b")?.ranks[0]).toBe(2)
  })

  it("权重为 0 或负数的榜单被整体忽略", () => {
    expect(reciprocalRankFusion([ranked("a"), ranked("b")], { weights: [1, 0] }).map((r) => r.id)).toEqual(["a"])
    expect(reciprocalRankFusion([ranked("a"), ranked("b")], { weights: [0, 0] })).toEqual([])
  })

  it("默认 k 为 60，非法 k 回落默认值", () => {
    const expected = 1 / (DEFAULT_RRF_K + 1)
    expect(reciprocalRankFusion([ranked("a")])[0].score).toBeCloseTo(expected, 12)
    expect(reciprocalRankFusion([ranked("a")], { k: 10 })[0].score).toBeCloseTo(1 / 11, 12)
    expect(reciprocalRankFusion([ranked("a")], { k: -5 })[0].score).toBeCloseTo(expected, 12)
  })

  it("同输入必得同输出（不依赖 sort 稳定性）", () => {
    const twice = () => JSON.stringify(reciprocalRankFusion([ranked("a", "b"), ranked("c", "a")]))
    expect(twice()).toBe(twice())
  })
})

describe("rank-fusion / 归一化与业务倍率的关系", () => {
  const vector12 = ranked("a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l")

  it("归一化把分数映射到 [floor, 1] 且不改顺序", () => {
    const raw = reciprocalRankFusion([vector12, ranked("a", "b")])
    const norm = normalizeFusedScores(raw)
    expect(norm[0].score).toBe(1)
    expect(norm[norm.length - 1].score).toBe(FUSION_SCORE_FLOOR)
    expect(norm.map((r) => r.id)).toEqual(raw.map((r) => r.id))
  })

  it("★ 原始 RRF 跨度随两路重合结构浮动（不受控量）", () => {
    const single = spreadOf(reciprocalRankFusion([vector12]))
    const overlap = spreadOf(reciprocalRankFusion([vector12, ranked("a", "b")]))
    expect(single).toBeCloseTo(1.18, 2)
    expect(overlap).toBeCloseTo(2.36, 2)
    expect(overlap / single).toBeGreaterThan(1.9)
  })

  it("★ 归一化后跨度被钉死在 2×，与重合结构无关", () => {
    const cases = [
      reciprocalRankFusion([vector12]),
      reciprocalRankFusion([vector12, ranked("a", "b")]),
      reciprocalRankFusion([vector12, ranked("A", "B", "C")]),
    ]
    for (const raw of cases) {
      expect(spreadOf(normalizeFusedScores(raw))).toBeCloseTo(2, 9)
    }
  })

  it("★ 不归一化：关键词路降级时检索首位被业务倍率翻盘", () => {
    const raw = reciprocalRankFusion([vector12])
    const worst = raw[0].score * 0.85 // 非优先类
    const best = raw[raw.length - 1].score * 1.15 // 优先类
    expect(worst).toBeLessThan(best)
  })

  it("★ 归一化后：同一场景检索首位保住", () => {
    const norm = normalizeFusedScores(reciprocalRankFusion([vector12]))
    expect(norm[0].score * 0.85).toBeGreaterThan(norm[norm.length - 1].score * 1.15)
  })

  it("同分 / 单条统一给 1，空数组返回空", () => {
    expect(normalizeFusedScores([
      { id: "a", score: 0.01, ranks: [1] },
      { id: "b", score: 0.01, ranks: [2] },
    ]).every((r) => r.score === 1)).toBe(true)
    expect(normalizeFusedScores([{ id: "a", score: 0.0164, ranks: [1] }])[0].score).toBe(1)
    expect(normalizeFusedScores([])).toEqual([])
  })

  it("floor 非法值被夹紧或回落默认", () => {
    const raw = reciprocalRankFusion([vector12, ranked("a", "b")])
    expect(normalizeFusedScores(raw, 5).every((r) => r.score === 1)).toBe(true)
    expect(normalizeFusedScores(raw, -3)[raw.length - 1].score).toBe(0)
    expect(normalizeFusedScores(raw, Number.NaN)[raw.length - 1].score).toBe(FUSION_SCORE_FLOOR)
  })
})

describe("rank-fusion / fuseEntryLists", () => {
  it("去重、降序、保留原条目字段，只替换 score", () => {
    const vector = ranked("a", "b", "c")
    const keyword = ranked("c", "d", "a")
    const merged = fuseEntryLists([vector, keyword])

    expect(merged).toHaveLength(4)
    expect(merged.every((e, i) => i === 0 || merged[i - 1].score >= e.score)).toBe(true)
    expect(merged[0].title).toBe(`T-${merged[0].id}`)
    expect(merged[0].category).toBe("customer_pain")
    expect(merged[0].valueGrade).toBe("S")
    expect(merged.every((e) => e.score >= FUSION_SCORE_FLOOR && e.score <= 1)).toBe(true)
  })

  it("双路命中的条目排在仅单路命中之前", () => {
    const merged = fuseEntryLists([ranked("a", "b", "c"), ranked("c", "d", "a")])
    expect(merged.findIndex((e) => e.id === "a")).toBeLessThan(merged.findIndex((e) => e.id === "b"))
  })

  it("单路为空时优雅降级为另一路的顺序", () => {
    expect(fuseEntryLists([ranked("a", "b"), []])[0].id).toBe("a")
    expect(fuseEntryLists([[], []])).toEqual([])
  })

  it("不修改入参", () => {
    const vector = ranked("a", "b")
    fuseEntryLists([vector, ranked("b")])
    expect(vector[0].score).toBe(1)
  })
})

describe("keyword-query / 查询清洗", () => {
  it("空、空白、纯标点、非字符串都返回空串", () => {
    expect(sanitizeKeywordQuery("")).toBe("")
    expect(sanitizeKeywordQuery("   \n\t ")).toBe("")
    expect(sanitizeKeywordQuery("，。！？（）【】")).toBe("")
    expect(sanitizeKeywordQuery(undefined as unknown as string)).toBe("")
  })

  it("凑不出 bigram 的查询返回空串（单字 / 单字母）", () => {
    expect(sanitizeKeywordQuery("甲")).toBe("")
    expect(sanitizeKeywordQuery("a")).toBe("")
    expect(sanitizeKeywordQuery("供暖")).toBe("供暖")
    expect(sanitizeKeywordQuery("AI")).toBe("AI")
    expect(sanitizeKeywordQuery("2026")).toBe("2026")
  })

  it("★ 剥离引号、布尔操作符与标点（防 phrase 语义与模式切换突变）", () => {
    const sanitized = sanitizeKeywordQuery(`"中汝达" OR 1=1 -- ' DROP TABLE`)
    expect(sanitized).not.toMatch(/["'`]/)
    expect(sanitized).not.toMatch(/[-=;]/)
    expect(sanitized).toContain("中汝达")
  })

  it("NFKC 归一、去控制字符、折叠空白、清中文标点", () => {
    expect(sanitizeKeywordQuery("ＡＩ供暖")).toBe("AI供暖")
    expect(sanitizeKeywordQuery("供\u0000暖\u001F方案")).toBe("供 暖 方案")
    expect(sanitizeKeywordQuery("供暖   方案\n\n对比")).toBe("供暖 方案 对比")
    expect(sanitizeKeywordQuery("供暖，方案：对比")).toBe("供暖 方案 对比")
  })

  it("截断到上限，参数可覆盖", () => {
    expect(sanitizeKeywordQuery("甲".repeat(500))).toHaveLength(MAX_KEYWORD_QUERY_CHARS)
    expect(sanitizeKeywordQuery("甲".repeat(500), 10)).toHaveLength(10)
  })

  it("保留英文数字混排，内部连字符转为空格", () => {
    expect(sanitizeKeywordQuery("bge-reranker-v2-m3")).toBe("bge reranker v2 m3")
  })
})

describe("keyword-query / 查询文本组装", () => {
  it("纳入查询与选题标题，忽略空标题", () => {
    expect(buildKeywordQueryText({ query: "供暖成本", topicTitle: "中汝达" })).toBe("供暖成本 中汝达")
    expect(buildKeywordQueryText({ query: "供暖成本" })).toBe("供暖成本")
    expect(buildKeywordQueryText({ query: "供暖成本", topicTitle: "   " })).toBe("供暖成本")
  })

  it("★ 选题理由不参与关键词召回（会撑大 ngram 并集、拉平排序）", () => {
    const text = buildKeywordQueryText({
      query: "供暖",
      topicTitle: "选题",
      topicRationale: "因为客户反复反馈燃气成本偏高",
    })
    expect(text).not.toContain("客户反复反馈")
  })
})

describe("keyword-query / SQL 拼装", () => {
  it("项目模式按 projectId 隔离，个人模式按 userId + projectId IS NULL", () => {
    const project = buildKeywordSearchSql({ scope: PROJECT_SCOPE, query: "供暖", limit: 10 })
    expect(project.text).toContain("e.`projectId` = ?")
    expect(project.text).not.toContain("IS NULL")

    const personal = buildKeywordSearchSql({ scope: { projectId: null, userId: "u1" }, query: "供暖", limit: 10 })
    expect(personal.text).toContain("e.`userId` = ? AND e.`projectId` IS NULL")
  })

  it("使用 NATURAL LANGUAGE MODE、显式 ORDER BY、双状态过滤", () => {
    const built = buildKeywordSearchSql({ scope: PROJECT_SCOPE, query: "供暖", limit: 10 })
    expect(built.text).toContain("IN NATURAL LANGUAGE MODE")
    expect(built.text).not.toContain("BOOLEAN")
    expect(built.text).toContain("ORDER BY relevance DESC")
    expect(built.text).toContain("c.`status` = 'completed'")
    expect(built.text).toContain("e.`status` = 'active'")
  })

  it("占位符数量与 values 长度始终一致", () => {
    const variants = [
      buildKeywordSearchSql({ scope: PROJECT_SCOPE, query: "供暖", limit: 10 }),
      buildKeywordSearchSql({ scope: { projectId: null, userId: "u1" }, query: "供暖", limit: 10 }),
      buildKeywordSearchSql({ scope: PROJECT_SCOPE, query: "供暖", categories: ["a", "b"], limit: 10 }),
      buildKeywordSearchSql({ scope: PROJECT_SCOPE, query: "供暖", categories: ["a"], valueGrades: ["S", "A"], limit: 10 }),
    ]
    for (const built of variants) {
      expect(countPlaceholders(built.text)).toBe(built.values.length)
    }
  })

  it("前两个参数都是查询文本（SELECT 与 WHERE 各一次）", () => {
    const built = buildKeywordSearchSql({ scope: PROJECT_SCOPE, query: "供暖 成本", limit: 10 })
    expect(built.values[0]).toBe("供暖 成本")
    expect(built.values[1]).toBe("供暖 成本")
  })

  it("★ 用户输入绝不出现在 SQL 文本中，全部走参数绑定", () => {
    const hostile = "供暖'); DROP TABLE KnowledgeEntry; --"
    const built = buildKeywordSearchSql({ scope: PROJECT_SCOPE, query: hostile, limit: 50 })
    expect(built.text).not.toContain("DROP TABLE")
    expect(built.text).not.toContain(";")
    expect(built.values).toContain(hostile)
    expect(countPlaceholders(built.text)).toBe(built.values.length)
  })

  it("过滤白名单去重、trim、上限 32", () => {
    const deduped = buildKeywordSearchSql({
      scope: PROJECT_SCOPE,
      query: "供暖",
      categories: ["customer_pain", "customer_pain", " product_usp "],
      limit: 10,
    })
    expect(deduped.text).toContain("e.`category` IN (?, ?)")
    expect(deduped.values).toContain("product_usp")
    expect(deduped.values).not.toContain(" product_usp ")

    const capped = buildKeywordSearchSql({
      scope: PROJECT_SCOPE,
      query: "供暖",
      categories: Array.from({ length: 60 }, (_, i) => `c${i}`),
      limit: 10,
    })
    // 2 个 MATCH + 1 个作用域 + 32 个类别
    expect(countPlaceholders(capped.text)).toBe(35)
  })

  it("空过滤数组不产生 IN 子句", () => {
    const built = buildKeywordSearchSql({ scope: PROJECT_SCOPE, query: "供暖", categories: [], valueGrades: [], limit: 5 })
    expect(built.text).not.toContain(" IN (")
  })

  it("LIMIT 内联为整数、不占占位符、非法值被归一", () => {
    const limitOf = (limit: number) => buildKeywordSearchSql({ scope: PROJECT_SCOPE, query: "供暖", limit }).text
    expect(limitOf(600)).toContain("LIMIT 600")
    expect(limitOf(3.9)).toContain("LIMIT 3")
    expect(limitOf(0)).toContain("LIMIT 1")
    expect(limitOf(Number.NaN)).toContain("LIMIT 1")
    expect(countPlaceholders(limitOf(7))).toBe(3) // 2 MATCH + 1 作用域
  })

  it("scope.projectId 为空串时按个人模式处理", () => {
    const built = buildKeywordSearchSql({ scope: { projectId: "", userId: "u1" }, query: "供暖", limit: 5 })
    expect(built.text).toContain("IS NULL")
  })
})

describe("keyword-query / 块命中聚合", () => {
  it("按条目取最高相关度，而不是求和", () => {
    const best = bestRelevanceByEntry([
      { entryId: "e1", relevance: 3.2 },
      { entryId: "e1", relevance: 9.5 },
      { entryId: "e1", relevance: 1.1 },
      { entryId: "e2", relevance: 4.0 },
    ])
    expect(best.get("e1")).toBe(9.5)
    expect(best.get("e2")).toBe(4.0)
  })

  it("丢弃 0、负数、NaN、不可解析值与非法 entryId", () => {
    const best = bestRelevanceByEntry([
      { entryId: "zero", relevance: 0 },
      { entryId: "neg", relevance: -2 },
      { entryId: "nan", relevance: Number.NaN },
      { entryId: "bad", relevance: "abc" },
      { entryId: 123, relevance: 5 },
      { entryId: "", relevance: 7 },
    ])
    expect(best.size).toBe(0)
  })

  it("兼容字符串形态的数值（原始 SQL 的 DOUBLE 读回）", () => {
    expect(bestRelevanceByEntry([{ entryId: "e1", relevance: "8.25" }]).get("e1")).toBe(8.25)
  })

  it("空输入与 null 行不崩", () => {
    expect(bestRelevanceByEntry([]).size).toBe(0)
    expect(bestRelevanceByEntry([null as unknown as { entryId: unknown; relevance: unknown }]).size).toBe(0)
  })
})

describe("端到端：两路召回 → 融合", () => {
  it("精确术语与语义近邻都进前列，仅单路命中的被压后", () => {
    const vectorPath = [entry("e_sem", 0.91), entry("e_mid", 0.88), entry("e_term", 0.72), ...ranked("e_x", "e_y")]
    const keywordPath = [entry("e_term", 12.4), entry("e_sem", 3.1), ...ranked("e_z")]
    const fused = fuseEntryLists([vectorPath, keywordPath])

    expect(["e_sem", "e_term"]).toContain(fused[0].id)
    expect(["e_sem", "e_term"]).toContain(fused[1].id)
    expect(fused.findIndex((e) => e.id === "e_x")).toBeGreaterThan(2)
    expect(fused.every((e) => e.score >= FUSION_SCORE_FLOOR && e.score <= 1)).toBe(true)
  })
})
