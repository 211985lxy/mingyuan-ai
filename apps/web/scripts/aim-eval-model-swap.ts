/**
 * AIM model-swap eval（缺口升级 WP-A2）。
 *
 * 固定 Harness + frozen fixtures，分别用 strong / weak 路由画像跑同一批用例，
 * 输出对比报告与瓶颈标签：harness_bound | model_bound | inconclusive。
 *
 * Usage:
 *   pnpm --dir apps/web exec tsx scripts/aim-eval-model-swap.ts
 *   pnpm --dir apps/web exec tsx scripts/aim-eval-model-swap.ts --out=./aim-eval-model-swap
 */

import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { ALL_FIXTURES } from "../__tests__/eval/fixtures"
import { assertRealModelProvidersConfigured } from "../src/lib/llm/config"
import {
  createFrozenContextAdapter,
  evaluateEvalGate,
  runEvalSuite,
  type EvalCaseResult,
  type EvalRunReport,
} from "../src/lib/aim-harness/eval-runner"
import { createRealEvalExecutor } from "../src/lib/aim-harness/eval-real-executor"
import type { EvalFixture } from "../src/lib/aim-harness/eval/contracts"
import {
  AIM_EVAL_MODEL_SWAP_ENV,
  type AimEvalModelSwapProfile,
} from "../src/lib/llm/agent-router"
import { classifyModelSwapBottleneck } from "../src/lib/aim-harness/eval-model-swap"

/** 跨 agent 代表例（契约固定 ID；缺失则按 agent 各取首条兜底）。 */
const PREFERRED_FIXTURE_IDS = [
  "cp_new_video_01",
  "cp_info_insufficient_19",
  "we_polish_01",
  "bd_new_position_01",
  "pq_new_xhs_01",
  "bsd_new_01",
  "cr_new_01",
  "persona_new_01",
] as const

function pickSwapFixtures(all: EvalFixture[]): EvalFixture[] {
  const byId = new Map(all.map((fixture) => [fixture.id, fixture]))
  const picked: EvalFixture[] = []
  for (const id of PREFERRED_FIXTURE_IDS) {
    const hit = byId.get(id)
    if (hit) picked.push(hit)
  }
  if (picked.length >= 5) return picked.slice(0, 8)

  const seenAgents = new Set(picked.map((fixture) => fixture.agent))
  for (const fixture of all) {
    if (picked.length >= 8) break
    if (seenAgents.has(fixture.agent)) continue
    picked.push(fixture)
    seenAgents.add(fixture.agent)
  }
  while (picked.length < 5 && picked.length < all.length) {
    const next = all.find((fixture) => !picked.includes(fixture))
    if (!next) break
    picked.push(next)
  }
  return picked
}

function meanRubric(results: EvalCaseResult[]): number | null {
  const scores = results
    .map((result) => result.rubricScore)
    .filter((score): score is number => typeof score === "number")
  if (scores.length === 0) return null
  return scores.reduce((sum, score) => sum + score, 0) / scores.length
}

function fabricatedRate(results: EvalCaseResult[]): number {
  if (results.length === 0) return 0
  return results.filter((result) => result.fabricatedFact).length / results.length
}

async function runProfile(
  profile: AimEvalModelSwapProfile,
  fixtures: EvalFixture[],
): Promise<EvalRunReport> {
  process.env[AIM_EVAL_MODEL_SWAP_ENV] = profile
  try {
    return await runEvalSuite(fixtures, createFrozenContextAdapter(), {
      sampleSize: fixtures.length,
      repetitions: 1,
      skipRubric: false,
      executor: createRealEvalExecutor(),
    })
  } finally {
    delete process.env[AIM_EVAL_MODEL_SWAP_ENV]
  }
}

function parseOut(argv: string[]): string {
  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--out=")) return arg.slice("--out=".length)
  }
  return "./aim-eval-model-swap"
}

