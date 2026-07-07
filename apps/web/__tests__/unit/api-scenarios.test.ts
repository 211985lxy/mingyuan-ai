import { describe, expect, it } from "vitest"
import { GET } from "@/app/api/aim/scenarios/route"

describe("GET /api/aim/scenarios", () => {
  it("returns 5 scenarios, each with id, label, and qualityFocus", async () => {
    const res = await GET()
    const json = await res.json()

    expect(json.scenarios).toHaveLength(5)

    for (const scenario of json.scenarios) {
      expect(scenario).toHaveProperty("id")
      expect(scenario).toHaveProperty("label")
      expect(scenario).toHaveProperty("qualityFocus")
      expect(typeof scenario.id).toBe("string")
      expect(typeof scenario.label).toBe("string")
      expect(typeof scenario.qualityFocus).toBe("string")
    }
  })
})
