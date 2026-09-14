/**
 * HeyGen 真实链路验收：账号 → 形象/声音 → 出片（脚本驱动）→ 轮询 → 成品核验。
 *
 * 用法（apps/web 目录下）：
 *   pnpm exec tsx --tsconfig tsconfig.json scripts/heygen-acceptance.ts
 *
 * 前置：apps/web/.env.local 配置 HEYGEN_API_KEY（不要把 key 贴进任何对话）。
 * 本脚本不输出密钥；业务成功以 HTTP 2xx 且无 error 字段为准；
 * 轮询节奏：首次 5s、上限 15s、总超时 20min（与蝉镜口径一致）。
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

// ─── fetch 拦截：只记路径 / 状态 / 耗时，绝不记录密钥 ───
interface CallRecord {
  method: string
  path: string
  status?: number
  ms: number
}
const calls: CallRecord[] = []
const realFetch = globalThis.fetch.bind(globalThis)
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const started = Date.now()
  const res = await realFetch(input as never, init)
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  calls.push({
    method: init?.method ?? "GET",
    path: url.replace(/^https?:\/\/[^/]+/, "").split("?")[0],
    status: res.status,
    ms: Date.now() - started,
  })
  return res
}

const SCRIPT_TEXT = process.argv[2] ?? "这是一条 HeyGen 开放平台接入验收语音。"
const FIRST_MS = 5_000
const MAX_MS = 15_000
const TIMEOUT_MS = 1_200_000
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function fail(message: string): never {
  console.error(`\n[ABORT] ${message}`)
  process.exit(1)
}

/** 用 ffprobe 读真实时长（秒），失败返回 null 不阻塞。 */
function probeSeconds(url: string): number | null {
  try {
    const out = execFileSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", url],
      { encoding: "utf8", timeout: 120_000 },
    )
    const v = Number.parseFloat(out.trim())
    return Number.isFinite(v) ? v : null
  } catch {
    return null
  }
}

