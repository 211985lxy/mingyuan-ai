/**
 * 一次性回填：扫描已发布记录，列出解不出抖音 aweme_id 的清单。
 * 默认 dry-run。能从链接直接解析的只打印，不改库（作品键仍存在 publishUrl）。
 *
 * F18 动作 D1（存量清洗，零出站）：对 status==="short" 的记录先做「只读复核」——
 * 仅解析 DNS 判定是否公网（resolvePublicTarget），**绝不 fetch**；复核不通过的记为
 * 疑似投毒并跳过后续探测，避免审计动作本身打到内网/云元数据。
 */
import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient } from "../src/generated/prisma/client"
import { classifyPublishedWorkKey } from "../src/lib/aim/platform-post-id"
import { resolveDouyinAwemeId } from "../src/lib/douyin-short-url-resolver"
import { resolvePublicTarget, SsrfBlockedError } from "../src/lib/ssrf-guard.server"

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
  const suspects: Array<{ id: string; userId: string; publishUrl: string | null; reason: string }> = []
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
        // 只读复核（零出站）：解析 DNS 判公网，不 fetch。
        try {
          await resolvePublicTarget(classified.url)
        } catch (error) {
          suspects.push({
            id: row.id,
            userId: row.userId,
            publishUrl: row.publishUrl,
            reason: error instanceof SsrfBlockedError ? error.message : "复核失败",
          })
          continue
        }
        const resolved = await resolveDouyinAwemeId(row.publishUrl ?? "")
        if (resolved) {
          parseable.count += 1
          continue
        }
      }
      needsBackfill.push(row)
    }

    console.log(`可解析：${parseable.count} 条；需人工补录：${needsBackfill.length} 条；SSRF 疑似存量：${suspects.length} 条`)
    for (const row of needsBackfill) {
      console.log(`${row.id}\t${row.userId}\t${row.publishPlatform ?? ""}\t${row.publishUrl ?? ""}`)
    }
    if (suspects.length > 0) {
      console.log("--- SSRF 疑似存量（解析到非公网地址或格式非法，建议隔离/置失效）---")
      for (const row of suspects) {
        console.log(`${row.id}\t${row.userId}\t${row.reason}\t${row.publishUrl ?? ""}`)
      }
    }
  } finally {
    await prisma.$disconnect()
  }
}

void main()
