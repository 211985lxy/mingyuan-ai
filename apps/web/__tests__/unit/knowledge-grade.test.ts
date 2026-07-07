import { describe, expect, it } from "vitest"

import { normalizeValueGrade, VALUE_GRADES } from "@/lib/knowledge-tags"

describe("normalizeValueGrade", () => {
  it("accepts uppercase S/A/B/C", () => {
    expect(normalizeValueGrade("S")).toBe("S")
    expect(normalizeValueGrade("A")).toBe("A")
    expect(normalizeValueGrade("B")).toBe("B")
    expect(normalizeValueGrade("C")).toBe("C")
  })

  it("normalizes lowercase input to uppercase", () => {
    expect(normalizeValueGrade("s")).toBe("S")
    expect(normalizeValueGrade("a")).toBe("A")
    expect(normalizeValueGrade("b")).toBe("B")
    expect(normalizeValueGrade("c")).toBe("C")
  })

  it("trims surrounding whitespace", () => {
    expect(normalizeValueGrade("  S  ")).toBe("S")
    expect(normalizeValueGrade(" c ")).toBe("C")
  })

  it("returns null for empty string", () => {
    expect(normalizeValueGrade("")).toBeNull()
    expect(normalizeValueGrade("   ")).toBeNull()
  })

  it("returns null for non-grade strings", () => {
    expect(normalizeValueGrade("D")).toBeNull()
    expect(normalizeValueGrade("SS")).toBeNull()
    expect(normalizeValueGrade("战略")).toBeNull()
    expect(normalizeValueGrade("s1")).toBeNull()
  })

  it("returns null for non-string types", () => {
    expect(normalizeValueGrade(undefined)).toBeNull()
    expect(normalizeValueGrade(null)).toBeNull()
    expect(normalizeValueGrade(1)).toBeNull()
    expect(normalizeValueGrade({})).toBeNull()
  })

  it("VALUE_GRADES contains exactly S/A/B/C", () => {
    expect(VALUE_GRADES.size).toBe(4)
    expect([...VALUE_GRADES]).toEqual(["S", "A", "B", "C"])
  })
})
