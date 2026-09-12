/**
 * 自有语音（Fish Audio）→ 蝉镜数字人 真实验收 + 产物转存。
 *
 * 用法（apps/web 目录下）：
 *   pnpm exec tsx --tsconfig tsconfig.json scripts/chanjing-own-voice-acceptance.ts
 *   # 附带转存既有供应商临时产物（可选，可重复）：
 *   pnpm exec tsx --tsconfig tsconfig.json scripts/chanjing-own-voice-acceptance.ts \
 *     --transfer=https://res.chanjing.cc/.../a.wav --transfer=https://res.chanjing.cc/.../b.mp4
 *
 * 走产品真实链路：synthesizeOwnVoiceToOss（Fish 合成 → 受管 OSS → 6h 签名）
 * → createOwnVoiceDigitalHumanVideo（重签名 → 蝉镜 audio 型下单）。
 * 凭证与密钥只从 apps/web/.env.local 读取，全程不回显值。
 */
import { readFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const WEB_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)))

for (const line of readFileSync(resolve(WEB_ROOT, ".env.local"), "utf8").split("\n")) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(?:"([^"]*)"|(.*?))\s*$/)
  if (!match || process.env[match[1]]) continue
  process.env[match[1]] = match[2] ?? match[3] ?? ""
}

const TTS_TEXT = "这是一条自有语音驱动数字人的验收样音。"
const VIDEO_FIRST_MS = 5_000
const VIDEO_MAX_MS = 15_000
const VIDEO_TIMEOUT_MS = 1_200_000
const STAMP = new Date().toISOString().slice(0, 10)

const transferArgs = process.argv
  .filter((a) => a.startsWith("--transfer="))
  .map((a) => a.slice("--transfer=".length))

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
function fail(message: string): never {
  console.error(`\n[ABORT] ${message}`)
  process.exit(1)
}

