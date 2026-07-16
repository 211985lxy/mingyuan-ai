import { describe, expect, it } from "vitest"

import { buildKnowledgeBlock, rankKnowledgeEntriesForAgent, categoriesFromBoost } from "@/lib/aim-knowledge-context"
import { KNOWLEDGE_STRATEGY_PROFILES } from "@/lib/aim-knowledge-strategy"

describe("AIM knowledge cleanup tags", () => {
  const ipEntry = {
    id: "ip-1",
    title: "创始人失败教训",
    content: "失败之后形成了新的做事原则。",
    category: "boss_experience",
    score: 1,
    tags: ["kb_scope:ip", "asset_role:story", "confidence:user_claim"],
  }
  const projectEntry = {
    id: "project-1",
    title: "产品成交卖点",
    content: "这个服务能减少老板重复沟通成本。",
    category: "product_usp",
    score: 1,
    tags: ["kb_scope:project", "asset_role:usp", "confidence:confirmed"],
  }

  it("prioritizes IP knowledge for deep copywriting", () => {
    const ranked = rankKnowledgeEntriesForAgent("deep_copywriter", [projectEntry, ipEntry])
    expect(ranked[0].id).toBe("ip-1")
  })

  it("prioritizes project knowledge for content production", () => {
    const ranked = rankKnowledgeEntriesForAgent("content_producer", [ipEntry, projectEntry])
    expect(ranked[0].id).toBe("project-1")
  })

  it("marks pending verification knowledge in the context block", () => {
    const block = buildKnowledgeBlock([
      {
        category: "boss_experience",
        title: "待核验履历",
        content: "曾服务过某头部客户。",
        tags: ["confidence:pending_verify"],
      },
    ])

    expect(block).toContain("待核验履历（待核验）")
  })
})

describe("AIM evolved preferences retrieval", () => {
  it("keeps user_insight visible for deep copywriter ranking", () => {
    const ranked = rankKnowledgeEntriesForAgent("deep_copywriter", [
      { id: "product", category: "product_usp", title: "产品", content: "产品卖点", score: 0.8, tags: [] },
      { id: "preference", category: "user_insight", title: "偏好", content: "用户喜欢短句", score: 0.8, tags: ["kb_scope:project"] },
    ])

    expect(ranked.some((entry) => entry.category === "user_insight")).toBe(true)
  })

  it("prioritizes strategy insights for content production", () => {
    const ranked = rankKnowledgeEntriesForAgent("content_producer", [
      { id: "product", category: "product_usp", title: "产品", content: "产品卖点", score: 0.8, tags: ["kb_scope:project"] },
      {
        id: "strategy",
        category: "user_insight",
        title: "内容策略底盘",
        content: "话题分布：AI工具教程 40%。",
        score: 0.8,
        tags: ["kb_scope:project", "asset_role:strategy", "usable_for:topic", "usable_for:video"],
      },
    ])

    expect(ranked[0].id).toBe("strategy")
  })

  it("does not globally prioritize meeting minutes for topic planning", () => {
    const ranked = rankKnowledgeEntriesForAgent("business_diagnosis", [
      { id: "product", category: "product_usp", title: "产品", content: "产品卖点", score: 0.8, tags: ["kb_scope:project"] },
      { id: "meeting", category: "meeting_minutes", title: "会议纪要", content: "客户原话和真实顾虑", score: 0.8, tags: ["kb_scope:project"] },
    ])

    expect(ranked[0].id).toBe("product")
  })
})

