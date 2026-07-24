import { describe, expect, it } from "vitest"

import {
  scoreTurnIntentRuleConfidence,
  shouldTryVectorIntentFallback,
  INTENT_VECTOR_RULE_CONFIDENCE_THRESHOLD,
  INTENT_VECTOR_TOP_MARGIN,
} from "@/lib/aim-intent-confidence"
import {
  applyVectorMatchToTurnIntent,
  actionToRuntimeTask,
  isIntentVectorFallbackEnabled,
  pickBestIntentPrototype,
  rankIntentPrototypes,
} from "@/lib/aim-intent-vector"
import {
  applyTurnIntentSupplement,
  formatAimTurnIntentBlock,
  resolveAimTurnIntent,
} from "@/lib/aim-turn-intent"
import { cosineSimilarity } from "@/lib/llm/embeddings"

describe("意图规则置信度", () => {
  it("明确写种草 → 高置信，不触发向量", () => {
    const intent = resolveAimTurnIntent({ rawInput: "帮我写一篇小红书种草文" })
    const conf = scoreTurnIntentRuleConfidence(intent, "帮我写一篇小红书种草文")
    expect(conf).toBeGreaterThanOrEqual(INTENT_VECTOR_RULE_CONFIDENCE_THRESHOLD)
    expect(shouldTryVectorIntentFallback(conf)).toBe(false)
  })

  it("模糊口令保持 chat → 低置信触发向量门槛", () => {
    const intent = resolveAimTurnIntent({ rawInput: "这个怎么弄一下比较好" })
    expect(intent.action).toBe("chat")
    const conf = scoreTurnIntentRuleConfidence(intent, "这个怎么弄一下比较好")
    expect(conf).toBeLessThan(INTENT_VECTOR_RULE_CONFIDENCE_THRESHOLD)
    expect(shouldTryVectorIntentFallback(conf)).toBe(true)
  })

  it("结构分析问句 → chat 高置信，不触发向量兜底", () => {
    const text = "这个文案结构是什么"
    const intent = resolveAimTurnIntent({ rawInput: text })
    expect(intent.action).toBe("chat")
    const conf = scoreTurnIntentRuleConfidence(intent, text)
    expect(conf).toBeGreaterThanOrEqual(INTENT_VECTOR_RULE_CONFIDENCE_THRESHOLD)
    expect(shouldTryVectorIntentFallback(conf)).toBe(false)
  })

  it("人设+种草冲突必须降置信（不可被 create 0.88 提前 return 挡住）", () => {
    const text = "结合人设写一篇小红书种草文"
    const intent = resolveAimTurnIntent({ rawInput: text })
    expect(intent.action).toBe("create")
    const conf = scoreTurnIntentRuleConfidence(intent, text)
    expect(conf).toBe(0.4)
    expect(shouldTryVectorIntentFallback(conf)).toBe(true)
  })
})

describe("向量近邻选取（纯函数）", () => {
  it("余弦最高且过阈值者胜出", () => {
    const query = [1, 0, 0]
    const items = [
      {
        prototype: { id: "a", phrase: "写种草", action: "create" as const },
        vector: [0.95, 0.05, 0],
      },
      {
        prototype: { id: "b", phrase: "改开头", action: "local_edit" as const, scope: "opening" as const },
        vector: [0.2, 0.8, 0],
      },
    ]
    const best = pickBestIntentPrototype(query, items, 0.7, 0.05)
    expect(best?.prototypeId).toBe("a")
    expect(best?.action).toBe("create")
    expect(best!.score).toBeGreaterThan(0.7)
  })

  it("Top1/Top2 分差过小 → 歧义拒判", () => {
    const query = [1, 0]
    const items = [
      { prototype: { id: "a", phrase: "a", action: "create" as const }, vector: [0.9, 0.1] },
      { prototype: { id: "b", phrase: "b", action: "rewrite" as const }, vector: [0.89, 0.11] },
    ]
    const ranked = rankIntentPrototypes(query, items)
    expect(ranked[0].score - ranked[1].score).toBeLessThan(INTENT_VECTOR_TOP_MARGIN)
    expect(pickBestIntentPrototype(query, items, 0.7, INTENT_VECTOR_TOP_MARGIN)).toBeNull()
  })

  it("全低于阈值 → null", () => {
    const best = pickBestIntentPrototype(
      [1, 0],
      [{ prototype: { id: "x", phrase: "x", action: "chat" }, vector: [0, 1] }],
      0.9,
    )
    expect(best).toBeNull()
  })

  it("cosineSimilarity 自相似为 1", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1)
  })
})

describe("向量命中写回意图", () => {
  it("forceAction 覆盖模糊 chat", () => {
    const match = {
      prototypeId: "create_xhs",
      phrase: "帮我写一篇小红书种草笔记",
      action: "create" as const,
      score: 0.85,
    }
    const intent = applyVectorMatchToTurnIntent({
      rawInput: "来条能发的种草感内容",
      match,
      targetFormats: ["xiaohongshu_post"],
    })
    expect(intent.action).toBe("create")
    expect(intent.summary).toContain("近义命中")
    expect(intent.deliverable).toContain("小红书")
  })

  it("forceScope 覆盖为 opening", () => {
    const intent = applyVectorMatchToTurnIntent({
      rawInput: "开头那句话不太行改改",
      match: {
        prototypeId: "edit_opening",
        phrase: "只优化开头钩子不要改正文",
        action: "local_edit",
        scope: "opening",
        score: 0.8,
      },
    })
    expect(intent.action).toBe("local_edit")
    expect(intent.scope).toBe("opening")
  })
})

describe("确认意图冻结映射", () => {
  it("action → runtimeTask 一一映射", () => {
    expect(actionToRuntimeTask("local_edit")).toBe("light_edit")
    expect(actionToRuntimeTask("create")).toBe("new_copy")
    expect(actionToRuntimeTask("rewrite")).toBe("rewrite_copy")
    expect(actionToRuntimeTask("chat")).toBeUndefined()
  })

  it("补充说明不改 action/scope", () => {
    const base = resolveAimTurnIntent({ rawInput: "只优化开头" })
    const next = applyTurnIntentSupplement(base, "语气再狠一点")
    expect(next.action).toBe(base.action)
    expect(next.scope).toBe(base.scope)
    expect(next.keep).toEqual(base.keep)
    expect(next.userSupplement).toBe("语气再狠一点")
    expect(formatAimTurnIntentBlock(next)).toContain("用户补充说明")
  })
})

describe("向量开关默认关闭", () => {
  it("未设 AIM_INTENT_VECTOR_FALLBACK 时关闭", () => {
    const prev = process.env.AIM_INTENT_VECTOR_FALLBACK
    delete process.env.AIM_INTENT_VECTOR_FALLBACK
    expect(isIntentVectorFallbackEnabled()).toBe(false)
    if (prev === undefined) delete process.env.AIM_INTENT_VECTOR_FALLBACK
    else process.env.AIM_INTENT_VECTOR_FALLBACK = prev
  })
})
