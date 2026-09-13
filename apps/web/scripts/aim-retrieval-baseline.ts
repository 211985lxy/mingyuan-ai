#!/usr/bin/env tsx
/**
 * 检索质量基线 CLI（WP-A5 第一步，人工带真实环境运行）：
 *   pnpm --dir apps/web exec tsx scripts/aim-retrieval-baseline.ts --userId <uid> --projectId <pid> [--out docs/reports]
 *
 * 产出：docs/reports/aim-retrieval-baseline-<date>.md（hitRate@k / MRR / 关键词命中率 / 逐例明细）。
 * 该基线是 WP-A5 投入闸门的对照点：图谱注入后 hitRate 相对提升 <10% 即止损归档。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { join } from "node:path"

import { retrieveRelevantKnowledge } from "../src/lib/llm/embeddings"
import { prisma } from "../src/lib/prisma"
import {
  runRetrievalEval,
  type RetrievalCase,
  type RetrievalEvalAggregate,
} from "../src/lib/aim/retrieval-eval"

interface CasesFile {
  description: string
  topK: number
  cases: RetrievalCase[]
}

function readArgs(): { userId: string; projectId: string; out: string } {
  const args = process.argv.slice(2)
  function readFlag(name: string): string | undefined {
    const index = args.indexOf(`--${name}`)
    return index >= 0 ? args[index + 1] : undefined
  }
  const userId = readFlag("userId")
  const projectId = readFlag("projectId")
  if (!userId || !projectId) {
    console.error("用法：tsx scripts/aim-retrieval-baseline.ts --userId <uid> --projectId <pid> [--out docs/reports]")
    process.exit(1)
  }
  return { userId, projectId, out: readFlag("out") ?? "docs/reports" }
}

function renderReport(args: { userId: string; projectId: string }, aggregate: RetrievalEvalAggregate, topK: number): string {
  const lines: string[] = []
  lines.push("# AIM 检索质量基线报告（WP-A5）")
  lines.push("")
  lines.push(`- 运行时间：${new Date().toISOString()}`)
  lines.push(`- 范围：userId=${args.userId} projectId=${args.projectId}（含全局知识）`)
  lines.push(`- topK：${topK}`)
  lines.push("")
  lines.push("| 指标 | 数值 |")
  lines.push("| --- | --- |")
  lines.push(`| 用例数 | ${aggregate.totalCases} |`)
  lines.push(`| hitRate@${topK} | ${(aggregate.hitRateAtK * 100).toFixed(1)}% |`)
  lines.push(`| MRR | ${aggregate.mrr.toFixed(3)} |`)
  lines.push(`| 关键词命中率 | ${aggregate.keywordHitRate === null ? "（无用例标注）" : `${(aggregate.keywordHitRate * 100).toFixed(1)}%`} |`)
  lines.push(`| 通过率 | ${(aggregate.passRate * 100).toFixed(1)}% |`)
  lines.push("")
  lines.push("| 用例 | 命中 | 首个相关排名 | 关键词 |")
  lines.push("| --- | --- | --- | --- |")
  for (const item of aggregate.perCase) {
    lines.push(
      `| ${item.caseId} | ${item.hitAtK ? "✅" : "❌"} | ${item.firstRelevantRank ?? "—"} | ${item.keywordHit === null ? "—" : item.keywordHit ? "✅" : "❌"} |`,
    )
  }
  lines.push("")
  lines.push("> 投入闸门：后续知识图谱注入上线后重跑本脚本，hitRate 相对提升 ≥10% 才继续投入；否则归档为「已验证不值得」。")
  lines.push("")
  return lines.join("\n")
}

async function main(): Promise<void> {
  const args = readArgs()
  const casesPath = join(process.cwd(), "scripts", "aim-retrieval-baseline-cases.json")
  const parsed = JSON.parse(readFileSync(casesPath, "utf-8")) as CasesFile
  // 租户模板用例（未填关键词/条目）不计入统计
  const cases = parsed.cases.filter(
    (item) => (item.relevantEntryIds?.length ?? 0) > 0 || (item.mustIncludeKeywords?.length ?? 0) > 0,
  )
  if (cases.length === 0) {
    console.error("没有可评估用例：请在 aim-retrieval-baseline-cases.json 补充关键词或条目标注。")
    process.exit(1)
  }

  const project = await prisma.clientProject.findUnique({ where: { id: args.projectId }, select: { id: true, name: true } })
  if (!project) {
    console.error(`项目不存在：${args.projectId}`)
    process.exit(1)
  }

  const aggregate = await runRetrievalEval(cases, parsed.topK, (query, topK) =>
    retrieveRelevantKnowledge({ userId: args.userId, projectId: args.projectId, query, topK }).then((result) =>
      result.entries.map((entry) => ({ id: entry.id, title: entry.title, content: entry.content })),
    ),
  )

  const markdown = renderReport(args, aggregate, parsed.topK)
  process.stdout.write(`${markdown}\n`)
  if (existsSync(args.out)) {
    const filename = `aim-retrieval-baseline-${new Date().toISOString().slice(0, 10)}.md`
    mkdirSync(args.out, { recursive: true })
    writeFileSync(join(args.out, filename), markdown)
    process.stdout.write(`报告已写入 ${join(args.out, filename)}\n`)
  }
  process.exit(0)
}

void main()
