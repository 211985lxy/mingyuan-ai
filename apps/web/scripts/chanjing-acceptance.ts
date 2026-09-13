/**
 * 蝉镜开放平台真实链路验收：独立 TTS → 数字人视频。
 *
 * 用法（apps/web 目录下）：
 *   pnpm exec tsx scripts/chanjing-acceptance.ts
 *
 * 凭证从 apps/web/.env.local（gitignored）读取：
 *   CHANJING_APP_ID / CHANJING_SECRET_KEY
 * 本脚本不输出 secret_key 与 access_token；业务成功以 code === 0 判定，
 * 轮询规则：TTS 首次 3s、上限 10s、总超时 5min；视频首次 5s、上限 15s、总超时 20min。
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

// ─── 先加载 .env.local，再动态引入客户端（客户端在模块加载期读 env）───
const WEB_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)))
for (const line of readFileSync(resolve(WEB_ROOT, ".env.local"), "utf8").split("\n")) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (!match || process.env[match[1]]) continue
  // 去掉 .env 包裹引号：否则 NODE_ENV="development" 会被 env 校验判为非法
  process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2")
}

// ─── fetch 拦截：仅记录路径 / code / trace_id / 耗时，绝不记录凭证 ───
interface CallRecord {
  path: string
  code?: number
  traceId?: string
  ms: number
  tokenExpiresIn?: number
}
const calls: CallRecord[] = []
const realFetch = globalThis.fetch.bind(globalThis)
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const started = Date.now()
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  const path = url.replace(/^https?:\/\/[^/]+/, "")
  const res = await realFetch(input as never, init as never)
  const record: CallRecord = { path, ms: Date.now() - started }
  calls.push(record)
  try {
    const body = (await res.clone().json()) as { code?: number; trace_id?: string; data?: unknown }
    record.code = body.code
    record.traceId = body.trace_id
    const data = body.data as { expire_in?: number } | undefined
    if (path.endsWith("/access_token") && data && typeof data.expire_in === "number") {
      record.tokenExpiresIn = data.expire_in
    }
  } catch {
    // 非 JSON 响应（如转存探测）不记录
  }
  return res
}
const lastCall = (pathSuffix: string): CallRecord | undefined =>
  [...calls].reverse().find((c) => c.path.includes(pathSuffix))

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function fail(message: string): never {
  console.error(`\n[ABORT] ${message}`)
  process.exit(1)
}

function reportCall(step: string, pathSuffix: string): void {
  const call = lastCall(pathSuffix)
  if (!call) return
  console.log(
    `  ${step} ${call.path} → code=${call.code} trace_id=${call.traceId ?? "-"} 耗时 ${call.ms}ms`
    + (call.tokenExpiresIn !== undefined ? ` token_expire_in=${call.tokenExpiresIn}s` : ""),
  )
}

async function poll<T>(
  label: string,
  firstIntervalMs: number,
  maxIntervalMs: number,
  totalTimeoutMs: number,
  fn: () => Promise<{ done: boolean; detail?: string }>,
): Promise<void> {
  const deadline = Date.now() + totalTimeoutMs
  let interval = firstIntervalMs
  let attempt = 0
  while (Date.now() < deadline) {
    await sleep(interval)
    interval = Math.min(maxIntervalMs, Math.round(interval * 1.6))
    attempt += 1
    const r = await fn()
    if (r.detail) process.stdout.write(`    [${label} #${attempt}] ${r.detail}\n`)
    if (r.done) return
    if (Date.now() >= deadline) break
  }
  fail(`${label} 轮询超时（${totalTimeoutMs / 1000}s），最后状态见上方最后一条记录`)
}

// ─── 动态引入真实客户端 ───────────────────────────────────
async function main(): Promise<void> {
const { env } = await import("../src/env")
if (!env.CHANJING_APP_ID || !env.CHANJING_SECRET_KEY) {
  console.error("缺少 CHANJING_APP_ID 或 CHANJING_SECRET_KEY（.env.local）。请配置后重跑。")
  process.exit(1)
}
console.log("[env] CHANJING_APP_ID / CHANJING_SECRET_KEY 已配置（值不回显）")
const {
  listCommonAudio,
  listCommonDigitalPersons,
  createAudioTask,
  getAudioTaskState,
  createDigitalHumanVideoFromAudio,
} = await import("../src/lib/chanjing-audio")
const { getVideoTask } = await import("../src/lib/chanjing")

function handleApiError(step: string, pathSuffix: string, error: unknown): never {
  const call = lastCall(pathSuffix)
  const e = error as { code?: string; message?: string; requestId?: string }
  console.error(
    `[ABORT] ${step} 失败：code=${e.code ?? "?"} msg=${e.message ?? error} `
    + `trace_id=${e.requestId ?? call?.traceId ?? "-"} path=${call?.path ?? pathSuffix}`,
  )
  process.exit(1)
}

// ═══ 验收开始 ═══════════════════════════════════════════
console.log("\n== 步骤 1：access_token（随首个请求触发，客户端缓存并提前 60s 刷新）==")
const t0 = Date.now()

console.log("\n== 步骤 2：list_common_audio（page=1 size=20）==")
let audioList: Awaited<ReturnType<typeof listCommonAudio>>
try {
  audioList = await listCommonAudio(1, 20)
} catch (e) { handleApiError("list_common_audio", "/list_common_audio", e) }
reportCall("GET", "/list_common_audio")
const audioKeywords = ["知性", "端庄", "阳光", "新闻", "播报", "女声", "男声", "甜美", "磁性"]
const chosenAudio
  = audioList.find((a) => audioKeywords.some((k) => a.name.includes(k)))
    ?? audioList.find((a) => a.name.trim().length >= 2 && !/^(测试|音频|test)/i.test(a.name))
    ?? fail("list_common_audio 未返回可选音色")
console.log(
  `  候选 ${audioList.length} 个，选用音色 name="${chosenAudio.name}" id=${chosenAudio.id}`,
)

console.log("\n== 步骤 3：create_audio_task ==")
const ttsText = "这是一条蝉镜开放平台接入验收语音。"
let ttsTaskId: string
try {
  ttsTaskId = await createAudioTask({ audioManId: chosenAudio.id, speed: 1, text: ttsText })
} catch (e) { handleApiError("create_audio_task", "/create_audio_task", e) }
reportCall("POST", "/create_audio_task")
console.log(`  task_id=${ttsTaskId}`)

console.log("\n== 步骤 4：audio_task_state 轮询（首次 3s，上限 10s，超时 5min）==")
let lastTtsState: Awaited<ReturnType<typeof getAudioTaskState>> | undefined
let audioUrl = ""
let audioDuration = 0
await poll("tts", 3_000, 10_000, 300_000, async () => {
  lastTtsState = await getAudioTaskState(ttsTaskId).catch((e) => handleApiError("audio_task_state", "/audio_task_state", e))
  const s = lastTtsState!
  if (s.errMsg || s.errReason) {
    fail(`TTS 失败：errMsg="${s.errMsg ?? ""}" errReason="${s.errReason ?? ""}"（原文）trace_id=${lastCall("/audio_task_state")?.traceId ?? "-"}`)
  }
  if (s.status === 9 && s.full?.url) {
    audioUrl = s.full.url
    audioDuration = s.full.duration ?? 0
    return { done: true, detail: `status=9 完成，full.duration=${audioDuration}s url=${audioUrl}` }
  }
  return { done: false, detail: `status=${s.status}（规范未枚举，继续轮询）` }
})

console.log("\n== 步骤 5：list_common_dp（page=1 size=20）==")
let dpList: Awaited<ReturnType<typeof listCommonDigitalPersons>>
try {
  dpList = await listCommonDigitalPersons(1, 20)
} catch (e) { handleApiError("list_common_dp", "/list_common_dp", e) }
reportCall("GET", "/list_common_dp")
const dpKeywords = ["新闻", "播报", "商务", "职场", "女主播", "男主播", "知识"]
const chosenDp
  = dpList.find((d) => dpKeywords.some((k) => d.name.includes(k)) && d.figures?.length)
    ?? dpList.find((d) => d.figures?.some((f) => f.type && (f.width ?? 0) > 0 && (f.height ?? 0) > 0))
    ?? fail("list_common_dp 未返回可选数字人")
const figure = chosenDp.figures.find((f) => f.type && (f.width ?? 0) > 0 && (f.height ?? 0) > 0)!
console.log(
  `  候选 ${dpList.length} 个，选用数字人 name="${chosenDp.name}" id=${chosenDp.id} `
  + `figure type=${figure.type} ${figure.width}x${figure.height}`,
)

console.log("\n== 步骤 6：create_video（audio 型，wav_url 用本次 TTS 结果）==")
let videoTaskId: string
try {
  const r = await createDigitalHumanVideoFromAudio({
    personId: chosenDp.id,
    figureType: figure.type!,
    personWidth: figure.width!,
    personHeight: figure.height!,
    wavUrl: audioUrl,
    volume: 100,
    screenWidth: figure.width!,
    screenHeight: figure.height!,
  })
  videoTaskId = r.taskId
} catch (e) { handleApiError("create_video", "/create_video", e) }
reportCall("POST", "/create_video")
console.log(`  视频任务 id=${videoTaskId}`)

console.log("\n== 步骤 7：video 轮询（首次 5s，上限 15s，超时 20min）==")
interface VideoState {
  queue_status?: string
  status?: number
  video_url?: string
  duration?: number
  msg?: string
  queue_desc?: string
  progress?: number
}
let lastVideo: VideoState | undefined
let videoUrl = ""
let videoDuration = 0
await poll("video", 5_000, 15_000, 1_200_000, async () => {
  const v = await getVideoTask(videoTaskId)
    .catch((e) => handleApiError("video", "/video", e)) as VideoState
  lastVideo = v
  const detail = `queue_status=${v.queue_status ?? "-"}(status=${v.status ?? "-"})`
    + (v.queue_desc ? ` queue_desc=${v.queue_desc}` : "")
    + (v.progress !== undefined ? ` progress=${v.progress}` : "")
  if (v.queue_status === "completed" && v.video_url) {
    videoUrl = v.video_url
    videoDuration = v.duration ?? 0
    return { done: true, detail: `${detail} → video_url 就绪 duration=${videoDuration}s` }
  }
  if (v.queue_status === "failed") {
    fail(`视频合成失败：msg="${v.msg ?? ""}" trace_id=${lastCall("/video")?.traceId ?? "-"}`)
  }
  if (v.queue_status === "other") {
    fail(`视频状态异常（非中间态，立即停止）：queue_status=other msg="${v.msg ?? ""}" queue_desc="${v.queue_desc ?? ""}" trace_id=${lastCall("/video")?.traceId ?? "-"}`)
  }
  return { done: false, detail }
})

console.log("\n== 步骤 8：三项验收 ==")
async function checkUrl(label: string, url: string): Promise<{ ok: boolean; bytes: number; status: number }> {
  const res = await realFetch(url, { headers: { Range: "bytes=0-1" } })
  const contentRange = res.headers.get("content-range")
  const totalBytes = contentRange ? Number(contentRange.split("/")[1]) : Number(res.headers.get("content-length") ?? 0)
  const ok = (res.status === 200 || res.status === 206) && totalBytes > 0
  console.log(
    `  [${label}] HTTP ${res.status}，总大小 ${totalBytes} 字节 → ${ok ? "通过" : "不通过"}`,
  )
  return { ok, bytes: totalBytes, status: res.status }
}

const audioCheck = await checkUrl("音频 URL", audioUrl)
const videoCheck = await checkUrl("视频 URL", videoUrl)
const durationDiff = Math.abs(videoDuration - audioDuration)
const durationOk = durationDiff <= 2
console.log(
  `  [时长对比] 音频 full.duration=${audioDuration}s，视频 duration=${videoDuration}s，`
  + `差值 ${durationDiff.toFixed(2)}s → ${durationOk ? "通过（≤2s）" : "不通过（>2s，疑似未使用本次 TTS 音轨）"}`,
)

const passed = audioCheck.ok && videoCheck.ok && durationOk
const totalMs = Date.now() - t0

console.log("\n== 结果汇总 ==")
for (const [i, c] of calls.entries()) {
  console.log(
    `  #${i + 1} ${c.path} code=${c.code ?? "-"} trace_id=${c.traceId ?? "-"} ${c.ms}ms`,
  )
}
console.log(`  总耗时 ${(totalMs / 1000).toFixed(1)}s；验收结论：${passed ? "全部通过 ✅" : "未通过 ❌"}`)
console.log(`  音频 URL：${audioUrl}`)
console.log(`  视频 URL：${videoUrl}`)
console.log("  ⚠️ 上述 URL 为供应商临时存储，非永久地址，请尽快转存（如 AIM OSS）。")
process.exit(passed ? 0 : 1)
}

main().catch((error) => {
  console.error(`[ABORT] 未预期的错误：${error instanceof Error ? error.message : error}`)
  process.exit(1)
})
