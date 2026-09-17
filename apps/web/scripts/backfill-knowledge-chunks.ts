/**
 * 存量知识块重建脚本（P0）
 *
 * 用途：为历史 KnowledgeEntry 补建 KnowledgeChunk 并生成向量。
 * 新写入的条目会自动建块，此脚本只处理存量。
 *
 * 用法：
 *   cd mingyuan/apps/web
 *   DOTENV_CONFIG_PATH=.env.local NODE_OPTIONS='-r dotenv/config' \
 *     tsx --tsconfig tsconfig.json scripts/backfill-knowledge-chunks.ts
 *
 * 可选过滤（按需改本文件顶部常量，或后续加 argv 解析）：
 *   --userId=<id>      只处理某用户
 *   --projectId=<id>   只处理某项目
 *   --limit=<n>        只处理前 n 条（先小批量验证）
 *   --dry-run          只统计待处理量，不写库
 *
 * 安全设计：
 * - 游标分批，每批 50 条，避免长事务与内存峰值；
 * - 幂等：`ensureEntryChunkEmbeddings` 用指纹判失效，重复跑不会重复消耗额度；
 * - 可中断：中途 Ctrl-C 已完成的条目保持完成状态，重跑从游标续上；
 * - 失败隔离：单条目异常只记录并继续，不阻断整批。
 */

import { prisma } from "@/lib/prisma"
import {
  ensureEntryChunkEmbeddings,
  isChunkRetrievalEnabled,
} from "@/lib/llm/knowledge-chunk-index"

const BATCH_SIZE = 50

interface BackfillOptions {
  userId?: string
  projectId?: string
  limit?: number
  dryRun: boolean
}

function parseArgs(argv: string[]): BackfillOptions {
  const get = (key: string): string | undefined => {
    const hit = argv.find((arg) => arg.startsWith(`--${key}=`))
    return hit ? hit.slice(key.length + 3) : undefined
  }

  const rawLimit = get("limit")
  const limit = rawLimit ? Number.parseInt(rawLimit, 10) : undefined

  return {
    userId: get("userId"),
    projectId: get("projectId"),
    limit: Number.isFinite(limit) ? limit : undefined,
    dryRun: argv.includes("--dry-run"),
  }
}

async function countTargets(options: BackfillOptions): Promise<number> {
  return prisma.knowledgeEntry.count({
    where: {
      status: "active",
      ...(options.userId ? { userId: options.userId } : {}),
      ...(options.projectId ? { projectId: options.projectId } : {}),
    },
  })
}

async function backfill(options: BackfillOptions): Promise<void> {
  const total = await countTargets(options)
  console.log(`[backfill] 待处理条目 ${total} 条${options.dryRun ? "（dry-run，不写库）" : ""}`)

  if (options.dryRun) return

  const where = {
    status: "active",
    ...(options.userId ? { userId: options.userId } : {}),
    ...(options.projectId ? { projectId: options.projectId } : {}),
  }

  let cursor: string | undefined
  let processed = 0
  let chunks = 0
  let embedded = 0
  let failed = 0

  while (true) {
    if (options.limit && processed >= options.limit) break

    const remaining = options.limit ? Math.min(BATCH_SIZE, options.limit - processed) : BATCH_SIZE
    const entries = await prisma.knowledgeEntry.findMany({
      where,
      select: { id: true },
      orderBy: { id: "asc" },
      take: remaining,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })
    if (entries.length === 0) break

    for (const entry of entries) {
      try {
        const result = await ensureEntryChunkEmbeddings(entry.id)
        chunks += result.chunks
        embedded += result.embedded
        processed++
      } catch (error) {
        failed++
        console.warn(`[backfill] 条目 ${entry.id} 失败：`, error)
      }
    }

    cursor = entries.at(-1)?.id
    console.log(`[backfill] 进度 ${processed}/${options.limit ?? total} · 块 ${chunks} · 新嵌入 ${embedded} · 失败 ${failed}`)

    if (entries.length < remaining) break
  }

  console.log(
    `[backfill] 完成：条目 ${processed} · 块 ${chunks} · 新嵌入 ${embedded} · 复用 ${chunks - embedded} · 失败 ${failed}`,
  )
  if (failed > 0) process.exitCode = 1
}

async function main(): Promise<void> {
  if (!isChunkRetrievalEnabled()) {
    console.error(
      "[backfill] 已中止：需要同时设置 EMBEDDING_ENABLED=true 与 KNOWLEDGE_CHUNK_RETRIEVAL_ENABLED=true",
    )
    process.exitCode = 1
    return
  }

  await backfill(parseArgs(process.argv.slice(2)))
}

main()
  .catch((error) => {
    console.error("[backfill] 顶层异常：", error)
    process.exitCode = 1
  })
  .finally(() => {
    void prisma.$disconnect()
  })