async function main(): Promise<void> {
  const { env } = await import("../src/env")
  if (!env.HEYGEN_API_KEY) {
    fail("缺少 HEYGEN_API_KEY。请写入 apps/web/.env.local 后重跑（不要把 key 贴进对话）。")
  }
  console.log("[env] HEYGEN_API_KEY 已配置（值不回显）")

  const {
    getUserMe,
    listAvatars,
    listVoices,
    createVideo,
    getVideo,
  } = await import("../src/lib/heygen")
  const t0 = Date.now()

  // ─── 步骤 1：账号与配额 ───
  console.log("\n== 步骤 1：GET /v3/users/me ==")
  const me = await getUserMe().catch((e) => fail(`账号读取失败：${e instanceof Error ? e.message : e}`))
  console.log(`  username=${me.username} email=${me.email ?? "-"}（鉴权通过）`)

  // ─── 步骤 2：选形象（授权守卫 + 有意挑选，不盲取首个）───
  console.log("\n== 步骤 2：GET /v3/avatars ==")
  const avatars = await listAvatars({ limit: 50 }).catch((e) => fail(`形象列表失败：${e instanceof Error ? e.message : e}`))
  console.log(`  共 ${avatars.length} 个形象`)
  const usable = avatars.filter((a) => {
    const raw = (a.consent_status ?? "").trim().toLowerCase()
    return !raw || raw === "approved"
  })
  const blocked = avatars.length - usable.length
  if (blocked > 0) console.log(`  已剔除未授权形象 ${blocked} 个（consent_status 非 approved 且非空）`)
  if (usable.length === 0) fail("没有可用形象（全部未授权或列表为空）。请先在 HeyGen 侧完成形象授权。")

  const preferred = ["biz", "business", "professional", "news", "female", "male"]
  const chosen =
    usable.find((a) => preferred.some((k) => a.name.toLowerCase().includes(k))) ??
    usable.find((a) => a.name.trim().length >= 2) ??
    fail("未找到可命名形象")
  console.log(`  选用形象 name="${chosen.name}" id=${chosen.id} consent=${chosen.consent_status ?? "不需要"}`)

  // ─── 步骤 3：选声音（优先中文，与验收文案匹配）───
  console.log("\n== 步骤 3：GET /v3/voices ==")
  const voices = await listVoices({ limit: 50 }).catch((e) => fail(`声音列表失败：${e instanceof Error ? e.message : e}`))
  console.log(`  共 ${voices.length} 个声音`)
  const zhVoice =
    voices.find((v) => /zh|cmn|chinese/i.test(v.language)) ??
    voices.find((v) => v.voice_id === chosen.default_voice_id) ??
    voices[0] ??
    fail("声音列表为空")
  console.log(`  选用声音 name="${zhVoice.name}" id=${zhVoice.voice_id} language=${zhVoice.language}`)

  // ─── 步骤 4：出片（脚本驱动）───
  console.log("\n== 步骤 4：POST /v3/videos ==")
  const submitted = await createVideo({
    type: "avatar",
    avatar_id: chosen.id,
    script: SCRIPT_TEXT,
    voice_id: zhVoice.voice_id,
    aspect_ratio: "9:16",
    resolution: "720p",
    title: "AIM 接入验收",
  }).catch((e) => fail(`出片提交失败：${e instanceof Error ? e.message : e}`))
  const videoId = submitted.taskId
  console.log(`  视频任务 id=${videoId}`)

  // ─── 步骤 5：轮询 ───
  console.log("\n== 步骤 5：GET /v3/videos/{id} 轮询（首次 5s / 上限 15s / 超时 20min）==")
  const deadline = Date.now() + TIMEOUT_MS
  let interval = FIRST_MS
  let videoUrl = ""
  let apiDuration = 0
  let attempt = 0
  while (Date.now() < deadline) {
    await sleep(interval)
    interval = Math.min(MAX_MS, Math.round(interval * 1.6))
    attempt += 1
    const v = await getVideo(videoId).catch((e) => fail(`状态查询失败：${e instanceof Error ? e.message : e}`))
    console.log(`    [#${attempt}] status=${v.status}${v.failure_message ? ` failure_message=${v.failure_message}` : ""}`)
    if (v.status === "completed" && v.video_url) {
      videoUrl = v.video_url
      apiDuration = v.duration ?? 0
      break
    }
    if (v.status === "failed") fail(`出片失败：failure_code=${v.failure_code ?? "-"} failure_message="${v.failure_message ?? ""}"`)
  }
  if (!videoUrl) fail("轮询超时仍未完成，报告最后状态见上方")

  // ─── 步骤 6：成品核验 ───
  console.log("\n== 步骤 6：成品核验 ==")
  const head = await fetch(videoUrl, { headers: { Range: "bytes=0-1" } })
  const cr = head.headers.get("content-range")
  const bytes = cr ? Number(cr.split("/")[1]) : Number(head.headers.get("content-length") ?? 0)
  console.log(`  [视频 URL] HTTP ${head.status}，${bytes} 字节`)
  if (!(head.status === 200 || head.status === 206) || bytes <= 0) fail("视频 URL 不可访问或 0 字节")

  const probed = probeSeconds(videoUrl)
  const effDuration = probed ?? apiDuration
  console.log(`  [时长] ffprobe=${probed?.toFixed(2) ?? "-"}s 接口 duration=${apiDuration}s`)

  console.log("\n== 结果汇总 ==")
  for (const [i, c] of calls.entries()) {
    console.log(`  #${i + 1} ${c.method} ${c.path} → ${c.status ?? "-"} ${c.ms}ms`)
  }
  console.log(`  总耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  console.log(`  视频 URL：${videoUrl}`)
  console.log("  ⚠️ 上述 URL 为供应商存储，请按需转存 AIM OSS（transferFromUrl）。")
  console.log("\n✅ HeyGen 真实链路验收通过。")
  process.exit(0)
}

main().catch((error) => {
  console.error(`\n[ABORT] 未预期错误：${error instanceof Error ? error.message : error}`)
  process.exit(1)
})
