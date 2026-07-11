import { describe, expect, it } from "vitest"
import { TOPIC_ELEMENTS, OPENING_TYPES, COPY_STRUCTURES, ENDING_TYPES } from "../../prisma/seed-topic-engine"
import { VALID_ELEMENT_CODES, VALID_OPENING_CODES, VALID_STRUCTURE_CODES, TopicCardSchema, TopicCardsSchema } from "../../src/lib/topic-validation"
import type { TopicCard } from "../../src/lib/topic-validation"
import { COPY_TO_VIDEO_STRUCTURE_MAP, FALLBACK_VIDEO_STRUCTURE, mapCopyToVideoStructure } from "../../src/lib/copy-structure-mapping"
import { CONFLICT_PAIRS, hasConflict, sampleElements } from "../../src/lib/topic-element-logic"
import { buildTopicSystemPrompt, buildTopicUserPrompt, normalizeTopicCards } from "../../src/lib/topic-generation"
import { VIDEO_STRUCTURES } from "../../prisma/seed-structures"

// ─── Seed Data Integrity ───────────────────────────────

describe("Topic Engine Seed Data", () => {
  it("has exactly 12 topic elements", () => {
    expect(TOPIC_ELEMENTS).toHaveLength(12)
  })

  it("has exactly 7 opening types", () => {
    expect(OPENING_TYPES).toHaveLength(7)
  })

  it("has exactly 9 copy structures (8 + universal)", () => {
    expect(COPY_STRUCTURES).toHaveLength(9)
    expect(COPY_STRUCTURES.find(s => s.code === "universal")).toBeTruthy()
  })

  it("has exactly 4 ending types", () => {
    expect(ENDING_TYPES).toHaveLength(4)
  })

  it("all element codes are unique", () => {
    const codes = TOPIC_ELEMENTS.map(e => e.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it("all opening codes are unique", () => {
    const codes = OPENING_TYPES.map(o => o.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it("all structure codes are unique", () => {
    const codes = COPY_STRUCTURES.map(s => s.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it("all ending codes are unique", () => {
    const codes = ENDING_TYPES.map(e => e.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it("every element has required fields", () => {
    for (const el of TOPIC_ELEMENTS) {
      expect(el.code).toBeTruthy()
      expect(el.name).toBeTruthy()
      expect(el.typeLabel).toBeTruthy()
      expect(el.description.length).toBeGreaterThan(10)
      expect(Array.isArray(el.conflictCodes)).toBe(true)
      expect(typeof el.sortOrder).toBe("number")
    }
  })

  it("every opening type has formulas and examples", () => {
    for (const ot of OPENING_TYPES) {
      expect(ot.formulas.length).toBeGreaterThanOrEqual(2)
      expect(ot.examples.length).toBeGreaterThanOrEqual(1)
      for (const ex of ot.examples) {
        expect(ex.title).toBeTruthy()
        expect(ex.script).toBeTruthy()
      }
    }
  })

  it("every copy structure has beats with label+instruction", () => {
    for (const cs of COPY_STRUCTURES) {
      expect(cs.beats.length).toBeGreaterThanOrEqual(3)
      for (const beat of cs.beats) {
        expect(beat.label).toBeTruthy()
        expect(beat.instruction).toBeTruthy()
      }
    }
  })

  it("every ending type has guidance and patterns", () => {
    for (const et of ENDING_TYPES) {
      expect(et.guidance.length).toBeGreaterThan(20)
      expect(et.patterns.length).toBeGreaterThanOrEqual(2)
    }
  })
})

// ─── Validation Schema Sync ────────────────────────────

describe("Validation Code Sync with Seed Data", () => {
  it("VALID_ELEMENT_CODES matches seed element codes", () => {
    const seedCodes = TOPIC_ELEMENTS.map(e => e.code).sort()
    const validCodes = [...VALID_ELEMENT_CODES].sort()
    expect(validCodes).toEqual(seedCodes)
  })

  it("VALID_OPENING_CODES matches seed opening codes", () => {
    const seedCodes = OPENING_TYPES.map(o => o.code).sort()
    const validCodes = [...VALID_OPENING_CODES].sort()
    expect(validCodes).toEqual(seedCodes)
  })

  it("VALID_STRUCTURE_CODES matches seed structure codes", () => {
    const seedCodes = COPY_STRUCTURES.map(s => s.code).sort()
    const validCodes = [...VALID_STRUCTURE_CODES].sort()
    expect(validCodes).toEqual(seedCodes)
  })
})

// ─── Zod Validation ────────────────────────────────────

describe("TopicCard Zod Schema", () => {
  it("accepts a valid topic card", () => {
    const card = {
      title: "空调省电的3个秘诀",
      elementCodes: ["cost", "practical"],
      openingTypeCode: "curiosity_open",
      structureCode: "three_beat_ramp",
    }
    const result = TopicCardSchema.safeParse(card)
    expect(result.success).toBe(true)
  })

  it("accepts optional recommendation fields", () => {
    const card = {
      title: "老板IP别乱发",
      elementCodes: ["trust", "practical"],
      openingTypeCode: "pain_open",
      structureCode: "pain_solution",
      rationale: "能把账号定位和内容执行直接连起来。",
      topicType: "人设型",
      sourceType: "行业热点",
      score: 88,
      scoreReason: "热点相关且有业务素材支撑。",
      hook: "别急着追热点，先看它能不能帮你省掉重复工作。",
      angle: "从素材整理、粗剪和复用三个流程展开。",
      cta: "评论“流程”，领取内容生产检查表。",
    }
    const result = TopicCardSchema.safeParse(card)
    expect(result.success).toBe(true)
  })

  it("rejects title over 20 chars", () => {
    const card = {
      title: "这是一个超过二十个字符的标题测试用例不应该通过验证",
      elementCodes: ["cost"],
      openingTypeCode: "curiosity_open",
      structureCode: "universal",
    }
    const result = TopicCardSchema.safeParse(card)
    expect(result.success).toBe(false)
  })

  it("rejects invalid element code", () => {
    const card = {
      title: "测试选题",
      elementCodes: ["nonexistent_code"],
      openingTypeCode: "curiosity_open",
      structureCode: "universal",
    }
    const result = TopicCardSchema.safeParse(card)
    expect(result.success).toBe(false)
  })

  it("rejects invalid opening type code", () => {
    const card = {
      title: "测试选题",
      elementCodes: ["cost"],
      openingTypeCode: "fake_opening",
      structureCode: "universal",
    }
    const result = TopicCardSchema.safeParse(card)
    expect(result.success).toBe(false)
  })

  it("rejects invalid structure code", () => {
    const card = {
      title: "测试选题",
      elementCodes: ["cost"],
      openingTypeCode: "curiosity_open",
      structureCode: "fake_structure",
    }
    const result = TopicCardSchema.safeParse(card)
    expect(result.success).toBe(false)
  })
})

describe("TopicCards (array of 4) Zod Schema", () => {
  const makeCard = (title: string) => ({
    title,
    elementCodes: ["cost", "practical"] as const,
    openingTypeCode: "curiosity_open" as const,
    structureCode: "universal" as const,
  })

  it("accepts exactly 4 unique cards", () => {
    const cards = [
      makeCard("选题一测试"),
      makeCard("选题二测试"),
      makeCard("选题三测试"),
      makeCard("选题四测试"),
    ]
    const result = TopicCardsSchema.safeParse(cards)
    expect(result.success).toBe(true)
  })

  it("rejects fewer than 4 cards", () => {
    const cards = [makeCard("选题一"), makeCard("选题二"), makeCard("选题三")]
    const result = TopicCardsSchema.safeParse(cards)
    expect(result.success).toBe(false)
  })

  it("rejects duplicate titles", () => {
    const cards = [
      makeCard("相同标题"),
      makeCard("相同标题"),
      makeCard("选题三测试"),
      makeCard("选题四测试"),
    ]
    const result = TopicCardsSchema.safeParse(cards)
    expect(result.success).toBe(false)
  })
})

describe("Topic Knowledge Context", () => {
  const elements = TOPIC_ELEMENTS.slice(0, 2)

  it("adds selected inspiration, benchmark, and user insight sources to the topic prompt", () => {
    const input = {
      ipProfile: null,
      elements,
      topicSources: [
        {
          category: "daily_inspiration",
          title: "老板晨会灵感",
          content: "老板提到老客户复购不是因为便宜，而是省心。",
        },
        {
          category: "benchmark_reference",
          title: "对标爆款开头",
          content: "同行爆款用客户踩坑故事做开场。",
        },
        {
          category: "user_insight",
          title: "客户高频问题",
          content: "客户总问售后响应到底多久。",
        },
      ],
    }

    const prompt = buildTopicUserPrompt(input, elements.map((e) => e.code))

    expect(prompt).toContain("## 本次选题素材")
    expect(prompt).toContain("日常灵感：老板晨会灵感")
    expect(prompt).toContain("对标参考：对标爆款开头")
    expect(prompt).toContain("用户洞察：客户高频问题")
    expect(prompt).toContain("老客户复购不是因为便宜")
    expect(prompt).toContain("售后响应到底多久")
  })

  it("truncates long selected source content in the topic prompt", () => {
    const longContent = "客户反复追问交付稳定性。".repeat(80)
    const input = {
      ipProfile: null,
      elements,
      topicSources: [
        {
          category: "user_insight",
          title: "长用户访谈",
          content: longContent,
        },
      ],
    }

    const prompt = buildTopicUserPrompt(input, elements.map((e) => e.code))

    expect(prompt).toContain("用户洞察：长用户访谈")
    expect(prompt).toContain("...")
    expect(prompt.length).toBeLessThan(longContent.length + 800)
  })
})

// ─── CopyStructure→VideoStructure Mapping ──────────────

describe("CopyStructure to VideoStructure Mapping", () => {
  const videoStructureNames = VIDEO_STRUCTURES.map(vs => vs.name)

  it("maps all 9 CopyStructure codes", () => {
    const mappedCodes = Object.keys(COPY_TO_VIDEO_STRUCTURE_MAP)
    expect(mappedCodes.sort()).toEqual([...VALID_STRUCTURE_CODES].sort())
  })

  it("every mapping target is a real VideoStructure name", () => {
    for (const vsName of Object.values(COPY_TO_VIDEO_STRUCTURE_MAP)) {
      expect(videoStructureNames).toContain(vsName)
    }
  })

  it("fallback is a valid VideoStructure", () => {
    expect(videoStructureNames).toContain(FALLBACK_VIDEO_STRUCTURE)
  })

  it("mapCopyToVideoStructure returns correct mapping", () => {
    expect(mapCopyToVideoStructure("suspense_reveal")).toBe("suspense-reveal")
    expect(mapCopyToVideoStructure("universal")).toBe("contrast-hook")
    expect(mapCopyToVideoStructure("pain_solution")).toBe("pain-resonance")
  })

  it("mapCopyToVideoStructure falls back for unknown codes", () => {
    expect(mapCopyToVideoStructure("totally_fake")).toBe(FALLBACK_VIDEO_STRUCTURE)
    expect(mapCopyToVideoStructure("")).toBe(FALLBACK_VIDEO_STRUCTURE)
  })
})

// ─── Element Conflict Logic ────────────────────────────

describe("Element Conflict Matrix", () => {
  it("has defined conflict pairs", () => {
    expect(CONFLICT_PAIRS.length).toBeGreaterThanOrEqual(4)
  })

  it("detects known conflicts", () => {
    expect(hasConflict("cost", "authority")).toBe(true)
    expect(hasConflict("authority", "cost")).toBe(true) // bidirectional
    expect(hasConflict("curiosity", "trust")).toBe(true)
    expect(hasConflict("cost", "emotion")).toBe(true)
    expect(hasConflict("authority", "identity")).toBe(true)
  })

  it("allows non-conflicting pairs", () => {
    expect(hasConflict("cost", "practical")).toBe(false)
    expect(hasConflict("novelty", "story")).toBe(false)
    expect(hasConflict("social", "contrast")).toBe(false)
  })

  it("sampleElements returns 2-3 elements", () => {
    const allCodes = TOPIC_ELEMENTS.map(e => e.code)
    for (let i = 0; i < 20; i++) {
      const sampled = sampleElements(allCodes, 2 + Math.round(Math.random()))
      expect(sampled.length).toBeGreaterThanOrEqual(2)
      expect(sampled.length).toBeLessThanOrEqual(3)
    }
  })

  it("sampleElements never returns conflicting pairs", () => {
    const allCodes = TOPIC_ELEMENTS.map(e => e.code)
    for (let i = 0; i < 50; i++) {
      const sampled = sampleElements(allCodes, 3)
      for (let a = 0; a < sampled.length; a++) {
        for (let b = a + 1; b < sampled.length; b++) {
          expect(hasConflict(sampled[a], sampled[b])).toBe(false)
        }
      }
    }
  })

  it("conflict codes in seed data match CONFLICT_PAIRS", () => {
    for (const [a, b] of CONFLICT_PAIRS) {
      const elA = TOPIC_ELEMENTS.find(e => e.code === a)
      const elB = TOPIC_ELEMENTS.find(e => e.code === b)
      expect(elA).toBeTruthy()
      expect(elB).toBeTruthy()
      expect(elA!.conflictCodes).toContain(b)
      expect(elB!.conflictCodes).toContain(a)
    }
  })
})

// ─── Topic Generation Prompts ──────────────────────────

describe("Topic Generation Prompts", () => {
  it("system prompt includes all valid opening codes", () => {
    const prompt = buildTopicSystemPrompt("fresh", [])
    for (const code of VALID_OPENING_CODES) {
      expect(prompt).toContain(code)
    }
  })

  it("system prompt includes all valid structure codes", () => {
    const prompt = buildTopicSystemPrompt("fresh", [])
    for (const code of VALID_STRUCTURE_CODES) {
      expect(prompt).toContain(code)
    }
  })

  it("system prompt specifies 4 cards", () => {
    const prompt = buildTopicSystemPrompt("fresh", [])
    expect(prompt).toContain("4")
  })

  it("daily prompt includes scoring and 24-hour hot-topic guidance", () => {
    const prompt = buildTopicSystemPrompt("fresh", [], "daily")
    expect(prompt).toContain("今日推荐模式")
    expect(prompt).toContain("最近 24 小时热点")
    expect(prompt).toContain("账号适配度、转化价值、流量潜力、素材支撑、执行难度")
    expect(prompt).toContain("topicType")
    expect(prompt).toContain("scoreReason")
    expect(prompt).toContain("hook（开头钩子）")
    expect(prompt).toContain("angle（展开角度）")
    expect(prompt).toContain("cta（结尾行动）")
  })

  it("weekly prompt treats hot topics as references", () => {
    const prompt = buildTopicSystemPrompt("fresh", [], "weekly")
    expect(prompt).toContain("本周选题模式")
    expect(prompt).toContain("不要过度依赖单日新闻")
  })

  it("user prompt uses meeting minutes without making them global priority", () => {
    const prompt = buildTopicUserPrompt(
      {
        elements: TOPIC_ELEMENTS.slice(0, 2),
        topicSources: [
          {
            category: "meeting_minutes",
            title: "客户复盘会",
            content: "客户原话：为什么我们的报价比别人高？",
          },
        ],
      },
      TOPIC_ELEMENTS.slice(0, 2).map((item) => item.code),
    )

    expect(prompt).toContain("会议纪要参与规则")
    expect(prompt).toContain("不要默认压过其他资料")
  })

  it("user prompt treats client project as the IP operation baseline", () => {
    const prompt = buildTopicUserPrompt(
      {
        elements: TOPIC_ELEMENTS.slice(0, 2),
        topicSources: [
          {
            category: "client_project",
            title: "中汝达AI数字供暖",
            content: "目标客户：供暖项目业主\n产品/服务：数字供暖改造",
          },
          {
            category: "meeting_minutes",
            title: "客户复盘会",
            content: "客户原话：我们怎么证明节能效果？",
          },
        ],
      },
      TOPIC_ELEMENTS.slice(0, 2).map((item) => item.code),
    )

    expect(prompt).toContain("IP操作方案基准线")
    expect(prompt).toContain("热点、会议纪要、对标、问卷和采访清单只是素材来源")
    expect(prompt).toContain("不能覆盖基准线")
  })

  it("user prompt includes IP profile fields", () => {
    const prompt = buildTopicUserPrompt(
      {
        ipProfile: {
          id: "test",
          displayName: "测试用户",
          nickname: null,
          industry: "教育培训",
          primaryOffer: "在线课程",
          targetAudience: "职场新人",
          ipTraits: "专业可信",
          toneOfVoice: "温和专业",
          proofPoints: "10年经验",
          callToAction: "咨询报名",
          profileVersion: 1,
          business: null,
          persona: null,
          content: null,
          promptSnapshot: null,
        },
        elements: TOPIC_ELEMENTS.map(e => ({
          code: e.code,
          name: e.name,
          typeLabel: e.typeLabel,
          description: e.description,
        })),
      },
      ["cost", "practical"],
    )

    expect(prompt).toContain("测试用户")
    expect(prompt).toContain("教育培训")
    expect(prompt).toContain("在线课程")
    expect(prompt).toContain("职场新人")
    expect(prompt).toContain("低成本")
    expect(prompt).toContain("实用干货")
  })

  it("user prompt omits null IP fields", () => {
    const prompt = buildTopicUserPrompt(
      {
        ipProfile: {
          id: "test",
          displayName: null,
          nickname: null,
          industry: "测试行业",
          primaryOffer: null,
          targetAudience: null,
          ipTraits: null,
          toneOfVoice: null,
          proofPoints: null,
          callToAction: null,
          profileVersion: 1,
          business: null,
          persona: null,
          content: null,
          promptSnapshot: null,
        },
        elements: TOPIC_ELEMENTS.map(e => ({
          code: e.code,
          name: e.name,
          typeLabel: e.typeLabel,
          description: e.description,
        })),
      },
      ["novelty"],
    )

    expect(prompt).toContain("测试行业")
    expect(prompt).not.toContain("名称")
    expect(prompt).toContain("新奇刺激")
  })

  it("user prompt includes daily mode instruction and industry hot sources", () => {
    const prompt = buildTopicUserPrompt(
      {
        ipProfile: null,
        elements: TOPIC_ELEMENTS.map(e => ({
          code: e.code,
          name: e.name,
          typeLabel: e.typeLabel,
          description: e.description,
        })),
        recommendationMode: "daily",
        topicSources: [
          {
            category: "industry_hot",
            title: "AI 产品发布",
            content: "某产品发布新功能，适合作为营销切口。",
          },
        ],
      },
      ["cost", "practical"],
    )

    expect(prompt).toContain("行业热点：AI 产品发布")
    expect(prompt).toContain("这是今日推荐")
  })

  it("normalizes missing scoring fields without requiring hot topics", () => {
    const cards: TopicCard[] = [
      {
        title: "选题一测试",
        elementCodes: ["cost", "practical"],
        openingTypeCode: "benefit_open",
        structureCode: "pain_solution",
      },
      {
        title: "选题二测试",
        elementCodes: ["trust"],
        openingTypeCode: "curiosity_open",
        structureCode: "universal",
      },
      {
        title: "选题三测试",
        elementCodes: ["contrast"],
        openingTypeCode: "contrast_open",
        structureCode: "contrast_hook",
      },
      {
        title: "选题四测试",
        elementCodes: ["story"],
        openingTypeCode: "curiosity_open",
        structureCode: "pov_walkthrough",
      },
    ]

    const normalized = normalizeTopicCards(cards, {
      recommendationMode: "daily",
      topicSources: [{ category: "user_insight", title: "客户问题", content: "交付周期不清晰。" }],
    })

    expect(normalized).toHaveLength(4)
    expect(normalized[0].score).toBeUndefined()
    expect(normalized[0].scoreBreakdown).toEqual({
      projectFit: null,
      contentValue: null,
      viralHook: null,
      conversionFit: null,
      feasibility: null,
    })
    expect(normalized[0].topicType).toBe("转化型")
    expect(normalized[0].sourceType).toBe("客户资料")
    expect(normalized[0].scoreReason).toContain("证据不足")
  })
})
