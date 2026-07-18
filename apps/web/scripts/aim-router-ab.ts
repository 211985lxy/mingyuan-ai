/**
 * deep_copywriter router A/B comparison — runs the 15 deep_copywriter fixtures
 * against each candidate model route and reports quality (rubric) + estimated
 * cost side-by-side, so the route can be chosen from data instead of guesses.
 *
 * This is an evaluation harness, NOT a production path. It never writes the
 * customer database. Candidate model selection uses setAgentModelOverride, which
 * is a no-op in production (only this script installs overrides).
 *
 * Output:
 *   - <out>/report.json   full per-candidate report
 *   - <out>/report.md     comparison table (also printed to stdout)
 *
 * Usage:
 *   pnpm --dir apps/web exec tsx scripts/aim-router-ab.ts --out ./aim-router-ab-report
 *
 * Requires model API keys (real executor + rubric judge both call LLMs).
 */
import { writeFileSync, mkdirSync } from "node:fs"
import { resolve } from "node:path"

import { DEEP_COPYWRITER_FIXTURES } from "../__tests__/eval/fixtures"
import {
  createFrozenContextAdapter,
  runEvalSuite,
  evaluateEvalGate,
} from "../src/lib/aim-harness/eval-runner"
import { createRealEvalExecutor } from "../src/lib/aim-harness/eval-real-executor"
import {
  setAgentModelOverride,
  clearAgentModelOverride,
  type AgentModelRoute,
} from "../src/lib/llm/agent-router"
import { estimateTokensFromText } from "../src/lib/aim-context-usage"
import { computeCostCny } from "../src/lib/aim-harness/model-pricing"

interface Candidate {
  /** label shown in the report */
  label: string
  /** route that becomes the preferred provider for deep_copywriter during this run */
  route: AgentModelRoute
}

/**
 * Candidates to compare. The first mirrors the current production default
 * (lihuo/gpt-5.5); the others are the copywriting-report recommendations
 * (Kimi K2.6 for lowest AI-flavour, Doubao for platform feel).
 */
const CANDIDATES: Candidate[] = [
  {
    label: "lihuo/gpt-5.5 (current default)",
    route: { name: "lihuo", model: "gpt-5.5" },
  },
  {
    label: "openrouter/moonshotai/kimi-k2.6",
    route: { name: "openrouter", model: "moonshotai/kimi-k2.6" },
  },
  {
    label: "openrouter/bytedance-seed/seed-1.6-flash",
    route: { name: "openrouter", model: "bytedance-seed/seed-1.6-flash" },
  },
]

interface CandidateResult {
  candidate: string
  provider: string
  model: string
  contractPassRate: number
  rubricPassRate: number | null
  rubricMean: number | null
  // estimated cost per copy (RMB yuan), derived from fixture token estimates
  estInputTokens: number
  estOutputTokens: number
  estCostCnyPerCopy: number
  gatePassed: boolean
  gateReasons: string[]
}

function parseArgs(argv: string[]): { out: string } {
  const opts = { out: "./aim-router-ab-report" }
  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--out=")) opts.out = arg.slice("--out=".length)
  }
  return opts
}

/** Estimate average input/output tokens across the deep_copywriter fixtures. */
function estimateFixtureTokens(): { input: number; output: number } {
  let input = 0
  let output = 0
  for (const fixture of DEEP_COPYWRITER_FIXTURES) {
    input += estimateTokensFromText(fixture.input.rawInput ?? "") + 1500 // methodology/system prompt overhead
    output += 1800 // deep_copywriter produces a long-form copy (~maxTokens 4000 region)
  }
  const n = DEEP_COPYWRITER_FIXTURES.length || 1
  return { input: Math.round(input / n), output: Math.round(output / n) }
}