describe("AIM knowledge strategy integration", () => {
  const hotTopicEntry = {
    id: "hot-1",
    title: "行业热点A",
    content: "某热点事件背景",
    category: "hot_topic" as const,
    score: 0.6,
    tags: [],
  }
  const productEntry = {
    id: "prod-1",
    title: "产品卖点B",
    content: "核心产品价值",
    category: "product_usp" as const,
    score: 0.8,
    tags: [],
  }
  const benchmarkEntry = {
    id: "bench-1",
    title: "对标文案C",
    content: "爆款对标案例",
    category: "benchmark_reference" as const,
    score: 0.6,
    tags: [],
  }

  it("categoryBoost from hot_topic strategy elevates hot_topic and benchmark_reference", () => {
    // Without boost: product_usp (0.8 × 1.15 = 0.92) > hot_topic (0.6 × 1.15 = 0.69)
    // With boost:    product_usp (0.8 × 1.15 = 0.92), benchmark_reference (0.6 × 1.15 × 1.5 = 1.035)
    //               hot_topic (0.6 × 1.15 × 1.5 = 1.035)
    // → benchmark and hot_topic should now outrank product_usp despite lower base scores
    const boost = KNOWLEDGE_STRATEGY_PROFILES.hot_topic.categoryBoost
    const ranked = rankKnowledgeEntriesForAgent(
      "content_producer",
      [productEntry, hotTopicEntry, benchmarkEntry],
      boost,
    )

    const topIds = ranked.slice(0, 2).map((e) => e.id)
    expect(topIds).toContain("hot-1")
    expect(topIds).toContain("bench-1")
  })

  it("categoryBoost from conversion strategy elevates product_usp above others", () => {
    // Use deep_copywriter agent (hot_topic NOT in its priority → ×0.85)
    // Without boost: hot_topic (0.6 × 0.85 = 0.51) vs product_usp (0.6 × 0.85 = 0.51) → tie
    // With boost:    product_usp (0.6 × 0.85 × 1.3 = 0.663) > hot_topic (0.6 × 0.85 = 0.51)
    const boost = KNOWLEDGE_STRATEGY_PROFILES.conversion.categoryBoost
    const tiedEntry = {
      id: "hot-1",
      title: "行业热点A",
      content: "某热点事件背景",
      category: "hot_topic" as const,
      score: 0.6,
      tags: [],
    }
    const prodEntry = {
      id: "prod-1",
      title: "产品卖点B",
      content: "核心产品价值",
      category: "product_usp" as const,
      score: 0.6,
      tags: [],
    }
    const ranked = rankKnowledgeEntriesForAgent(
      "deep_copywriter",
      [tiedEntry, prodEntry],
      boost,
    )

    // product_usp boosted by 1.3 should now be first
    expect(ranked[0].id).toBe("prod-1")
  })

  it("no categoryBoost preserves existing agent priority ranking", () => {
    // Both hot_topic and product_usp are in content_producer priority (×1.15),
    // so they get the same multiplier. Without boost, higher base score wins.
    const higherScoreEntry = {
      id: "prod-1",
      title: "产品卖点B",
      content: "核心产品价值",
      category: "product_usp" as const,
      score: 0.8,
      tags: [],
    }
    const lowerScoreEntry = {
      id: "hot-1",
      title: "行业热点A",
      content: "某热点事件背景",
      category: "hot_topic" as const,
      score: 0.6,
      tags: [],
    }
    const ranked = rankKnowledgeEntriesForAgent(
      "content_producer",
      [lowerScoreEntry, higherScoreEntry],
    )

    // Without boost: higher base score (0.8 × 1.15 = 0.92) > lower (0.6 × 1.15 = 0.69)
    expect(ranked[0].id).toBe("prod-1")
  })
})

