import { describe, expect, it } from "vitest"

import {
  resolveAimRuntimeTask,
  resolveKnowledgeStrategy,
  shouldUseKnowledgeContextForTask,
  shouldUseMarketViralContextForTask,
  getStrategyProfile,
  KNOWLEDGE_STRATEGY_PROFILES,
  type ResolvedKnowledgeStrategy,
} from "@/lib/aim-knowledge-strategy"

describe("AIM runtime task routing", () => {
  it("treats small polish requests as light_edit without knowledge context", () => {
    const task = resolveAimRuntimeTask({
      agentId: "content_producer",
      input: "帮我润色这句话，改得自然点",
    })

    expect(task).toBe("light_edit")
    expect(resolveKnowledgeStrategy({ runtimeTask: task })).toBe("light_edit")
    expect(shouldUseKnowledgeContextForTask(task)).toBe(false)
  })

  it("treats explicit replacement instructions as light_edit", () => {
    const task = resolveAimRuntimeTask({
      agentId: "content_producer",
      input: "这里改成帮助客户沉淀可以进化的知识库资产",
    })

    expect(task).toBe("light_edit")
    expect(shouldUseKnowledgeContextForTask(task)).toBe(false)
  })

  it("treats spoken style edits as light_edit", () => {
    expect(resolveAimRuntimeTask({
      agentId: "content_producer",
      input: "帮我改得更口语化",
    })).toBe("light_edit")
  })

  it("treats opening-only optimization as light_edit", () => {
    expect(resolveAimRuntimeTask({
      agentId: "content_producer",
      input: "只优化开头，不要改正文",
    })).toBe("light_edit")
  })

  it("uses knowledge context when the user asks to combine customer cases", () => {
    const task = resolveAimRuntimeTask({
      agentId: "content_producer",
      input: "结合客户案例写一版短视频文案",
    })

    expect(task).toBe("new_copy")
    expect(shouldUseKnowledgeContextForTask(task)).toBe(true)
  })

  it("prefers the current generate input over older edit history", () => {
    const task = resolveAimRuntimeTask({
      agentId: "deep_copywriter",
      input: [
        "【本轮对话】",
        "用户：把这篇开头改一下",
        "助手：已经给出开头替换建议",
        "用户：不用再分析了 直接生成文案",
        "",
        "【本次生成输入】",
        "不用再分析了 直接生成文案",
      ].join("\n"),
    })

    expect(task).toBe("new_copy")
  })

  it("uses knowledge context when the user asks to merge persona and selling-point materials", () => {
    const task = resolveAimRuntimeTask({
      agentId: "content_producer",
      input: "结合人设资料、产品卖点和老板卖点改这一版文案",
    })

    expect(task).toBe("rewrite_copy")
    expect(shouldUseKnowledgeContextForTask(task)).toBe(true)
  })

  it("uses knowledge context when the user asks to call meeting minutes", () => {
    const task = resolveAimRuntimeTask({
      agentId: "content_producer",
      input: "调用会议纪要帮我生成选题",
    })

    expect(task).toBe("positioning_topic")
    expect(shouldUseKnowledgeContextForTask(task)).toBe(true)
  })

  it("keeps a script request as new_copy when its topic mentions 选题", () => {
    const task = resolveAimRuntimeTask({
      agentId: "content_producer",
      input: "为什么老板每天还要亲自给选题？请写一条相宇可以直接拍的口播。",
      taskType: "write_script",
      targetFormats: ["video_script"],
    })

    expect(task).toBe("new_copy")
  })

  it("only uses market viral context for new copy and positioning/topic tasks", () => {
    expect(shouldUseMarketViralContextForTask("light_edit")).toBe(false)
    expect(shouldUseMarketViralContextForTask("quality_review")).toBe(false)
    expect(shouldUseMarketViralContextForTask("new_copy")).toBe(true)
    expect(shouldUseMarketViralContextForTask("positioning_topic")).toBe(true)
  })

  it("routes content_review to quality_review", () => {
    const task = resolveAimRuntimeTask({
      agentId: "content_review",
      input: "帮我检查这版口播能不能发",
    })

    expect(task).toBe("quality_review")
    expect(shouldUseMarketViralContextForTask(task)).toBe(false)
  })

  // ─── 90 天计划 0.2 任务语义契约 ───

  it("「写一版并优化转化」进入 new_copy（创建动词优先于优化词）", () => {
    const task = resolveAimRuntimeTask({
      agentId: "content_producer",
      input: "帮我写一版口播稿，并优化转化",
    })

    expect(task).toBe("new_copy")
  })

  it("「整体结构和篇幅都可以重做」进入 rewrite_copy", () => {
    const task = resolveAimRuntimeTask({
      agentId: "content_producer",
      input: "这篇稿子的整体结构和篇幅都可以重做",
    })

    expect(task).toBe("rewrite_copy")
    expect(resolveKnowledgeStrategy({ runtimeTask: task })).toBe("rewrite")
  })

  it("「结合客户案例优化原稿」进入 rewrite_copy（非 light_edit）", () => {
    const task = resolveAimRuntimeTask({
      agentId: "content_producer",
      input: "结合客户案例优化这篇原稿",
    })

    expect(task).toBe("rewrite_copy")
    expect(shouldUseKnowledgeContextForTask(task)).toBe(true)
  })

  it("没有原稿的「写得更自然」进入 new_copy", () => {
    const task = resolveAimRuntimeTask({
      agentId: "content_producer",
      input: "帮我把口播稿写得更自然一点",
    })

    expect(task).toBe("new_copy")
  })

  it("有原稿的纯优化仍是 light_edit（优化 + 这篇）", () => {
    const task = resolveAimRuntimeTask({
      agentId: "content_producer",
      input: "优化这篇文案，开头别动",
    })

    expect(task).toBe("light_edit")
    expect(shouldUseKnowledgeContextForTask(task)).toBe(false)
  })
})

