import { describe, expect, it } from "vitest"

import { KNOWLEDGE_CATEGORIES } from "@/lib/knowledge-categories"
import {
  ASSET_BOX_DEFINITIONS,
  DYNAMIC_POOL_CATEGORIES,
  HEALTH_STATUS_LABELS,
  computeKnowledgeAssetHealth,
  countReadyAssetBoxes,
  getAssetBoxForCategory,
  getSupplementPrompts,
  mapCategoryToBucket,
  type KnowledgeAssetEntryInput,
} from "@/lib/knowledge-asset-health"

function entry(
  partial: Partial<KnowledgeAssetEntryInput> & Pick<KnowledgeAssetEntryInput, "category">,
): KnowledgeAssetEntryInput {
  return {
    id: partial.id ?? `k-${partial.category}`,
    category: partial.category,
    status: partial.status ?? "active",
    tags: partial.tags ?? [],
  }
}

describe("knowledge asset box mapping", () => {
  it("maps every knowledge category to exactly one bucket (five boxes or dynamic pool)", () => {
    const buckets = new Set(KNOWLEDGE_CATEGORIES.map((category) => mapCategoryToBucket(category)))
    expect(buckets.has("unknown")).toBe(false)
    expect(KNOWLEDGE_CATEGORIES).toHaveLength(12)

    for (const category of KNOWLEDGE_CATEGORIES) {
      const bucket = mapCategoryToBucket(category)
      if (bucket === "dynamic_pool") {
        expect(DYNAMIC_POOL_CATEGORIES).toContain(category)
        expect(getAssetBoxForCategory(category)).toBeNull()
      } else {
        expect(ASSET_BOX_DEFINITIONS.some((box) => box.id === bucket)).toBe(true)
        expect(getAssetBoxForCategory(category)?.id).toBe(bucket)
      }
    }
  })

  it("aggregates the five user-facing asset boxes with the expected categories", () => {
    expect(ASSET_BOX_DEFINITIONS.map((box) => [box.id, box.categories])).toEqual([
      ["who_am_i", ["boss_experience", "positioning_material", "writing_style_profile"]],
      ["what_i_sell", ["product_usp"]],
      ["why_trust_me", ["project_case"]],
      ["customer_thinking", ["customer_pain", "customer_qa", "user_insight"]],
      ["how_i_convert", ["private_domain_material"]],
    ])
  })

  it("keeps hot topics, benchmarks and daily inspiration out of five-box health", () => {
    expect([...DYNAMIC_POOL_CATEGORIES].sort()).toEqual(
      ["benchmark_reference", "daily_inspiration", "hot_topic"].sort(),
    )
  })
})

