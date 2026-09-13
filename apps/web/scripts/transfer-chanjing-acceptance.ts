/**
 * 蝉镜验收产物转存：把平台临时 URL（res.chanjing.cc，会过期回收）转存到自有 OSS。
 *
 * 用法：
 *   pnpm --dir apps/web exec tsx scripts/transfer-chanjing-acceptance.ts
 *
 * 复用 src/lib/oss 的 transferFromUrlDetailed（流式下载 + 3 次重试 + SSRF 校验）。
 * OSS 凭证从 .env.local 读取，不打印；桶若为私有桶，输出 URL 需签名访问（见 generateSignedUrl）。
 */
import { config as loadDotenv } from "dotenv"
import { fileURLToPath } from "node:url"

loadDotenv({ path: fileURLToPath(new URL("../.env.local", import.meta.url)) })

const ARTIFACTS: Array<{ source: string; destKey: string }> = [
  {
    // 2026-09-12 验收：科普女声 TTS（task 6adaf03a905144e385a685bb8081f4c9，duration 3.312s）
    source: "https://res.chanjing.cc/chanjing/res/upload/tts/2026-09-12/cf69d2214f57a3aca3226c69daa83e19.wav",
    destKey: "videos/chanjing-acceptance/2026-09-12/audio-6adaf03a905144e385a685bb8081f4c9.wav",
  },
  {
    // 2026-09-12 验收：数字人「晓洁」whole_body 1080x1920（task 2098802346406752256，duration 4s）
    source: "https://res.chanjing.cc/chanjing/prod/dhaio/output/2026-09-12/2098802346406752256-1789228465-output.mp4",
    destKey: "videos/chanjing-acceptance/2026-09-12/video-2098802346406752256.mp4",
  },
]

async function main(): Promise<void> {
  const { transferFromUrlDetailed, generateSignedUrl } = await import("@/lib/oss")
  let failed = false
  for (const item of ARTIFACTS) {
    const result = await transferFromUrlDetailed(item.source, item.destKey)
    console.log(
      `[transfer-chanjing] ${item.destKey} durable=${result.durable} url=${result.url}${result.warning ? ` warning=${result.warning}` : ""}`,
    )
    if (!result.durable) {
      failed = true
      continue
    }
    // 私有桶：签名访问自验对象完整可读。签名按 GET 计算（V1 签名含 VERB，HEAD 会 403），
    // 用 Range 只取 1KB；签名 URL 临时有效，不落日志正文
    const signed = generateSignedUrl(result.url, 600)
    const probe = await fetch(signed, { headers: { Range: "bytes=0-1023" } })
    if (!probe.ok) {
      const body = await probe.text().catch(() => "")
      console.error(`[transfer-chanjing] verify failed ${item.destKey} http=${probe.status} body=${body.slice(0, 300)}`)
    }
    console.log(
      `[transfer-chanjing] verify ${item.destKey} http=${probe.status} range_length=${probe.headers.get("content-length") ?? "?"}`,
    )
    if (!probe.ok) failed = true
  }
  if (failed) process.exit(1)
}

main().catch((error: unknown) => {
  console.error("[transfer-chanjing] failed:", error)
  process.exit(1)
})
