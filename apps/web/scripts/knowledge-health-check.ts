/**
 * 知识库周巡检脚本
 *
 * 检查项：
 * 1. KnowledgeEmbedding 中 status=failed/pending 超 24h 的条目
 * 2. KnowledgeEntry 有记录但无 KnowledgeRelation 关联的条目（实体抽取缺失）
 * 3. KnowledgeEntity 无任何 KnowledgeRelation 的孤儿实体
 * 4. KnowledgeEntry.category 不在 12 种合法值中的条目
 * 5. KnowledgeEntry.status=active 但 updatedAt 超过 180 天的条目
 *
 * 用法：cd apps/web && npx tsx scripts/knowledge-health-check.ts
 */

import { PrismaClient } from "@prisma/client"
import { KNOWLEDGE_CATEGORIES } from "@/lib/knowledge-categories"
import * as fs from "fs"
import * as path from "path"

const prisma = new PrismaClient()
const VALID_CATEGORIES = new Set(KNOWLEDGE_CATEGORIES)

const ONE_DAY_MS = 24 * 60 * 60 * 1000
const ONE_HUNDRED_EIGHTY_DAYS_MS = 180 * ONE_DAY_MS

async function main() {
  const now = new Date()
  const lines: string[] = [`# 知识库健康巡检报告`, `> 生成时间：${now.toISOString()}`, ""]

  // 1. Embedding failed/pending > 24h
  const staleEmbeddings = await prisma.knowledgeEmbedding.findMany({
    where: {
      status: { in: ["failed", "pending"] },
      updatedAt: { lt: new Date(now.getTime() - ONE_DAY_MS) },
    },
    include: { entry: { select: { id: true, title: true } } },
    take: 50,
  })

  lines.push("## 1. 超时 Embedding（failed/pending > 24h）")
  if (staleEmbeddings.length === 0) {
    lines.push("- ✅ 无异常")
  } else {
    lines.push(`- ⚠️ 共 ${staleEmbeddings.length} 条`)
    for (const e of staleEmbeddings) {
      lines.push(`  - [${e.status}] ${e.entryId}: ${e.entry.title} (updated: ${e.updatedAt.toISOString()})`)
    }
  }
  lines.push("")

  // 2. KnowledgeEntry 无 KnowledgeRelation（实体抽取缺失）
  const entriesWithRelations = await prisma.knowledgeRelation.findMany({
    select: { knowledgeEntryId: true },
    distinct: ["knowledgeEntryId"],
  })
  const entryIdsWithRelations = new Set(entriesWithRelations.map((r) => r.knowledgeEntryId))

  const activeEntriesWithoutRelations = await prisma.knowledgeEntry.findMany({
    where: {
      status: "active",
      id: { notIn: Array.from(entryIdsWithRelations) },
    },
    select: { id: true, title: true, category: true, updatedAt: true },
    take: 50,
  })

  lines.push("## 2. 缺失实体抽取的活跃条目（无 KnowledgeRelation）")
  if (activeEntriesWithoutRelations.length === 0) {
    lines.push("- ✅ 所有活跃条目均有实体关系")
  } else {
    lines.push(`- ⚠️ 共 ${activeEntriesWithoutRelations.length} 条`)
    for (const e of activeEntriesWithoutRelations) {
      lines.push(`  - [${e.category}] ${e.id}: ${e.title}`)
    }
  }
  lines.push("")

  // 3. 孤儿 KnowledgeEntity（无 KnowledgeRelation）
  const entitiesWithRelations = await prisma.knowledgeRelation.findMany({
    select: { knowledgeEntityId: true },
    distinct: ["knowledgeEntityId"],
  })
  const entityIdsWithRelations = new Set(entitiesWithRelations.map((r) => r.knowledgeEntityId))

  const orphanEntities = await prisma.knowledgeEntity.findMany({
    where: { id: { notIn: Array.from(entityIdsWithRelations) } },
    select: { id: true, name: true },
    take: 50,
  })

  lines.push("## 3. 孤儿实体（无 KnowledgeRelation）")
  if (orphanEntities.length === 0) {
    lines.push("- ✅ 无孤儿实体")
  } else {
    lines.push(`- ⚠️ 共 ${orphanEntities.length} 个`)
    for (const e of orphanEntities) {
      lines.push(`  - ${e.id}: ${e.name}`)
    }
  }
  lines.push("")

  // 4. 非法分类值
  const allEntries = await prisma.knowledgeEntry.findMany({
    select: { id: true, category: true, title: true },
    take: 500,
  })
  const invalidCategoryEntries = allEntries.filter((e) => !VALID_CATEGORIES.has(e.category))

  lines.push("## 4. 非法分类值")
  if (invalidCategoryEntries.length === 0) {
    lines.push("- ✅ 所有条目分类合法")
  } else {
    lines.push(`- ⚠️ 共 ${invalidCategoryEntries.length} 条`)
    for (const e of invalidCategoryEntries) {
      lines.push(`  - [${e.category}] ${e.id}: ${e.title}`)
    }
  }
  lines.push("")

  // 5. 活跃但超 180 天未更新的条目
  const staleEntries = await prisma.knowledgeEntry.findMany({
    where: {
      status: "active",
      updatedAt: { lt: new Date(now.getTime() - ONE_HUNDRED_EIGHTY_DAYS_MS) },
    },
    select: { id: true, title: true, category: true, updatedAt: true },
    take: 50,
    orderBy: { updatedAt: "asc" },
  })

  lines.push("## 5. 活跃但超 180 天未更新的条目")
  if (staleEntries.length === 0) {
    lines.push("- ✅ 无超期条目")
  } else {
    lines.push(`- ℹ️ 共 ${staleEntries.length} 条`)
    for (const e of staleEntries) {
      lines.push(`  - [${e.category}] ${e.id}: ${e.title} (updated: ${e.updatedAt.toISOString()})`)
    }
  }

  const report = lines.join("\n")
  const dateKey = now.toISOString().slice(0, 10)
  const outDir = path.join(process.cwd(), "docs", "reports")
  fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, `knowledge-health-${dateKey}.md`)
  fs.writeFileSync(outPath, report, "utf-8")
  console.log(report)
  console.log(`\n📄 报告已保存到: ${outPath}`)
}

main()
  .catch((e) => {
    console.error("巡检失败:", e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