async function main() {
  assertRealModelProvidersConfigured("eval:model-swap")
  const fixtures = pickSwapFixtures(ALL_FIXTURES)
  if (fixtures.length < 5) {
    throw new Error(`[aim-eval-model-swap] 代表例不足（${fixtures.length}），需要至少 5 个 fixture`)
  }

  process.stderr.write(
    `[aim-eval-model-swap] fixtures=${fixtures.map((fixture) => fixture.id).join(",")}\n`,
  )

  const strong = await runProfile("strong", fixtures)
  const weak = await runProfile("weak", fixtures)

  const strongGate = evaluateEvalGate(strong, "daily")
  const weakGate = evaluateEvalGate(weak, "daily")
  const strongMean = meanRubric(strong.results)
  const weakMean = meanRubric(weak.results)
  const bottleneck = classifyModelSwapBottleneck({
    strongMean,
    weakMean,
    strongContract: strong.contractPassRate,
    weakContract: weak.contractPassRate,
  })

  const report = {
    generatedAt: new Date().toISOString(),
    fixtureIds: fixtures.map((fixture) => fixture.id),
    bottleneck,
    strong: {
      contractPassRate: strong.contractPassRate,
      rubricPassRate: strong.rubricPassRate,
      rubricMean: strongMean,
      fabricatedRate: fabricatedRate(strong.results),
      gatePassed: strongGate.passed,
      gateReasons: strongGate.reasons,
    },
    weak: {
      contractPassRate: weak.contractPassRate,
      rubricPassRate: weak.rubricPassRate,
      rubricMean: weakMean,
      fabricatedRate: fabricatedRate(weak.results),
      gatePassed: weakGate.passed,
      gateReasons: weakGate.reasons,
    },
    deltaRubricMean:
      strongMean !== null && weakMean !== null ? strongMean - weakMean : null,
  }

  const outDir = resolve(process.cwd(), parseOut(process.argv))
  mkdirSync(outDir, { recursive: true })
  writeFileSync(resolve(outDir, "report.json"), JSON.stringify(report, null, 2))

  const md = [
    "# AIM Model-Swap Report",
    "",
    `- Generated: ${report.generatedAt}`,
    `- Fixtures: ${report.fixtureIds.join(", ")}`,
    `- Bottleneck: **${report.bottleneck}**`,
    `- Δ rubric mean (strong − weak): ${report.deltaRubricMean ?? "n/a"}`,
    "",
    "| Profile | Contract | Rubric pass | Rubric mean | Fabricated | Gate |",
    "| --- | --- | --- | --- | --- | --- |",
    `| strong | ${(report.strong.contractPassRate * 100).toFixed(1)}% | ${
      report.strong.rubricPassRate === null
        ? "n/a"
        : `${(report.strong.rubricPassRate * 100).toFixed(1)}%`
    } | ${report.strong.rubricMean?.toFixed(1) ?? "n/a"} | ${(report.strong.fabricatedRate * 100).toFixed(1)}% | ${
      report.strong.gatePassed ? "pass" : "fail"
    } |`,
    `| weak | ${(report.weak.contractPassRate * 100).toFixed(1)}% | ${
      report.weak.rubricPassRate === null
        ? "n/a"
        : `${(report.weak.rubricPassRate * 100).toFixed(1)}%`
    } | ${report.weak.rubricMean?.toFixed(1) ?? "n/a"} | ${(report.weak.fabricatedRate * 100).toFixed(1)}% | ${
      report.weak.gatePassed ? "pass" : "fail"
    } |`,
    "",
    "Heuristic: Δ<5 → harness_bound; Δ≥12 → model_bound; else inconclusive.",
  ].join("\n")

  writeFileSync(resolve(outDir, "report.md"), md)
  process.stdout.write(md + "\n")
  process.stderr.write(`[aim-eval-model-swap] bottleneck=${bottleneck}\n`)

  // model-swap 本身是诊断报告，不强求 weak 过 gate；但强侧契约必须 100%，且不得整批虚构。
  if (strong.contractPassRate < 0.999) {
    process.stderr.write("[aim-eval-model-swap] FAILED: strong profile contract < 100%\n")
    process.exit(1)
  }
  if (strong.results.some((result) => result.fabricatedFact) && weak.results.some((result) => result.fabricatedFact)) {
    process.stderr.write("[aim-eval-model-swap] FAILED: fabricated facts on both profiles\n")
    process.exit(1)
  }
}

main().catch((error) => {
  console.error("[aim-eval-model-swap] fatal:", error)
  process.exit(1)
})
