/**
 * 一次性回填：扫描已发布记录，列出解不出抖音 aweme_id 的清单。
 * 默认 dry-run（零出站、零写库）。能从链接直接解析的只打印，不改库。
 *
 * F18 动作 D1（存量清洗，零出站）：对 status==="short" 的记录先做「只读复核」——
 * 仅解析 DNS 判定是否公网（resolvePublicTarget），**绝不 fetch**；复核不通过的记为
 * 疑似投毒并跳过后续探测，避免审计动作本身打到内网/云元数据。
 *
 * F18 动作 D2（告警，--apply）：疑似投毒行按 id 指纹写 OperationalAlert（critical），
 * 交给控制中心/飞书通知通道——这是"历史是否被打过"的免费体检结果，必须出告警而非静默。
 *
 * F18 动作 D3（隔离，--apply）：复核不通过的行执行 published → archived（状态机里
 * published 的唯一合法终态转换），并追加 reviewNote 留痕；publishUrl 原样保留作为取证。
 * archived 不在任何 cron/回流 store 的消费范围（均过滤 workflowStatus==="published"），
 * 隔离即切断 F18-B 存量重放面。幂等可重跑：updateMany 条件带 workflowStatus==="published"，
 * 已隔离行天然跳过。
 *
 * 用法：npm run outcome:backfill-aweme-ids [-- --apply]
 */
import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient } from "../src/generated/prisma/client"
import { classifyPublishedWorkKey } from "../src/lib/aim/platform-post-id"
import { upsertOperationalAlert } from "../src/lib/operational-alerts"
import { resolveDouyinAwemeId } from "../src/lib/douyin-short-url-resolver"
import { resolvePublicTarget, SsrfBlockedError } from "../src/lib/ssrf-guard.server"

const QUARANTINE_NOTE_PREFIX = "[SSRF 存量隔离]"

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

/**
 * 生成隔离留痕（纯函数，便于单测）：保留原备注，追加隔离标记与原因。
 */
export function buildQuarantineReviewNote(existing: string | null, reason: string, at = new Date()): string {
  const stamp = at.toISOString()
  const marker = `${QUARANTINE_NOTE_PREFIX} ${stamp} ${reason}`
  return existing?.trim() ? `${existing}\n${marker}` : marker
}

interface SuspectRow {
  id: string
  userId: string
  publishUrl: string | null
  reviewNote: string | null
  reason: string
}

async function quarantineSuspects(prisma: PrismaClient, suspects: SuspectRow[]): Promise<{ quarantined: number; failed: number }> {
  let quarantined = 0
  let failed = 0
  for (const row of suspects) {
    try {
      // 条件带 workflowStatus==="published"：幂等（已隔离行不再命中）且并发安全。
      const result = await prisma.aimGeneration.updateMany({
        where: { id: row.id, workflowStatus: "published" },
        data: { workflowStatus: "archived", reviewNote: buildQuarantineReviewNote(row.reviewNote, row.reason) },
      })
      if (result.count > 0) {
        quarantined += 1
        // D2：按 id 指纹告警（upsert 幂等，重跑不会刷屏）。publishUrl 不进 summary，
        // 避免把疑似恶意 URL 原文扩散到通知通道；取证靠库内 reviewNote + publishUrl 原值。
        await upsertOperationalAlert({
          fingerprint: `ssrf-legacy-url:${row.id}`,
          rule: "ssrf_legacy_short_url",
          severity: "critical",
          summary: `存量 SSRF 复核命中并已隔离：AimGeneration ${row.id}（用户 ${row.userId}）的已发布短链解析到非公网/非法地址（${row.reason}），已置为 archived 并留痕。此信号意味着该 URL 可能在历史上被 cron 重复拉取过，建议按 reviewNote 取证。`,
          source: "backfill-published-aweme-ids",
        }).catch((error) => {
          console.error(JSON.stringify({ event: "ssrf_alert_write_failed", id: row.id, error: String(error) }))
        })
      } else {
        // 已隔离过或状态被并发修改：幂等跳过。
      }
    } catch (error) {
      failed += 1
      console.error(JSON.stringify({ event: "ssrf_quarantine_failed", id: row.id, error: String(error) }))
    }
  }
  return { quarantined, failed }
}

async function main() {
  const apply = process.argv.includes("--apply")
  const prisma = createPrismaClient()
  const needsBackfill: Array<{ id: string; userId: string; publishPlatform: string | null; publishUrl: string | null }> = []
  const suspects: SuspectRow[] = []
  const parseable = { count: 0 }

  try {
    const rows = await prisma.aimGeneration.findMany({
      where: { workflowStatus: "published" },
      select: { id: true, userId: true, publishPlatform: true, publishUrl: true, reviewNote: true },
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
            reviewNote: row.reviewNote,
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
      console.log(`--- SSRF 疑似存量（${apply ? "将" : "dry-run，加 --apply 后将"}置为 archived + critical 告警）---`)
      for (const row of suspects) {
        console.log(`${row.id}\t${row.userId}\t${row.reason}\t${row.publishUrl ?? ""}`)
      }
    }

    if (suspects.length > 0 && !apply) {
      // dry-run 命中疑似投毒本身就是要被看见的信号：非零退出码让 cron/CI 把它顶出来。
      console.error(`dry-run 发现 ${suspects.length} 条疑似 SSRF 存量，未做任何写操作；确认后加 --apply 执行隔离+告警。`)
      process.exitCode = 1
      return
    }

    if (apply && suspects.length > 0) {
      const { quarantined, failed } = await quarantineSuspects(prisma, suspects)
      console.log(`隔离完成：${quarantined} 条置为 archived；失败：${failed} 条（失败行保持 published，可重跑）`)
      if (failed > 0) process.exitCode = 1
    }
  } finally {
    await prisma.$disconnect()
  }
}

// 仅在作为 CLI 直接执行时运行（vitest 等场景 import 本文件只取纯函数，不触发 main）。
if (process.argv[1]?.includes("backfill-published-aweme-ids")) void main()
