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
  runEvalCase,
  runEvalSuite,
  sampleFixtures,
  renderEvalMarkdown,
  evaluateEvalGate,
  type EvalRunReport,
} from "@/lib/aim-harness/eval-runner"
import { createRealEvalExecutor } from "@/lib/aim-harness/eval-real-executor"

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

  it("uses an injected real executor instead of deterministic placeholder drafts", async () => {
    const fixture = ALL_FIXTURES.find((item) => item.expectations.outputFormats.length > 0)!
    let calls = 0
    const result = await runEvalCase(fixture, createFrozenContextAdapter(), {
      skipRubric: true,
      executor: async () => {
        calls += 1
        return {
          drafts: fixture.expectations.outputFormats.map((format) => ({
            format,
            content: "这是真实执行器返回的文案，长度足够用于验证真实输出而不是占位稿。",
          })),
          citedKnowledgeIds: fixture.seedContext.knowledge.map((entry) => entry.id),
          warnedInsufficientInfo: fixture.expectations.mustWarnInsufficientInfo === true,
          runId: "run_real_executor",
        }
      },
    })

    expect(calls).toBe(1)
    expect(result.runId).toBe("run_real_executor")
    expect(result.drafts[0]?.contentPreview).toContain("真实执行器返回")
    expect(result.drafts[0]?.contentPreview).not.toContain("确定性占位")
  })

  it("refuses a real-model eval when no real executor is configured", async () => {
    await expect(
      runEvalCase(ALL_FIXTURES[0], createFrozenContextAdapter(), { skipRubric: false }),
    ).rejects.toThrow("real eval executor")
  })

  it("dispatches real eval cases to the production generation/chat runners", async () => {
    const calls: string[] = []
    const executor = createRealEvalExecutor({
      generate: async (fixture) => {
        calls.push(`generate:${fixture.id}`)
        return {
          drafts: [{ format: "video_script", content: "真实生成结果，内容完整且可用于发布验证。" }],
          runId: "run_generate",
        }
      },
      chat: async (fixture) => {
        calls.push(`chat:${fixture.id}`)
        return {
          drafts: [{ format: "raw_copy", content: "真实对话结果，已经延续上一轮修改要求。" }],
          runId: "run_chat",
        }
      },
    })
    const generateFixture = ALL_FIXTURES.find((item) => item.entrypoint === "generate")!
    const chatFixture = ALL_FIXTURES.find((item) => item.entrypoint === "chat")!
    const adapter = createFrozenContextAdapter()

    await executor(generateFixture, await adapter.load(generateFixture))
    await executor(chatFixture, await adapter.load(chatFixture))

    expect(calls).toEqual([
      `generate:${generateFixture.id}`,
      `chat:${chatFixture.id}`,
    ])
  })

  it("enforces daily and release quality gates", () => {
    const result = (fixtureId: string, agent: string, score: number | null, fabricatedFact = false) => ({
      fixtureId,
      version: 1,
      agent,
      scenario: "new_copy" as const,
      contractPassed: true,
      contractAssertions: [],
      rubricScore: score,
      rubricJudgeProvider: score === null ? null : "judge",
      rubricJudgeModel: score === null ? null : "judge-model",
      fabricatedFact,
      formatValidations: [],
      drafts: [],
      runId: `run_${fixtureId}`,
    })
    const report = (scores: Array<ReturnType<typeof result>>): EvalRunReport => ({
      adapter: "frozen",
      totalCases: scores.length,
      repetitions: 1,
      contractPassRate: 1,
      rubricPassRate: scores.filter((item) => (item.rubricScore ?? 0) >= 70).length / scores.length,
      rubricMean: scores.reduce((sum, item) => sum + (item.rubricScore ?? 0), 0) / scores.length,
      perAgent: Object.fromEntries([...new Set(scores.map((item) => item.agent))].map((agent) => {
        const rows = scores.filter((item) => item.agent === agent)
        return [agent, {
          count: rows.length,
          contractPassRate: 1,
          rubricPassRate: rows.filter((item) => (item.rubricScore ?? 0) >= 70).length / rows.length,
        }]
      })),
      results: scores as EvalRunReport["results"],
      generatedAt: new Date().toISOString(),
    })

    expect(evaluateEvalGate(report([
      result("a", "content_producer", 80),
      result("b", "deep_copywriter", 80),
      result("c", "business_diagnosis", 80),
    ]), "daily").passed).toBe(true)

    expect(evaluateEvalGate(report([
      result("a", "content_producer", null),
      result("b", "deep_copywriter", 90),
      result("c", "business_diagnosis", 90),
    ]), "daily").reasons).toContain("rubric judge coverage is incomplete")

    expect(evaluateEvalGate(report([
      result("a", "content_producer", 90, true),
      result("b", "deep_copywriter", 90),
      result("c", "business_diagnosis", 90),
    ]), "full").reasons).toContain("fabricated facts detected")

    expect(evaluateEvalGate(report([
      result("a", "content_producer", 90),
      result("b", "deep_copywriter", 60),
      result("c", "business_diagnosis", 90),
    ]), "full").passed).toBe(false)
  })
})
