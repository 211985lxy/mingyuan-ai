/**
 * AIM eval CLI — runs the harness eval suite and writes JSON + Markdown reports.
 *
 * Modes:
 *   --deterministic   frozen adapter, skip rubric (the PR gate; no model)
 *   --daily           frozen adapter, 15 cases × 2 reps, rubric ON (needs model keys)
 *   --full            frozen adapter, 50 cases × 3 reps, rubric ON (pre-release)
 *
 * The runner never writes to the customer database. Reports are written to
 * --out (default ./aim-eval-report) as report.json + report.md for the CI
 * artifact / job summary.
 *
 * Usage:
 *   pnpm --dir apps/web exec tsx scripts/aim-eval.ts --deterministic
 *   pnpm --dir apps/web exec tsx scripts/aim-eval.ts --daily
 *   pnpm --dir apps/web exec tsx scripts/aim-eval.ts --full --out ./aim-eval-report
 */

import { writeFileSync, mkdirSync } from "node:fs"
import { resolve } from "node:path"

import { ALL_FIXTURES } from "../__tests__/eval/fixtures"
import {
  createFrozenContextAdapter,
  runEvalSuite,
  renderEvalMarkdown,
  evaluateEvalGate,
} from "../src/lib/aim-harness/eval-runner"
import { createRealEvalExecutor } from "../src/lib/aim-harness/eval-real-executor"

interface CliOptions {
  mode: "deterministic" | "daily" | "full"
  out: string
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { mode: "deterministic", out: "./aim-eval-report" }
  for (const arg of argv.slice(2)) {
    if (arg === "--deterministic") opts.mode = "deterministic"
    else if (arg === "--daily") opts.mode = "daily"
    else if (arg === "--full") opts.mode = "full"
    else if (arg.startsWith("--out=")) opts.out = arg.slice("--out=".length)
    else if (arg === "--out") {
      // next arg
    }
  }
  return opts
}

async function main() {
  const opts = parseArgs(process.argv)
  const adapter = createFrozenContextAdapter()

  const runOptions =
    opts.mode === "deterministic"
      ? { skipRubric: true }
      : opts.mode === "daily"
        ? { sampleSize: 15, repetitions: 2, skipRubric: false }
        : { sampleSize: 50, repetitions: 3, skipRubric: false }
  const executor = opts.mode === "deterministic" ? undefined : createRealEvalExecutor()

  process.stderr.write(`[aim-eval] mode=${opts.mode} adapter=${adapter.name}\n`)

  const report = await runEvalSuite(ALL_FIXTURES, adapter, {
    ...runOptions,
    executor,
    onProgress: (done, total, fixtureId) => {
      process.stderr.write(`[aim-eval] ${done}/${total} ${fixtureId}\n`)
    },
  })

  const outDir = resolve(process.cwd(), opts.out)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(resolve(outDir, "report.json"), JSON.stringify(report, null, 2))
  writeFileSync(resolve(outDir, "report.md"), renderEvalMarkdown(report))

  // Print the markdown to stdout so it can be appended to $GITHUB_STEP_SUMMARY.
  process.stdout.write(renderEvalMarkdown(report) + "\n")

  const gate = evaluateEvalGate(report, opts.mode)
  process.stderr.write(
    `[aim-eval] contract=${(report.contractPassRate * 100).toFixed(1)}% rubric=${
      report.rubricPassRate === null ? "n/a" : (report.rubricPassRate * 100).toFixed(1) + "%"
    }\n`
  )
  if (!gate.passed) {
    process.stderr.write(`[aim-eval] FAILED: ${gate.reasons.join("; ")}\n`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error("[aim-eval] fatal:", error)
  process.exit(1)
})
