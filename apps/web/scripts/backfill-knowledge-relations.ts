#!/usr/bin/env tsx
/**
 * 存量知识关系补课（WP-A5 前置）：给尚未抽取实体关系的知识条目补跑抽取。
 *
 * 为什么需要：关系抽取只挂在知识新增链路上（`POST /api/knowledge`），
 * 功能上线前的存量知识从没抽过。实测生产：171 条活跃知识中**仅 2 条有关系**，
 * 因此图谱扩展检索不可能有增益——不是概念不行，是测不出。
 *
 * 用法（默认 dry-run，不会花任何模型调用）：
 *   pnpm --dir apps/web exec tsx scripts/backfill-knowledge-relations.ts --projectId <pid> [--limit 20] [--apply]
 *
 * --apply 才会真正调用模型并写库；每条一次抽取调用，失败单条跳过不阻断批次。
 */
import { prisma } from "../src/lib/prisma"
import { extractAndPersistForEntry } from "../src/lib/knowledge-entity-extractor"

interface Args {
  projectId: string
  limit: number
  apply: boolean
}

function readArgs(): Args {
  const args = process.argv.slice(2)
  const flag = (name: string): string | undefined => {
    const index = args.indexOf(`--${name}`)
    return index >= 0 ? args[index + 1] : undefined
  }
  const projectId = flag("projectId")
  if (!projectId) {
    console.error("用法：tsx scripts/backfill-knowledge-relations.ts --projectId <pid> [--limit 20] [--apply]")
    process.exit(1)
  }
  return {
    projectId,
    limit: Number(flag("limit") ?? "20"),
    apply: args.includes("--apply"),
  }
}

async function main(): Promise<void> {
  const args = readArgs()

  // 需要补课的条目：无任何 KnowledgeRelation 指向/来自它的活跃条目。
  const entries = await prisma.knowledgeEntry.findMany({
    where: {
      projectId: args.projectId,
      status: "active",
      relations: { none: {} },
    },
    select: { id: true, title: true, content: true, userId: true },
    orderBy: { createdAt: "desc" },
    take: args.limit,
  })

  const [total, withRelations] = await Promise.all([
    prisma.knowledgeEntry.count({ where: { projectId: args.projectId, status: "active" } }),
    prisma.knowledgeRelation
      .findMany({
        where: { entry: { projectId: args.projectId, status: "active" } },
        select: { entryId: true },
        distinct: ["entryId"],
        take: 1000,
      })
      .then((rows) => rows.length),
  ])

  console.log(`项目知识：${total} 条；已有关系的：${withRelations} 条`)
  console.log(`本轮待补：${entries.length} 条（limit=${args.limit}）`)
  console.log(args.apply ? "模式：APPLY（会调用模型并写库）" : "模式：DRY-RUN（不调用模型、不写库）")

  if (!args.apply) {
    entries.slice(0, 10).forEach((entry, index) => {
      console.log(`  ${index + 1}. ${entry.title}（${entry.id}）`)
    })
    console.log("\nDRY-RUN 结束。确认无误后加 --apply 执行。")
    return
  }

  let ok = 0
  let failed = 0
  for (const [index, entry] of entries.entries()) {
    try {
      await extractAndPersistForEntry(entry.id, entry.content, {
        userId: entry.userId,
        projectId: args.projectId,
      })
      ok += 1
      console.log(`  [${index + 1}/${entries.length}] ✅ ${entry.title}`)
    } catch (error) {
      failed += 1
      console.log(`  [${index + 1}/${entries.length}] ❌ ${entry.title}：${error instanceof Error ? error.message : "未知错误"}`)
    }
  }

  console.log(`\n完成：成功 ${ok}，失败 ${failed}`)
  console.log("提示：补课后用基线脚本加 --graph 复测检索，判断是否达到闸门（hitRate 相对提升 ≥10%）。")
}

void main().catch((error) => {
  console.error("[backfill] fatal:", error)
  process.exit(1)
})