async function runCandidate(candidate: Candidate): Promise<CandidateResult> {
  process.stderr.write(`\n[router-ab] === ${candidate.label} ===\n`)
  setAgentModelOverride("deep_copywriter", candidate.route)
  try {
    const adapter = createFrozenContextAdapter()
    const executor = createRealEvalExecutor()
    const report = await runEvalSuite(DEEP_COPYWRITER_FIXTURES, adapter, {
      sampleSize: DEEP_COPYWRITER_FIXTURES.length,
      repetitions: 2,
      skipRubric: false,
      executor,
      onProgress: (done, total, fixtureId) => {
        process.stderr.write(`[router-ab] ${candidate.label} ${done}/${total} ${fixtureId}\n`)
      },
    })
    const gate = evaluateEvalGate(report, "daily")
    const est = estimateFixtureTokens()
    const estCostCnyPerCopy =
      computeCostCny(candidate.route.name, candidate.route.model, {
        inputTokens: est.input,
        outputTokens: est.output,
      }) ?? 0
    return {
      candidate: candidate.label,
      provider: candidate.route.name,
      model: candidate.route.model ?? "",
      contractPassRate: report.contractPassRate,
      rubricPassRate: report.rubricPassRate,
      rubricMean: report.rubricMean,
      estInputTokens: est.input,
      estOutputTokens: est.output,
      estCostCnyPerCopy,
      gatePassed: gate.passed,
      gateReasons: gate.reasons,
    }
  } finally {
    clearAgentModelOverride("deep_copywriter")
  }
}

function renderMarkdown(results: CandidateResult[]): string {
  const pct = (v: number | null) => (v === null ? "n/a" : (v * 100).toFixed(1) + "%")
  const mean = (v: number | null) => (v === null ? "n/a" : v.toFixed(1))
  const lines: string[] = []
  lines.push("# deep_copywriter 路由 A/B 对比报告")
  lines.push("")
  lines.push("> 质量为 rubric 评分（≥70 分为通过）；成本为按 fixture 字符估算的单篇成本（人民币元）。")
  lines.push("> 成本为相对量级，真实计费以 AimExecutionTrace.costCny 为准（子系统2）。")
  lines.push("")
  lines.push("| 候选模型 | provider | 契约通过率 | rubric通过率 | rubric均分 | 估算单篇成本(元) | 门禁 |")
  lines.push("|---|---|---|---|---|---|---|")
  for (const r of results) {
    lines.push(
      `| ${r.candidate} | ${r.provider} | ${pct(r.contractPassRate)} | ${pct(r.rubricPassRate)} | ${mean(r.rubricMean)} | ${r.estCostCnyPerCopy.toFixed(4)} | ${r.gatePassed ? "✅" : "❌"} |`
    )
  }
  lines.push("")
  lines.push("## 建议")
  const passed = results.filter((r) => r.gatePassed && r.rubricMean !== null)
  if (passed.length === 0) {
    lines.push("- 无候选通过 daily 门禁，建议保持现状路由并排查 rubric 失败原因。")
  } else {
    const cheapest = [...passed].sort((a, b) => a.estCostCnyPerCopy - b.estCostCnyPerCopy)[0]
    const best = [...passed].sort((a, b) => (b.rubricMean ?? 0) - (a.rubricMean ?? 0))[0]
    lines.push(`- 质量最佳：**${best.candidate}**（rubric 均分 ${mean(best.rubricMean)}）`)
    lines.push(`- 通过门禁且最省：**${cheapest.candidate}**（单篇约 ${cheapest.estCostCnyPerCopy.toFixed(4)} 元）`)
    lines.push("- 确认后改 `agent-router.ts` 的 `deep_copywriter` 路由并同步 `agent-logic-profile.ts`。")
  }
  return lines.join("\n")
}

async function main() {
  const opts = parseArgs(process.argv)
  process.stderr.write(`[router-ab] candidates=${CANDIDATES.length} fixtures=${DEEP_COPYWRITER_FIXTURES.length}\n`)
  process.stderr.write(`[router-ab] 注意：本脚本会真实调用 LLM，产生 API 费用。\n`)

  const results: CandidateResult[] = []
  for (const candidate of CANDIDATES) {
    try {
      results.push(await runCandidate(candidate))
    } catch (error) {
      process.stderr.write(`[router-ab] candidate ${candidate.label} failed: ${String(error)}\n`)
      results.push({
        candidate: candidate.label,
        provider: candidate.route.name,
        model: candidate.route.model ?? "",
        contractPassRate: 0,
        rubricPassRate: null,
        rubricMean: null,
        estInputTokens: 0,
        estOutputTokens: 0,
        estCostCnyPerCopy: 0,
        gatePassed: false,
        gateReasons: [`run failed: ${String(error)}`],
      })
    }
  }

  const outDir = resolve(process.cwd(), opts.out)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(resolve(outDir, "report.json"), JSON.stringify(results, null, 2))
  const md = renderMarkdown(results)
  writeFileSync(resolve(outDir, "report.md"), md)
  process.stdout.write(md + "\n")
}

main().catch((error) => {
  console.error("[router-ab] fatal:", error)
  process.exit(1)
})