describe("computeKnowledgeAssetHealth", () => {
  it("marks all five boxes as 待补充 when the project has no enterprise assets", () => {
    const result = computeKnowledgeAssetHealth([
      entry({ category: "hot_topic" }),
      entry({ category: "benchmark_reference" }),
      entry({ category: "daily_inspiration" }),
    ])

    expect(result.boxes.every((box) => box.status === "missing")).toBe(true)
    expect(result.boxes.every((box) => HEALTH_STATUS_LABELS[box.status] === "待补充")).toBe(true)
    expect(result.dynamicPool.count).toBe(3)
    expect(result.boxes.some((box) => "score" in box)).toBe(false)
  })

  it("ignores archived entries and dynamic pool entries when scoring boxes", () => {
    const result = computeKnowledgeAssetHealth([
      entry({ category: "product_usp", status: "archived" }),
      entry({ category: "hot_topic", tags: ["confidence:confirmed"] }),
      entry({ category: "product_usp", id: "live-usp" }),
    ])

    const sell = result.boxes.find((box) => box.id === "what_i_sell")
    expect(sell?.status).toBe("ready")
    expect(sell?.entryCount).toBe(1)
    expect(result.dynamicPool.count).toBe(1)
  })

  it("requires positioning plus style or experience for 我是谁", () => {
    const onlyPositioning = computeKnowledgeAssetHealth([
      entry({ category: "positioning_material" }),
    ])
    expect(onlyPositioning.boxes.find((box) => box.id === "who_am_i")?.status).toBe("missing")

    const positioningAndStyle = computeKnowledgeAssetHealth([
      entry({ category: "positioning_material" }),
      entry({ category: "writing_style_profile" }),
    ])
    expect(positioningAndStyle.boxes.find((box) => box.id === "who_am_i")?.status).toBe("ready")

    const positioningAndExperience = computeKnowledgeAssetHealth([
      entry({ category: "positioning_material" }),
      entry({ category: "boss_experience" }),
    ])
    expect(positioningAndExperience.boxes.find((box) => box.id === "who_am_i")?.status).toBe("ready")
  })

  it("requires customer pain for 客户在想什么 even if QA or insight exists", () => {
    const withoutPain = computeKnowledgeAssetHealth([
      entry({ category: "customer_qa" }),
      entry({ category: "user_insight" }),
    ])
    expect(withoutPain.boxes.find((box) => box.id === "customer_thinking")?.status).toBe("missing")

    const withPain = computeKnowledgeAssetHealth([
      entry({ category: "customer_pain" }),
      entry({ category: "customer_qa" }),
    ])
    expect(withPain.boxes.find((box) => box.id === "customer_thinking")?.status).toBe("ready")
    expect(withPain.boxes.find((box) => box.id === "customer_thinking")?.entryCount).toBe(2)
  })

  it("marks 为什么相信我 as 待确认 until a confirmed case exists", () => {
    const pendingOnly = computeKnowledgeAssetHealth([
      entry({ category: "project_case", tags: ["confidence:pending_verify"] }),
    ])
    expect(pendingOnly.boxes.find((box) => box.id === "why_trust_me")?.status).toBe("pending_confirm")

    const userClaimOnly = computeKnowledgeAssetHealth([
      entry({ category: "project_case", tags: ["confidence:user_claim"] }),
    ])
    expect(userClaimOnly.boxes.find((box) => box.id === "why_trust_me")?.status).toBe("pending_confirm")

    const confirmed = computeKnowledgeAssetHealth([
      entry({ category: "project_case", tags: ["confidence:pending_verify"] }),
      entry({ id: "case-ok", category: "project_case", tags: ["confidence:confirmed"] }),
    ])
    expect(confirmed.boxes.find((box) => box.id === "why_trust_me")?.status).toBe("ready")
  })

  it("marks a box as 待确认 when required categories only have pending_verify entries", () => {
    const result = computeKnowledgeAssetHealth([
      entry({ category: "product_usp", tags: ["confidence:pending_verify"] }),
      entry({ category: "private_domain_material", tags: ["confidence:pending_verify"] }),
    ])

    expect(result.boxes.find((box) => box.id === "what_i_sell")?.status).toBe("pending_confirm")
    expect(result.boxes.find((box) => box.id === "how_i_convert")?.status).toBe("pending_confirm")
  })

  it("is deterministic across repeated runs with the same entries", () => {
    const entries = [
      entry({ category: "positioning_material" }),
      entry({ category: "writing_style_profile", tags: ["confidence:pending_verify"] }),
      entry({ category: "product_usp" }),
      entry({ category: "project_case", tags: ["confidence:confirmed"] }),
      entry({ category: "customer_pain" }),
      entry({ category: "private_domain_material" }),
      entry({ category: "hot_topic" }),
    ]

    expect(computeKnowledgeAssetHealth(entries)).toEqual(computeKnowledgeAssetHealth(entries))
  })

  it("exposes missing categories and supplement prompts for 待补充 boxes", () => {
    const result = computeKnowledgeAssetHealth([
      entry({ category: "product_usp" }),
    ])
    const who = result.boxes.find((box) => box.id === "who_am_i")
    expect(who?.status).toBe("missing")
    expect(who?.missingCategories).toEqual(
      expect.arrayContaining(["positioning_material"]),
    )
    expect(who?.suggestedCategory).toBe("positioning_material")
    expect(getSupplementPrompts("who_am_i", "positioning_material").length).toBeGreaterThan(0)
    expect(getSupplementPrompts("who_am_i", "positioning_material").length).toBeLessThanOrEqual(3)
  })

  it("scales to large entry lists without changing status semantics", () => {
    const manyCases = Array.from({ length: 600 }, (_, index) =>
      entry({
        id: `case-${index}`,
        category: "project_case",
        tags: index === 599 ? ["confidence:confirmed"] : ["confidence:pending_verify"],
      }),
    )
    const result = computeKnowledgeAssetHealth([
      entry({ category: "positioning_material" }),
      entry({ category: "writing_style_profile" }),
      entry({ category: "product_usp" }),
      ...manyCases,
      entry({ category: "customer_pain" }),
      entry({ category: "private_domain_material" }),
    ])
    expect(result.boxes.find((box) => box.id === "why_trust_me")?.status).toBe("ready")
    expect(result.boxes.find((box) => box.id === "why_trust_me")?.entryCount).toBe(600)
  })

  it("countReadyAssetBoxes 统计已具备盒数", () => {
    expect(countReadyAssetBoxes(null)).toEqual({ ready: 0, total: 5 })
    const empty = computeKnowledgeAssetHealth([])
    expect(countReadyAssetBoxes(empty).ready).toBe(0)
    const partial = computeKnowledgeAssetHealth([
      entry({ category: "positioning_material" }),
      entry({ category: "writing_style_profile" }),
      entry({ category: "product_usp" }),
    ])
    expect(countReadyAssetBoxes(partial).ready).toBe(2)
    expect(countReadyAssetBoxes(partial).total).toBe(5)
  })
})
