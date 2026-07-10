/**
 * Eval runner — deterministic CI run (frozen adapter, no model).
 *
 * Asserts the runner produces a report where:
 *   - all 50 cases pass the contract grader (routing/format/context)
 *   - contractPassRate === 100% (the hard acceptance gate)
 *   - per-agent breakdowns are computed
 *   - sampling is deterministic
 *
 * This is the `test:x harness` gate that runs on every PR.
 */
import { describe, expect, it } from "vitest"

import { ALL_FIXTURES } from "./fixtures"
import {
  createFrozenContextAdapter,
  runEvalSuite,
  sampleFixtures,
  renderEvalMarkdown,
} from "@/lib/aim-harness/eval-runner"

describe("aim-harness eval runner (frozen, deterministic)", () => {
  it("samples deterministically", () => {
    const a = sampleFixtures(ALL_FIXTURES, 15).map((f) => f.id)
    const b = sampleFixtures(ALL_FIXTURES, 15).map((f) => f.id)
    expect(a).toEqual(b)
    expect(a).toHaveLength(15)
  })

  it("reports 100% contract pass rate across all 50 cases (no model)", async () => {
    const report = await runEvalSuite(ALL_FIXTURES, createFrozenContextAdapter(), {
      skipRubric: true,
    })

    expect(report.adapter).toBe("frozen")
    expect(report.totalCases).toBe(50)
    expect(report.contractPassRate).toBe(1)
    expect(report.results.every((r) => r.contractPassed)).toBe(true)
    // rubric is skipped in deterministic CI
    expect(report.rubricPassRate).toBeNull()
  })

  it("computes per-agent contract pass rates", async () => {
    const report = await runEvalSuite(ALL_FIXTURES, createFrozenContextAdapter(), {
      skipRubric: true,
    })
    for (const agent of ["content_producer", "deep_copywriter", "business_diagnosis"] as const) {
      expect(report.perAgent[agent]).toBeDefined()
      expect(report.perAgent[agent].contractPassRate).toBe(1)
    }
  })

  it("renders a markdown report", async () => {
    const report = await runEvalSuite(sampleFixtures(ALL_FIXTURES, 5), createFrozenContextAdapter(), {
      skipRubric: true,
    })
    const md = renderEvalMarkdown(report)
    expect(md).toContain("AIM Eval Report")
    expect(md).toContain("Contract pass rate")
    expect(md).toContain("Failed contract cases")
  })

  it("marks info_insufficient cases as warned (not fabricated)", async () => {
    const report = await runEvalSuite(ALL_FIXTURES, createFrozenContextAdapter(), {
      skipRubric: true,
    })
    const insufficient = report.results.filter((r) => r.scenario === "info_insufficient")
    expect(insufficient.length).toBeGreaterThan(0)
    // These must NOT contain fabricated facts — the draft is a guidance note.
    for (const result of insufficient) {
      const draft = result.drafts.map((d) => d.contentPreview).join(" ")
      expect(draft).not.toMatch(/我是一个AI|作为一个AI/)
    }
  })
})
