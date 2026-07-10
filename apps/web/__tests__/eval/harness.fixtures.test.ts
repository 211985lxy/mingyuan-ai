/**
 * Deterministic harness fixture test (no model, no DB).
 *
 * This is the `test:x harness` gate that runs on every PR. It asserts:
 *   - the suite has exactly 66 fixtures with all seven agents represented
 *   - every fixture's declared routing/knowledge/format contract matches the
 *     real production planner (resolveAimRuntimeTask / resolveKnowledgeStrategy)
 *   - ids are unique and versioned
 *
 * The output-format and context-usage assertions are exercised against a
 * synthetic "produced" result that mirrors the fixture's own expectations, so
 * the grader code path itself is proven correct here. When the Phase 3 harness
 * lands, the real producedFormats/citedKnowledgeIds will be fed in instead.
 */
import { describe, expect, it } from "vitest"

import {
  ALL_FIXTURES,
  EXPECTED_AGENT_COUNTS,
  EXPECTED_SCENARIO_COVERAGE,
} from "./fixtures"
import { gradeFixture, GRADABLE_FORMATS } from "@/lib/aim-harness/eval/graders"

describe("aim harness fixture registry", () => {
  it("has exactly 66 fixtures", () => {
    expect(ALL_FIXTURES).toHaveLength(66)
  })

  it("covers all seven agents with the required counts", () => {
    const byAgent = ALL_FIXTURES.reduce<Record<string, number>>((acc, fixture) => {
      acc[fixture.agent] = (acc[fixture.agent] ?? 0) + 1
      return acc
    }, {})
    for (const [agent, count] of Object.entries(EXPECTED_AGENT_COUNTS)) {
      expect(byAgent[agent], agent).toBe(count)
    }
  })

  it("covers all six scenarios", () => {
    const scenarios = new Set(ALL_FIXTURES.map((fixture) => fixture.scenario))
    for (const scenario of EXPECTED_SCENARIO_COVERAGE) {
      expect(scenarios.has(scenario)).toBe(true)
    }
  })

  it("has unique ids and positive versions", () => {
    const ids = new Set<string>()
    for (const fixture of ALL_FIXTURES) {
      expect(fixture.id).toBeTruthy()
      expect(fixture.version).toBeGreaterThan(0)
      expect(ids.has(fixture.id), `duplicate id ${fixture.id}`).toBe(false)
      ids.add(fixture.id)
    }
  })

  it("declares only gradable output formats", () => {
    for (const fixture of ALL_FIXTURES) {
      for (const format of fixture.expectations.outputFormats) {
        expect(GRADABLE_FORMATS.has(format), `${fixture.id}: bad format ${format}`).toBe(true)
      }
    }
  })
})

describe("aim harness deterministic grading (planner contract, 66 cases)", () => {
  // One it() per fixture so a failure pinpoints the exact case.
  for (const fixture of ALL_FIXTURES) {
    it(`${fixture.id}: routing/format/context contract`, () => {
      // Produce a synthetic result that mirrors the fixture's expectations, to
      // exercise the grader end-to-end. The planner-only assertions
      // (runtime_task, knowledge_strategy) are the real gates; they must match
      // production regardless of any model output.
      const result = gradeFixture({
        fixture,
        producedFormats: fixture.expectations.outputFormats,
        citedKnowledgeIds: fixture.expectations.mustCiteKnowledgeIds,
        warnedInsufficientInfo: fixture.expectations.mustWarnInsufficientInfo,
        draftText: fixture.expectations.bannedSubstrings ? "clean draft" : undefined,
      })
      if (!result.passed) {
        const failed = result.assertions
          .filter((assertion) => !assertion.passed)
          .map((assertion) => `${assertion.name}(${assertion.detail})`)
          .join("; ")
        // Print the detail so the first CI run pinpoints any planner drift.
        throw new Error(`${fixture.id} failed: ${failed}`)
      }
      expect(result.passed).toBe(true)
    })
  }
})