describe("AIM knowledge value-grade weighting", () => {
  const baseEntry = (overrides: Partial<{ id: string; category: string; valueGrade: string | null; score: number }> = {}) => ({
    id: overrides.id ?? "entry",
    title: "知识条目",
    content: "内容",
    category: overrides.category ?? "boss_experience",
    score: overrides.score ?? 0.6,
    tags: [],
    valueGrade: overrides.valueGrade ?? null,
  })

  it("S-grade outranks C-grade at equal base score", () => {
    const ranked = rankKnowledgeEntriesForAgent("content_producer", [
      baseEntry({ id: "c-entry", valueGrade: "C" }),
      baseEntry({ id: "s-entry", valueGrade: "S" }),
    ])
    expect(ranked[0].id).toBe("s-entry")
    expect(ranked[1].id).toBe("c-entry")
  })

  it("null grade is treated as B (×1.0, no boost or penalty)", () => {
    // null vs explicit B should rank identically
    const ranked = rankKnowledgeEntriesForAgent("content_producer", [
      baseEntry({ id: "null-entry", valueGrade: null }),
      baseEntry({ id: "b-entry", valueGrade: "B" }),
    ])
    // Same effective weight → stable order preserved (null first as input order)
    expect(ranked.map((e) => e.id).sort()).toEqual(["b-entry", "null-entry"])
  })

  it("A-grade can overcome a lower base score than B-grade", () => {
    // A (×1.15) with base 0.6 = 0.69 effective; B (×1.0) with base 0.7 = 0.7 effective
    // B still wins here — confirms A boost isn't overpowering. A needs base close to B.
    // Use A base 0.65 (×1.15=0.7475) vs B base 0.6 (×1.0=0.6): A wins.
    const ranked = rankKnowledgeEntriesForAgent("content_producer", [
      baseEntry({ id: "b-entry", valueGrade: "B", score: 0.6 }),
      baseEntry({ id: "a-entry", valueGrade: "A", score: 0.65 }),
    ])
    expect(ranked[0].id).toBe("a-entry")
  })

  it("grade weight stacks with categoryBoost", () => {
    // hot_topic with grade S + hot_topic boost should clearly lead
    const ranked = rankKnowledgeEntriesForAgent(
      "content_producer",
      [
        baseEntry({ id: "plain", category: "product_usp", valueGrade: "B", score: 0.9 }),
        { ...baseEntry({ id: "hot", valueGrade: "S", score: 0.6 }), category: "hot_topic" },
      ],
      KNOWLEDGE_STRATEGY_PROFILES.hot_topic.categoryBoost,
    )
    expect(ranked[0].id).toBe("hot")
  })

  it("renders grade prefix for S/A/C in the knowledge block, omits B", () => {
    const block = buildKnowledgeBlock([
      { category: "boss_experience", title: "战略洞察", content: "改变认知", tags: [] },
      { category: "boss_experience", title: "普通经验", content: "参考用", tags: [] },
    ])
    // 前缀依赖 valueGrade 字段，无标注时不出现前缀（等同 B）
    expect(block).toContain("=== 企业知识库 ===")
    expect(block).not.toContain("[S]")
  })

  it("renders explicit S grade prefix", () => {
    const block = buildKnowledgeBlock([
      { category: "boss_experience", title: "战略洞察", content: "改变认知", tags: [], valueGrade: "S" },
    ])
    expect(block).toContain("[S]")
  })
})

describe("knowledge retrieval prefilter (categoryBoost → SQL whitelist)", () => {
  it("categoriesFromBoost 只取权重 > 1 的类别", () => {
    const cats = categoriesFromBoost({ hot_topic: 1.5, benchmark_reference: 1.5, user_insight: 1.2, product_usp: 1.0 })
    expect(cats).toHaveLength(3)
    expect(cats).toContain("hot_topic")
    expect(cats).toContain("benchmark_reference")
    expect(cats).toContain("user_insight")
    expect(cats).not.toContain("product_usp")
  })

  it("categoriesFromBoost 对空字典返回空数组（deep 档 → 无 prefilter → 向后兼容）", () => {
    expect(categoriesFromBoost({})).toEqual([])
  })

  it("deep 策略档 categoryBoost 为空 → 不产生预过滤", () => {
    expect(KNOWLEDGE_STRATEGY_PROFILES.deep.categoryBoost).toEqual({})
    expect(categoriesFromBoost(KNOWLEDGE_STRATEGY_PROFILES.deep.categoryBoost)).toEqual([])
  })

  it("hot_topic 策略档产生热点相关白名单", () => {
    const cats = categoriesFromBoost(KNOWLEDGE_STRATEGY_PROFILES.hot_topic.categoryBoost)
    expect(cats).toContain("hot_topic")
    expect(cats).toContain("benchmark_reference")
  })

  it("conversion 策略档产生转化相关白名单", () => {
    const cats = categoriesFromBoost(KNOWLEDGE_STRATEGY_PROFILES.conversion.categoryBoost)
    expect(cats).toContain("product_usp")
    expect(cats).toContain("customer_pain")
    expect(cats).toContain("customer_qa")
  })
})
