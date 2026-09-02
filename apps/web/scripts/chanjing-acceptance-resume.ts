/**
 * 蝉镜验收续跑：不重新提交任何任务，只继续轮询既有视频任务并执行第 8 步验收。
 * 用法：pnpm exec tsx scripts/chanjing-acceptance-resume.ts <videoTaskId> <audioUrl> <audioDurationSeconds>
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const WEB_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)))
for (const line of readFileSync(resolve(WEB_ROOT, ".env.local"), "utf8").split("\n")) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
}

const [videoTaskId, audioUrl, audioDurationRaw] = process.argv.slice(2)
if (!videoTaskId || !audioUrl) {
  console.error("用法：chanjing-acceptance-resume.ts <videoTaskId> <audioUrl> [audioDurationSeconds]")
  process.exit(1)
}
const audioDuration = Number(audioDurationRaw ?? 0)
console.log(`[resume] 继续轮询视频任务 ${videoTaskId}（音频时长 ${audioDuration}s，不重新提交任何任务）`)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
function fail(message: string): never {
  console.error(`\n[ABORT] ${message}`)
  process.exit(1)
}

async function main(): Promise<void> {
const { getVideoTask } = await import("../src/lib/chanjing")

interface VideoState {
  queue_status?: string
  status?: number
  video_url?: string
  duration?: number
  msg?: string
  queue_desc?: string
  progress?: number
}

const deadline = Date.now() + 1_200_000
let interval = 5_000
let v: VideoState | undefined
let consecutiveNetworkErrors = 0

while (Date.now() < deadline) {
  await sleep(interval)
  interval = Math.min(15_000, Math.round(interval * 1.6))
  try {
    v = await getVideoTask(videoTaskId) as VideoState
    consecutiveNetworkErrors = 0
  } catch (error) {
    // 网络瞬断不放弃，连续 5 次才终止
    consecutiveNetworkErrors += 1
    console.log(`  [video] 网络错误（${consecutiveNetworkErrors}/5）：${(error as Error).message}`)
    if (consecutiveNetworkErrors >= 5) fail("连续 5 次网络错误，终止轮询")
    continue
  }
  const detail = `queue_status=${v.queue_status ?? "-"}(status=${v.status ?? "-"})`
    + (v.queue_desc ? ` queue_desc=${v.queue_desc}` : "")
    + (v.progress !== undefined ? ` progress=${v.progress}` : "")
  console.log(`  [video] ${detail}`)
  if (v.queue_status === "completed" && v.video_url) break
  if (v.queue_status === "failed") fail(`视频合成失败：msg="${v.msg ?? ""}"`)
  if (v.queue_status === "other") {
    fail(`queue_status=other msg="${v.msg ?? ""}" queue_desc="${v.queue_desc ?? ""}"`)
  }
}
if (!v || !(v.queue_status === "completed" && v.video_url)) fail("轮询超时（20min）")

const videoUrl = v.video_url!
const videoDuration = v.duration ?? 0
console.log(`\n[resume] 视频完成：duration=${videoDuration}s url=${videoUrl}`)

// ─── 第 8 步：三项验收 ───
async function checkUrl(label: string, url: string): Promise<boolean> {
  const res = await fetch(url, { headers: { Range: "bytes=0-1" } })
  const contentRange = res.headers.get("content-range")
  const totalBytes = contentRange ? Number(contentRange.split("/")[1]) : Number(res.headers.get("content-length") ?? 0)
  const ok = (res.status === 200 || res.status === 206) && totalBytes > 0
  console.log(`  [${label}] HTTP ${res.status}，总大小 ${totalBytes} 字节 → ${ok ? "通过" : "不通过"}`)
  return ok
}
const audioOk = await checkUrl("音频 URL", audioUrl)
const videoOk = await checkUrl("视频 URL", videoUrl)
const diff = Math.abs(videoDuration - audioDuration)
const durationOk = diff <= 2
console.log(
  `  [时长对比] 音频 ${audioDuration}s vs 视频 ${videoDuration}s，差值 ${diff.toFixed(2)}s → `
  + (durationOk ? "通过（≤2s）" : "不通过（>2s）"),
)
const passed = audioOk && videoOk && durationOk
console.log(`\n[resume] 验收结论：${passed ? "全部通过 ✅" : "未通过 ❌"}`)
console.log("  ⚠️ 音频/视频 URL 均为供应商临时存储，请尽快转存。")
process.exit(passed ? 0 : 1)
}

main().catch((error) => {
  console.error(`[ABORT] 未预期的错误：${error instanceof Error ? error.message : error}`)
  process.exit(1)
})
