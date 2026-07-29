/**
 * AIM eval CLI — runs the harness eval suite and writes JSON + Markdown reports.
 *
 * Modes:
 *   --deterministic   frozen adapter, skip rubric (the PR gate; no model)
 *   --daily           frozen adapter, 15 cases × 2 reps, rubric ON (needs model keys)
 *   --full            all fixtures × 3 reps, rubric ON (pre-release)
 *
 * The runner never writes to the customer database. Reports are written to
 * --out (default ./aim-eval-report) as report.json + report.md for the CI
 * artifact / job summary.
 *
 * qualify_eval 用的已签名资格制品（仅 --daily）：
 *   需同时设置独立密钥 AIM_DAILY_EVAL_ARTIFACT_SECRET（≥32 字符，勿复用用户 API key）
 *   以及 --qualification-metrics=<json> --evidence-ref=<string>
 *   成功时另写 qualification-artifact.json；secret 缺失则只写普通报告，不可用于 qualify。
 *
 * Usage:
 *   pnpm --dir apps/web exec tsx scripts/aim-eval.ts --deterministic
 *   pnpm --dir apps/web exec tsx scripts/aim-eval.ts --daily
 *   pnpm --dir apps/web exec tsx scripts/aim-eval.ts --daily \
 *     --qualification-metrics=./metrics.json --evidence-ref=report://daily/1
 *   pnpm --dir apps/web exec tsx scripts/aim-eval.ts --full --out ./aim-eval-report
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { resolve } from "node:path"

import { ALL_FIXTURES } from "../__tests__/eval/fixtures"
import { assertRealModelProvidersConfigured } from "../src/lib/llm/config"
import {
  createFrozenContextAdapter,
  runEvalSuite,
  renderEvalMarkdown,
  evaluateEvalGate,
} from "../src/lib/aim-harness/eval-runner"
import { createRealEvalExecutor } from "../src/lib/aim-harness/eval-real-executor"
import {
  signDailyEvalArtifact,
  type DailyEvalArtifactBody,
} from "../src/lib/aim/daily-eval-artifact"
import type { LearningQualificationMetrics } from "../src/lib/aim/learning-candidate"

interface CliOptions {
  mode: "deterministic" | "daily" | "full"
  out: string
  qualificationMetricsPath?: string
  evidenceRef?: string
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { mode: "deterministic", out: "./aim-eval-report" }
  for (const arg of argv.slice(2)) {
    if (arg === "--deterministic") opts.mode = "deterministic"
    else if (arg === "--daily") opts.mode = "daily"
    else if (arg === "--full") opts.mode = "full"
    else if (arg.startsWith("--out=")) opts.out = arg.slice("--out=".length)
    else if (arg.startsWith("--qualification-metrics=")) {
      opts.qualificationMetricsPath =
        arg.slice("--qualification-metrics=".length)
    } else if (arg.startsWith("--evidence-ref=")) {
      opts.evidenceRef = arg.slice("--evidence-ref=".length)
    }
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
        : { sampleSize: ALL_FIXTURES.length, repetitions: 3, skipRubric: false }
  const executor = opts.mode === "deterministic" ? undefined : createRealEvalExecutor()

  if (opts.mode !== "deterministic") {
    assertRealModelProvidersConfigured(`eval:${opts.mode}`)
  }

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

  if (opts.mode === "daily") {
    const secret = process.env.AIM_DAILY_EVAL_ARTIFACT_SECRET
    const wantsArtifact = Boolean(
      secret || opts.qualificationMetricsPath || opts.evidenceRef,
    )
    if (!wantsArtifact) {
      process.stderr.write(
        "[aim-eval] 未配置 AIM_DAILY_EVAL_ARTIFACT_SECRET / 资格参数，"
        + "仅写入普通报告（不可用于 qualify_eval）\n",
      )
    } else if (
      !secret
      || !opts.qualificationMetricsPath
      || !opts.evidenceRef
    ) {
      throw new Error(
        "生成资格制品需同时提供 AIM_DAILY_EVAL_ARTIFACT_SECRET（≥32 字符）、"
        + "--qualification-metrics 和 --evidence-ref；缺一不可，拒绝写出半成品",
      )
    } else {
      const metrics = JSON.parse(
        readFileSync(resolve(opts.qualificationMetricsPath), "utf8"),
      ) as LearningQualificationMetrics
      const body: DailyEvalArtifactBody = {
        schemaVersion: 1,
        mode: "daily",
        generatedAt: report.generatedAt,
        contractPassRate: report.contractPassRate,
        rubricPassRate: report.rubricPassRate ?? 0,
        repetitions: report.repetitions,
        results: report.results,
        qualificationMetrics: metrics,
        evidenceRef: opts.evidenceRef,
      }
      writeFileSync(
        resolve(outDir, "qualification-artifact.json"),
        JSON.stringify(signDailyEvalArtifact({ body, secret }), null, 2),
      )
      process.stderr.write(
        "[aim-eval] signed qualification artifact written\n",
      )
    }
  }
}

main().catch((error) => {
  console.error("[aim-eval] fatal:", error)
  process.exit(1)
})