// ─── resolveKnowledgeStrategy 优先级矩阵 ────────────────────────

describe("resolveKnowledgeStrategy priority chain", () => {
  it("defaults to deep when no signals are present", () => {
    expect(resolveKnowledgeStrategy({})).toBe("deep")
  })

  // ── 1. 轻改润色：最高优先级 ──

  it("returns light_edit when polishInstruction is present", () => {
    expect(
      resolveKnowledgeStrategy({ polishInstruction: "把结尾改成更有力" }),
    ).toBe("light_edit")
  })

  it("returns light_edit when taskType is polish_copy", () => {
    expect(
      resolveKnowledgeStrategy({ taskType: "polish_copy" }),
    ).toBe("light_edit")
  })

  it("light_edit takes priority over hotTopic", () => {
    expect(
      resolveKnowledgeStrategy({
        polishInstruction: "改一下标题",
        hotTopic: "某大事件",
      }),
    ).toBe("light_edit")
  })

  it("light_edit takes priority over topicType", () => {
    expect(
      resolveKnowledgeStrategy({
        taskType: "polish_copy",
        topicType: "转化型",
      }),
    ).toBe("light_edit")
  })

  // ── 2. 热点创作：第二优先级 ──

  it("returns hot_topic when hotTopic is present", () => {
    expect(
      resolveKnowledgeStrategy({ hotTopic: "某行业大事件" }),
    ).toBe("hot_topic")
  })

  it("returns hot_topic when videoCopyExtractionId is present", () => {
    expect(
      resolveKnowledgeStrategy({ videoCopyExtractionId: "ex-123" }),
    ).toBe("hot_topic")
  })

  it("hot_topic takes priority over topicType=人设型", () => {
    expect(
      resolveKnowledgeStrategy({
        hotTopic: "某热点",
        topicType: "人设型",
      }),
    ).toBe("hot_topic")
  })

  it("流量型 + 热点 → hot_topic（不是 traffic）", () => {
    expect(
      resolveKnowledgeStrategy({
        topicType: "流量型",
        hotTopic: "某事件",
      }),
    ).toBe("hot_topic")
  })

  // ── 3. topicType 档 ──

  it("maps 人设型 → persona", () => {
    expect(
      resolveKnowledgeStrategy({ topicType: "人设型" }),
    ).toBe("persona")
  })

  it("maps 转化型 → conversion", () => {
    expect(
      resolveKnowledgeStrategy({ topicType: "转化型" }),
    ).toBe("conversion")
  })

  it("maps 流量型 → traffic", () => {
    expect(
      resolveKnowledgeStrategy({ topicType: "流量型" }),
    ).toBe("traffic")
  })

  it("ignores invalid topicType and falls back to deep", () => {
    expect(
      resolveKnowledgeStrategy({ topicType: "不存在类型" }),
    ).toBe("deep")
  })

  // ── 4. 空值防御 ──

  it("handles empty strings gracefully → deep", () => {
    expect(
      resolveKnowledgeStrategy({
        polishInstruction: "  ",
        hotTopic: "",
        videoCopyExtractionId: "  ",
      }),
    ).toBe("deep")
  })

  it("handles undefined fields → deep", () => {
    expect(
      resolveKnowledgeStrategy({
        topicType: undefined,
        hotTopic: undefined,
        videoCopyExtractionId: undefined,
        taskType: undefined,
        polishInstruction: undefined,
      }),
    ).toBe("deep")
  })
})

