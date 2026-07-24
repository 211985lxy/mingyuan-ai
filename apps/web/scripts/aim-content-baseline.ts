/**
 * 内容生成基线脚手架（14 周正本阶段 1）。
 *
 * Usage:
 *   pnpm --dir apps/web run eval:content-baseline
 *   pnpm --dir apps/web run eval:content-baseline -- --from=./docs/reports/content-generation-baseline.json
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

import {
  compareAgainstBaseline,
  createTemplateBaseline,
  renderContentBaselineMarkdown,
  type ContentGenerationBaseline,
} from "../src/lib/aim-harness/content-baseline"

function parseArgs(argv: string[]): { from?: string; out: string; compare?: string } {
  const opts: { from?: string; out: string; compare?: string } = {
    out: "./aim-content-baseline",
  }
  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--from=")) opts.from = arg.slice("--from=".length)
    else if (arg.startsWith("--out=")) opts.out = arg.slice("--out=".length)
    else if (arg.startsWith("--compare=")) opts.compare = arg.slice("--compare=".length)
  }
  return opts
}

function main() {
  const opts = parseArgs(process.argv)
  let baseline: ContentGenerationBaseline
  if (opts.from && existsSync(resolve(process.cwd(), opts.from))) {
    baseline = JSON.parse(readFileSync(resolve(process.cwd(), opts.from), "utf8")) as ContentGenerationBaseline
    baseline = { ...baseline, source: baseline.source === "template" ? "manual" : baseline.source }
  } else {
    baseline = createTemplateBaseline()
  }

  const outDir = resolve(process.cwd(), opts.out)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(resolve(outDir, "baseline.json"), JSON.stringify(baseline, null, 2))
  writeFileSync(resolve(outDir, "baseline.md"), renderContentBaselineMarkdown(baseline))

  const reportDir = resolve(process.cwd(), "../../docs/reports")
  try {
    mkdirSync(reportDir, { recursive: true })
    writeFileSync(
      resolve(reportDir, "content-generation-baseline.template.json"),
      JSON.stringify(createTemplateBaseline(), null, 2),
    )
  } catch {
    // ignore path issues outside monorepo layout
  }

  process.stdout.write(renderContentBaselineMarkdown(baseline) + "\n")

  if (opts.compare) {
    const candidate = JSON.parse(
      readFileSync(resolve(process.cwd(), opts.compare), "utf8"),
    ) as ContentGenerationBaseline
    const gate = compareAgainstBaseline(baseline, candidate)
    if (!gate.ok) {
      process.stderr.write(`[content-baseline] FAILED: ${gate.reasons.join("; ")}\n`)
      process.exit(1)
    }
    process.stderr.write("[content-baseline] compare passed\n")
  }

  if (baseline.source === "template") {
    process.stderr.write(
      "[content-baseline] wrote TEMPLATE only — 正式门禁前须补齐真实运营指标。\n",
    )
  }
}

main()
