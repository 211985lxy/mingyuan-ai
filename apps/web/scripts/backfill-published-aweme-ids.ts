/**
 * 一次性回填：扫描已发布记录，列出解不出抖音 aweme_id 的清单。
 * 默认 dry-run。能从链接直接解析的只打印，不改库（作品键仍存在 publishUrl）。
 */
import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient } from "../src/generated/prisma/client"
import { classifyPublishedWorkKey } from "../src/lib/aim/platform-post-id"
import { resolveDouyinAwemeId } from "../src/lib/douyin-short-url"

function createPrismaClient() {
  const rawUrl = (process.env.DATABASE_URL ?? "").replace(/^mysql:\/\//, "mariadb://")
  if (!rawUrl) throw new Error("DATABASE_URL is required")
  const url = new URL(rawUrl)
  return new PrismaClient({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: parseInt(url.port || "3306", 10),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
      charset: "utf8mb4",
      connectionLimit: 5,
    }),
  })
}

async function main() {
  const prisma = createPrismaClient()
  const needsBackfill: Array<{ id: string; userId: string; publishPlatform: string | null; publishUrl: string | null }> = []
  const parseable = { count: 0 }

  try {
    const rows = await prisma.aimGeneration.findMany({
      where: { workflowStatus: "published" },
      select: { id: true, userId: true, publishPlatform: true, publishUrl: true },
      take: 5000,
    })

    for (const row of rows) {
      const classified = classifyPublishedWorkKey(row.publishPlatform, row.publishUrl)
      if (classified.status === "other") continue
      if (classified.status === "aweme") {
        parseable.count += 1
        continue
      }
      if (classified.status === "short") {
        const resolved = await resolveDouyinAwemeId(row.publishUrl ?? "")
        if (resolved) {
          parseable.count += 1
          continue
        }
      }
      needsBackfill.push(row)
    }

    console.log(`可解析：${parseable.count} 条；需人工补录：${needsBackfill.length} 条`)
    for (const row of needsBackfill) {
      console.log(`${row.id}\t${row.userId}\t${row.publishPlatform ?? ""}\t${row.publishUrl ?? ""}`)
    }
  } finally {
    await prisma.$disconnect()
  }
}

void main()
