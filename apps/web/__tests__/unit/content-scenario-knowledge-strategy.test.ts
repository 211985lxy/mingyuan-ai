import { describe, expect, it } from "vitest"

import { resolveKnowledgeStrategy } from "@/lib/aim-knowledge-strategy"

describe("content scenario priority in resolveKnowledgeStrategy", () => {
  // ── Direct scenario → strategy mapping ──

  it('contentScenario: "traffic_conversion" → "conversion"', () => {
    expect(
      resolveKnowledgeStrategy({ contentScenario: "traffic_conversion" }),
    ).toBe("conversion")
  })

  it('contentScenario: "ip_knowledge" → "persona"', () => {
    expect(
      resolveKnowledgeStrategy({ contentScenario: "ip_knowledge" }),
    ).toBe("persona")
  })

  it('contentScenario: "entity_local" → "conversion"', () => {
    expect(
      resolveKnowledgeStrategy({ contentScenario: "entity_local" }),
    ).toBe("conversion")
  })

  it('contentScenario: "xhs_planting" → "traffic"', () => {
    expect(
      resolveKnowledgeStrategy({ contentScenario: "xhs_planting" }),
    ).toBe("traffic")
  })

  it('contentScenario: "kol_explore" → "deep"', () => {
    expect(
      resolveKnowledgeStrategy({ contentScenario: "kol_explore" }),
    ).toBe("deep")
  })

  // ── Priority: scenario overrides topicType ──

  it("contentScenario takes priority over topicType", () => {
    expect(
      resolveKnowledgeStrategy({
        contentScenario: "traffic_conversion",
        topicType: "人设型",
      }),
    ).toBe("conversion")
  })

  // ── Fallback: no scenario falls through to existing logic ──

  it("no scenario falls through to topicType logic", () => {
    expect(
      resolveKnowledgeStrategy({ topicType: "转化型" }),
    ).toBe("conversion")
  })

  // ── Priority: light_edit runtimeTask still overrides scenario ──

  it("light_edit runtimeTask overrides contentScenario", () => {
    expect(
      resolveKnowledgeStrategy({
        contentScenario: "traffic_conversion",
        runtimeTask: "light_edit",
      }),
    ).toBe("light_edit")
  })
})
