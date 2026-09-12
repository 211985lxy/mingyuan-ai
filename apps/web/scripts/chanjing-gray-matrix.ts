/**
 * 蝉镜 20 任务灰度矩阵执行器。
 *
 * 默认 dry-run：只读列表与余额并输出计划，不产生任何费用。
 * 真实执行必须显式传 --run=N（每任务 = 1 次 TTS + 1 次数字人视频合成，消耗蝉豆）。
 *
 * 用法（apps/web 下）：
 *   pnpm exec tsx scripts/chanjing-gray-matrix.ts            # dry-run 计划
 *   pnpm exec tsx scripts/chanjing-gray-matrix.ts --run=20   # 真实执行 20 任务
 * 可选：--concurrency=2 --voice=知性 --dp=商务 --out=<json路径>
 *
 * 验收口径（与验收报告一致）：≥N-1 成功、任务 id 全局唯一（无重复下单）、
 * 每任务音频/视频时长差 ≤2s、成品可下载供人工评分（≥4/5 由人工判定）。
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const WEB_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)))
for (const line of readFileSync(resolve(WEB_ROOT, ".env.local"), "utf8").split("\n")) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
}

const args = new Map(process.argv.slice(2).map((a) => a.split("=") as [string, string]))
const runCount = args.has("--run") ? Number(args.get("--run")) : 0
const concurrency = Number(args.get("--concurrency") ?? 2)
const voiceKeyword = args.get("--voice")
const dpKeyword = args.get("--dp")
const outPath = args.get("--out")
  ?? "/Users/xiangyu/Desktop/明动aim智能体/artifacts/chanjing-gray-matrix/result.json"

const TEXTS = [
  "第一条验收语音，数字人链路灰度测试。",
  "第二条验收语音，检查重复下单防护。",
  "第三条验收语音，观察队列稳定性。",
  "第四条验收语音，验证音画时长一致。",
  "第五条验收语音，覆盖并发提交场景。",
  "第六条验收语音，确认转存前置可用。",
  "第七条验收语音，抽样供应商轮询。",
  "第八条验收语音，检查失败重试路径。",
  "第九条验收语音，覆盖短文本场景。",
  "第十条验收语音，验证音色一致性。",
  "第十一条验收语音，观察高峰排队。",
  "第十二条验收语音，确认幂等键有效。",
  "第十三条验收语音，抽样画面稳定性。",
  "第十四条验收语音，验证回调可达。",
  "第十五条验收语音，覆盖普通话识别。",
  "第十六条验收语音，检查合成耗时分位。",
  "第十七条验收语音，验证余额扣减。",
  "第十八条验收语音，覆盖多任务并发。",
  "第十九条验收语音，确认结果持久化。",
  "第二十条验收语音，灰度矩阵收尾。",
]

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface TaskRecord {
  index: number
  text: string
  ttsTaskId?: string
  videoTaskId?: string
  audioDuration?: number
  videoDuration?: number
  status: "success" | "failed"
  error?: string
  audioMs?: number
  videoMs?: number
}

async function main(): Promise<void> {
  const { env } = await import("../src/env")
  if (!env.CHANJING_APP_ID || !env.CHANJING_SECRET_KEY) {
    console.error("缺少 CHANJING_APP_ID / CHANJING_SECRET_KEY（.env.local）")
    process.exit(1)
  }
  const { listCommonAudio, listCommonDigitalPersons, createAudioTask, getAudioTaskState, createDigitalHumanVideoFromAudio } =
    await import("../src/lib/chanjing-audio")
  const { getVideoTask, request } = await import("../src/lib/chanjing")

  const audioList = await listCommonAudio(1, 20)
  const dpList = await listCommonDigitalPersons(1, 20)
  const duration = await request<{ resi_total_bean: number }>("GET", "/user_duration", { timeoutMs: 10_000 })
  const voice = (voiceKeyword && audioList.find((a) => a.name.includes(voiceKeyword))) || audioList[0]
  const dp = (dpKeyword && dpList.find((d) => d.name.includes(dpKeyword) && d.figures.length))
    || dpList.find((d) => d.figures.some((f) => f.type && (f.width ?? 0) > 0))!
  const figure = dp.figures.find((f) => f.type && (f.width ?? 0) > 0)!

  console.log(`计划：${runCount > 0 ? `真实执行 ${runCount} 任务` : "dry-run（不产生费用）"}`
    + `，并发 ${concurrency}，音色「${voice.name}」，数字人「${dp.name}」${figure.type} ${figure.width}x${figure.height}`)
  console.log(`当前剩余蝉豆：${duration.resi_total_bean}（按豆计费，请自行评估余额是否充足）`)
  if (runCount <= 0) {
    console.log("dry-run 计划文本：")
    TEXTS.slice(0, 20).forEach((t, i) => console.log(`  #${i + 1} ${t}`))
    console.log("确认执行请加 --run=20（将消耗蝉豆）。")
    return
  }

  const records: TaskRecord[] = []
  let cursor = 0
  async function worker(): Promise<void> {
    while (cursor < runCount) {
      const index = ++cursor
      const record: TaskRecord = { index, text: TEXTS[(index - 1) % TEXTS.length], status: "failed" }
      records.push(record)
      try {
        const ttsStart = Date.now()
        const ttsTaskId = await createAudioTask({ audioManId: voice.id, speed: 1, text: record.text })
        record.ttsTaskId = ttsTaskId
        let audioUrl = ""
        for (let attempt = 0; attempt < 100 && Date.now() - ttsStart < 300_000; attempt++) {
          await sleep(Math.min(10_000, 3_000 * 1.6 ** attempt))
          const s = await getAudioTaskState(ttsTaskId)
          if (s.errMsg || s.errReason) throw new Error(`TTS errMsg=${s.errMsg} errReason=${s.errReason}`)
          if (s.status === 9 && s.full?.url) {
            audioUrl = s.full.url
            record.audioDuration = s.full.duration
            break
          }
        }
        if (!audioUrl) throw new Error("TTS 轮询超时(5min)")
        record.audioMs = Date.now() - ttsStart

        const videoStart = Date.now()
        const { taskId } = await createDigitalHumanVideoFromAudio({
          personId: dp.id,
          figureType: figure.type!,
          personWidth: figure.width!,
          personHeight: figure.height!,
          wavUrl: audioUrl,
          volume: 100,
          screenWidth: figure.width!,
          screenHeight: figure.height!,
        })
        record.videoTaskId = taskId
        for (let attempt = 0; attempt < 80 && Date.now() - videoStart < 1_200_000; attempt++) {
          await sleep(Math.min(15_000, 5_000 * 1.6 ** attempt))
          const v = await getVideoTask(taskId) as {
            queue_status?: string
            video_url?: string
            duration?: number
            msg?: string
          }
          if (v.queue_status === "completed" && v.video_url) {
            record.videoDuration = v.duration
            record.videoMs = Date.now() - videoStart
            record.status = "success"
            break
          }
          if (v.queue_status === "failed" || v.queue_status === "other") {
            throw new Error(`video ${v.queue_status}: ${v.msg ?? ""}`)
          }
        }
        if (record.status !== "success" && !record.error) throw new Error("视频轮询超时(20min)")
      } catch (error) {
        record.error = error instanceof Error ? error.message : String(error)
      }
      console.log(`  #${record.index} ${record.status}`
        + (record.videoTaskId ? ` video=${record.videoTaskId}` : "")
        + (record.error ? ` error=${record.error}` : ""))
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, runCount) }, worker))

  // ─── 统计（对应验收阈值）───
  const success = records.filter((r) => r.status === "success")
  const videoIds = records.map((r) => r.videoTaskId).filter(Boolean) as string[]
  const uniqueIds = new Set(videoIds).size
  const durationOk = success.filter((r) => Math.abs((r.videoDuration ?? 0) - (r.audioDuration ?? 0)) <= 2).length
  const summary = {
    total: records.length,
    success: success.length,
    thresholdPass: success.length >= runCount - 1,
    duplicateOrders: videoIds.length - uniqueIds,
    durationMatched: durationOk,
    timings: {
      audioAvgMs: Math.round(success.reduce((s, r) => s + (r.audioMs ?? 0), 0) / Math.max(1, success.length)),
      videoAvgMs: Math.round(success.reduce((s, r) => s + (r.videoMs ?? 0), 0) / Math.max(1, success.length)),
      videoMaxMs: Math.max(0, ...success.map((r) => r.videoMs ?? 0)),
    },
    note: "身份/口型/画面稳定性 ≥4/5 需人工观看成品评分，脚本不代替",
  }
  mkdirSync(resolve(outPath, ".."), { recursive: true })
  writeFileSync(outPath, JSON.stringify({ summary, records }, null, 2))
  console.log("\n== 矩阵统计 ==")
  console.log(JSON.stringify(summary, null, 2))
  console.log(`明细已写入 ${outPath}`)
  process.exit(summary.thresholdPass && summary.duplicateOrders === 0 ? 0 : 1)
}

main().catch((error) => {
  const e = error as { code?: string; message?: string; requestId?: string }
  console.error(`[ABORT] code=${e.code ?? "?"} msg=${e.message ?? error} trace_id=${e.requestId ?? "-"}`)
  process.exit(1)
})
