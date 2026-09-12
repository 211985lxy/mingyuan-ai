/**
 * 蝉镜账户状态（只读）：余额蝉豆与用量配额，不产生任何费用。
 * 用法：pnpm exec tsx scripts/chanjing-account-status.ts
 * 输出仅含标识与统计字段，不含密钥或令牌。
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const WEB_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)))
for (const line of readFileSync(resolve(WEB_ROOT, ".env.local"), "utf8").split("\n")) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
}

async function main(): Promise<void> {
  const { request } = await import("../src/lib/chanjing")

  const duration = await request<{ bean_day30: number; resi_total_bean: number }>(
    "GET",
    "/user_duration",
    { timeoutMs: 10_000 },
  )
  console.log(`剩余蝉豆：${duration.resi_total_bean}（其中 30 天内过期：${duration.bean_day30}）`)

  const info = await request<{
    id: string
    name: string
    custom_person_limit: number
    custom_person_nums: number
    video_create_limit: number
    video_create_seconds: number
  }>("GET", "/user_info", { timeoutMs: 10_000 })
  console.log(`应用：${info.name}（${info.id}）`)
  console.log(
    `定制数字人：${info.custom_person_nums}/${info.custom_person_limit}；`
    + `视频合成配额：已用 ${info.video_create_seconds}s / 上限 ${info.video_create_limit}s`,
  )
}

main().catch((error) => {
  const e = error as { code?: string; message?: string; requestId?: string }
  console.error(`[ABORT] code=${e.code ?? "?"} msg=${e.message ?? error} trace_id=${e.requestId ?? "-"}`)
  process.exit(1)
})