// ─── KNOWLEDGE_STRATEGY_PROFILES 完整性 ────────────────────────

describe("KNOWLEDGE_STRATEGY_PROFILES completeness", () => {
  const ALL_STRATEGIES: ResolvedKnowledgeStrategy[] = [
    "light_edit", "rewrite", "hot_topic", "persona", "conversion", "traffic", "deep",
  ]

  it("has a profile for every strategy", () => {
    for (const strategy of ALL_STRATEGIES) {
      expect(KNOWLEDGE_STRATEGY_PROFILES[strategy]).toBeDefined()
    }
  })

  it("deep profile matches pre-refactor defaults (backward compatibility)", () => {
    const deep = KNOWLEDGE_STRATEGY_PROFILES.deep
    expect(deep.topK).toBe(12)
    expect(deep.maxBlockChars).toBe(8000)
    expect(deep.maxEntryChars).toBe(1200)
    expect(deep.categoryBoost).toEqual({})
  })

  it("every profile has a non-empty label", () => {
    for (const strategy of ALL_STRATEGIES) {
      const profile = KNOWLEDGE_STRATEGY_PROFILES[strategy]
      expect(profile.label.length).toBeGreaterThan(0)
    }
  })

  it("light_edit has the smallest retrieval budget", () => {
    const light = KNOWLEDGE_STRATEGY_PROFILES.light_edit
    const deep = KNOWLEDGE_STRATEGY_PROFILES.deep
    expect(light.topK).toBeLessThan(deep.topK)
    expect(light.maxBlockChars).toBeLessThan(deep.maxBlockChars)
  })

  it("rewrite sits between light_edit and deep（对标改写中量配额）", () => {
    const light = KNOWLEDGE_STRATEGY_PROFILES.light_edit
    const rewrite = KNOWLEDGE_STRATEGY_PROFILES.rewrite
    const deep = KNOWLEDGE_STRATEGY_PROFILES.deep
    expect(rewrite.topK).toBeGreaterThan(light.topK)
    expect(rewrite.topK).toBeLessThan(deep.topK)
    expect(rewrite.categoryBoost["project_case"]).toBeGreaterThan(1)
  })

  it("hot_topic boosts hot_topic and benchmark_reference categories", () => {
    const hot = KNOWLEDGE_STRATEGY_PROFILES.hot_topic
    expect(hot.categoryBoost["hot_topic"]).toBeGreaterThan(1)
    expect(hot.categoryBoost["benchmark_reference"]).toBeGreaterThan(1)
  })

  it("conversion boosts product_usp, customer_pain, and customer_qa", () => {
    const conv = KNOWLEDGE_STRATEGY_PROFILES.conversion
    expect(conv.categoryBoost["product_usp"]).toBeGreaterThan(1)
    expect(conv.categoryBoost["customer_pain"]).toBeGreaterThan(1)
    expect(conv.categoryBoost["customer_qa"]).toBeGreaterThan(1)
  })

  it("persona boosts boss_experience and positioning_material", () => {
    const pers = KNOWLEDGE_STRATEGY_PROFILES.persona
    expect(pers.categoryBoost["boss_experience"]).toBeGreaterThan(1)
    expect(pers.categoryBoost["positioning_material"]).toBeGreaterThan(1)
  })
})

// ─── getStrategyProfile ────────────────────────────────────────

describe("getStrategyProfile", () => {
  it("returns correct profile for valid strategy", () => {
    const profile = getStrategyProfile("hot_topic")
    expect(profile.label).toBe("热点创作")
    expect(profile.topK).toBe(5)
  })

  it("falls back to deep for invalid strategy", () => {
    const profile = getStrategyProfile("invalid" as ResolvedKnowledgeStrategy)
    expect(profile).toBe(KNOWLEDGE_STRATEGY_PROFILES.deep)
  })
})