/** 用 ffprobe 读取真实时长（秒）；失败返回 null，不阻塞验收。 */
function probeSeconds(url: string): number | null {
  try {
    const out = execFileSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", url],
      { encoding: "utf8", timeout: 120_000 },
    )
    const value = Number.parseFloat(out.trim())
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

async function main(): Promise<void> {
  const { env } = await import("../src/env")
  if (!env.CHANJING_APP_ID || !env.CHANJING_SECRET_KEY) {
    fail("缺少 CHANJING_APP_ID 或 CHANJING_SECRET_KEY，请先配置 apps/web/.env.local")
  }
  const {
    synthesizeOwnVoiceToOss,
    createOwnVoiceDigitalHumanVideo,
    CHANJING_GRAB_URL_TTL_SECONDS,
  } = await import("../src/lib/digital-human-voice-bridge")
  const { listCommonDigitalPersons } = await import("../src/lib/chanjing-audio")
  const { getVideoTask: getVideoTaskDetail } = await import("../src/lib/chanjing")
  const { transferFromUrl, isOssConfigured } = await import("../src/lib/oss")

  console.log("== 前置 ==")
  console.log(`  OSS 已配置: ${isOssConfigured()}；签名 TTL: ${CHANJING_GRAB_URL_TTL_SECONDS}s`)

  // ─── 可选：转存既有供应商临时产物 ───
  if (transferArgs.length > 0) {
    console.log("\n== 转存既有产物 ==")
    if (!isOssConfigured()) fail("OSS 未配置，无法转存")
    for (const [i, url] of transferArgs.entries()) {
      const ext = url.split("?")[0].split(".").pop() || "bin"
      const key = `acceptance/chanjing/${STAMP}/existing-${i + 1}.${ext}`
      const saved = await transferFromUrl(url, key)
      console.log(`  [${i + 1}] 已转存 → ${saved}`)
    }
  }

  console.log("\n== 步骤 1：Fish Audio 真实合成 → 受管 OSS → 签名 ==")
  const synthesis = await synthesizeOwnVoiceToOss({
    userId: "acceptance-own-voice",
    text: TTS_TEXT,
    format: "mp3",
  })
  console.log(
    `  合成 ${synthesis.bytes} 字节 / ${synthesis.charCount} 字 / 档位 ${synthesis.model}`
    + ` / 签名 TTL ${CHANJING_GRAB_URL_TTL_SECONDS}s`,
  )

  const audioDuration = probeSeconds(synthesis.signedUrl)
  if (audioDuration === null) fail("无法探知合成音频时长，验收第 8 步无法完成")
  console.log(`  ffprobe 音频时长 = ${audioDuration.toFixed(2)}s`)

  console.log("\n== 步骤 2：模拟蝉镜抓取自有音频（关键）==")
  const grabbed = await fetch(synthesis.signedUrl)
  const grabbedBytes = (await grabbed.arrayBuffer()).byteLength
  console.log(`  HTTP ${grabbed.status} / ${grabbedBytes} 字节`)
  if (!grabbed.ok || grabbedBytes !== synthesis.bytes) {
    fail(`自有音频 URL 不可被第三方抓取（HTTP ${grabbed.status}，${grabbedBytes} 字节）`)
  }

  console.log("\n== 步骤 3：list_common_dp（page=1 size=20）==")
  const dpList = await listCommonDigitalPersons(1, 20)
  const dpKeywords = ["新闻", "播报", "商务", "职场", "女主播", "男主播", "知识"]
  const chosenDp =
    dpList.find((d) => dpKeywords.some((k) => d.name.includes(k)) && d.figures?.length)
    ?? dpList.find((d) => d.figures?.some((f) => f.type && (f.width ?? 0) > 0 && (f.height ?? 0) > 0))
    ?? fail("list_common_dp 未返回可选数字人")
  const figure = chosenDp.figures.find((f) => f.type && (f.width ?? 0) > 0 && (f.height ?? 0) > 0)!
  console.log(
    `  候选 ${dpList.length} 个，选用 name="${chosenDp.name}" figure ${figure.type} ${figure.width}x${figure.height}`,
  )

  console.log("\n== 步骤 4：create_video（audio 型，wav_url = 本次自有语音）==")
  const submitted = await createOwnVoiceDigitalHumanVideo({
    audioUrl: synthesis.ossUrl,
    personId: chosenDp.id,
    figureType: figure.type!,
    personWidth: figure.width!,
    personHeight: figure.height!,
  })
  const videoTaskId = submitted.taskId
  console.log(`  视频任务 id=${videoTaskId}`)

  console.log("\n== 步骤 5：video 轮询（首次 5s / 上限 15s / 超时 20min）==")
  interface VideoState {
    queue_status?: string
    status?: number
    video_url?: string
    duration?: number
    msg?: string
    queue_desc?: string
    progress?: number
  }
  let videoUrl = ""
  let videoDuration = 0
  const deadline = Date.now() + VIDEO_TIMEOUT_MS
  let interval = VIDEO_FIRST_MS
  let attempt = 0
  while (Date.now() < deadline) {
    await sleep(interval)
    interval = Math.min(VIDEO_MAX_MS, Math.round(interval * 1.6))
    attempt += 1
    const v = (await getVideoTaskDetail(videoTaskId)) as VideoState
    console.log(
      `    [video #${attempt}] queue_status=${v.queue_status ?? "-"} progress=${v.progress ?? "-"}`
      + (v.queue_desc ? ` queue_desc=${v.queue_desc}` : ""),
    )
    if (v.queue_status === "completed" && v.video_url) {
      videoUrl = v.video_url
      videoDuration = v.duration ?? 0
      break
    }
    if (v.queue_status === "failed") fail(`视频合成失败：msg="${v.msg ?? ""}"`)
    if (v.queue_status === "other") {
      fail(`视频状态异常：queue_status=other msg="${v.msg ?? ""}" queue_desc="${v.queue_desc ?? ""}"`)
    }
  }
  if (!videoUrl) fail("视频轮询超时，取不到 video_url")

  console.log("\n== 步骤 6：三项验收 ==")
  const videoRes = await fetch(videoUrl, { headers: { Range: "bytes=0-1" } })
  const contentRange = videoRes.headers.get("content-range")
  const videoBytes = contentRange
    ? Number(contentRange.split("/")[1])
    : Number(videoRes.headers.get("content-length") ?? 0)
  console.log(`  [视频 URL] HTTP ${videoRes.status}，${videoBytes} 字节`)
  if (!(videoRes.status === 200 || videoRes.status === 206) || videoBytes <= 0) {
    fail("视频 URL 不可访问或为 0 字节")
  }

  const probedVideo = probeSeconds(videoUrl)
  const effectiveVideoDuration = probedVideo ?? videoDuration
  const diff = Math.abs(effectiveVideoDuration - audioDuration)
  console.log(
    `  [时长对比] 自有音频 ${audioDuration.toFixed(2)}s vs 视频 ${effectiveVideoDuration.toFixed(2)}s`
    + `（接口 duration=${videoDuration}s），差值 ${diff.toFixed(2)}s`,
  )
  if (diff > 2) fail(`时长差 ${diff.toFixed(2)}s 超过 2s，视频可能未使用本次自有音频`)

  console.log("\n== 步骤 7：转存成品到 AIM OSS ==")
  let savedVideo = videoUrl
  if (isOssConfigured()) {
    savedVideo = await transferFromUrl(videoUrl, `acceptance/chanjing/${STAMP}/own-voice-${videoTaskId}.mp4`)
    console.log(`  已转存 → ${savedVideo}`)
  } else {
    console.log("  ⚠ OSS 未配置，未转存；供应商 URL 会过期")
  }

  console.log("\n== 汇总 ==")
  console.log(`  自有音频（OSS 受管）：${synthesis.ossUrl}`)
  console.log(`  视频任务：${videoTaskId}`)
  console.log(`  供应商视频 URL：${videoUrl}`)
  console.log(`  转存后视频 URL：${savedVideo}`)
  console.log(`  音视频时长差：${diff.toFixed(2)}s（≤2s）`)
  console.log("\n✅ 自有语音驱动数字人真实链路通过。")
  process.exit(0)
}

main().catch((error) => {
  console.error(`\n[ABORT] 未预期错误：${error instanceof Error ? error.message : error}`)
  process.exit(1)
})
