/**
 * 按蝉镜视频任务 ID 取回成品并转存到 AIM OSS。
 *
 * 用途：灰度矩阵等脚本执行只记录任务 ID（供应商 URL 会过期），
 * 人工评分前需要把成品落到自有存储。
 *
 * 用法（apps/web 下）：
 *   pnpm exec tsx --tsconfig tsconfig.json scripts/chanjing-transfer-video-tasks.ts <任务ID...>
 * 可选：--prefix=acceptance/chanjing/gray-matrix/2026-09-12
 *
 * 凭证与密钥只从 apps/web/.env.local 读取，不回显值。
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const WEB_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)))
for (const line of readFileSync(resolve(WEB_ROOT, ".env.local"), "utf8").split("\n")) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(?:"([^"]*)"|(.*?))\s*$/)
  if (!match || process.env[match[1]]) continue
  process.env[match[1]] = match[2] ?? match[3] ?? ""
}

const argv = process.argv.slice(2)
const prefixArg = argv.find((a) => a.startsWith("--prefix="))
const taskIds = argv.filter((a) => !a.startsWith("--"))
const PREFIX = prefixArg
  ? prefixArg.slice("--prefix=".length).replace(/\/$/, "")
  : `acceptance/chanjing/${new Date().toISOString().slice(0, 10)}`

async function main(): Promise<void> {
  const { env } = await import("../src/env")
  if (!env.CHANJING_APP_ID || !env.CHANJING_SECRET_KEY) {
    console.error("[ABORT] 缺少 CHANJING_APP_ID 或 CHANJING_SECRET_KEY")
    process.exit(1)
  }
  if (taskIds.length === 0) {
    console.error("用法：pnpm exec tsx --tsconfig tsconfig.json scripts/chanjing-transfer-video-tasks.ts <任务ID...>")
    process.exit(1)
  }
  const { getVideoTask } = await import("../src/lib/chanjing")
  const { transferFromUrl, isOssConfigured } = await import("../src/lib/oss")
  if (!isOssConfigured()) {
    console.error("[ABORT] OSS 未配置，无法转存")
    process.exit(1)
  }

  let failed = 0
  for (const id of taskIds) {
    const video = await getVideoTask(id).catch((error) => {
      console.error(`  ✗ ${id} 查询失败：${error instanceof Error ? error.message : error}`)
      return null
    })
    if (!video) { failed += 1; continue }
    if (video.queue_status !== "completed" || !video.video_url) {
      console.error(`  ✗ ${id} 尚未完成或 URL 缺失（queue_status=${video.queue_status ?? "-"} msg=${video.msg ?? "-"}）`)
      failed += 1
      continue
    }
    const saved = await transferFromUrl(video.video_url, `${PREFIX}/video-${id}.mp4`)
    console.log(`  ✓ ${id} duration=${video.duration ?? "-"}s → ${saved}`)
  }

  if (failed > 0) {
    console.error(`\n[ABORT] ${failed}/${taskIds.length} 个任务未转存`)
    process.exit(1)
  }
  console.log(`\n全部转存完成（前缀 ${PREFIX}）。`)
}

main().catch((error) => {
  console.error(`\n[ABORT] 未预期错误：${error instanceof Error ? error.message : error}`)
  process.exit(1)
})
