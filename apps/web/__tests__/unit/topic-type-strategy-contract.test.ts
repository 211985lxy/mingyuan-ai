import { describe, expect, it } from "vitest"
import { resolveKnowledgeStrategy } from "@/lib/aim-knowledge-strategy"

/**
 * topicType → 知识策略映射契约测试。
 *
 * 历史 bug：体系 A（人设型/转化型/流量型）与体系 B（人设信任型/观点立场型/
 * 问题解决型/案例转化型）并存，但 TOPIC_TYPE_STRATEGY 只映射了体系 A。
 * 体系 B 的值（定位策划官 business_diagnosis 产出）传进来会命中 ?? deep 兜底，
 * 选题类型信号被静默丢弃。本测试锁定：两套体系的值都能映射到合理策略档。
 */

describe("topicType 两套体系都能映射到知识策略（不静默丢信号）", () => {
  it("体系 A：人设型/转化型/流量型 正确映射", () => {
    expect(resolveKnowledgeStrategy({ topicType: "人设型" })).toBe("persona")
    expect(resolveKnowledgeStrategy({ topicType: "转化型" })).toBe("conversion")
    expect(resolveKnowledgeStrategy({ topicType: "流量型" })).toBe("traffic")
  })

  it("体系 B：定位策划官内容路由 4 类 正确映射（不再兜底 deep）", () => {
    // 这 4 个值来自 business_diagnosis 的 prompt（aim-agent-business-diagnosis.ts:87,202）
    expect(resolveKnowledgeStrategy({ topicType: "人设信任型" })).toBe("persona")
    expect(resolveKnowledgeStrategy({ topicType: "观点立场型" })).toBe("persona")
    expect(resolveKnowledgeStrategy({ topicType: "问题解决型" })).toBe("conversion")
    expect(resolveKnowledgeStrategy({ topicType: "案例转化型" })).toBe("conversion")
  })

  it("体系 B 的值不再静默降级到 deep 档（信号丢失会回归）", () => {
    // 若映射缺失，会命中 ?? deep 兜底；这 4 个都必须是明确映射，不是 deep
    for (const t of ["人设信任型", "观点立场型", "问题解决型", "案例转化型"]) {
      const strategy = resolveKnowledgeStrategy({ topicType: t })
      expect(strategy, `${t} 不应降级到 deep`).not.toBe("deep")
    }
  })
})
