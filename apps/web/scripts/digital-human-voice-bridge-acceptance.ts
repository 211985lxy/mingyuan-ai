/**
 * 自有语音 → 蝉镜 桥接层真实链路验收（不依赖蝉镜凭证的部分）。
 *
 * 用法（apps/web 目录下）：
 *   pnpm exec tsx scripts/digital-human-voice-bridge-acceptance.ts
 *
 * 验证链路：Fish Audio 真实合成 → 受管 OSS 真实上传 → 生成签名 URL →
 * 以「蝉镜会做的方式」真实抓取该 URL（HTTP 状态 / 字节数 / 音频头）。
 *
 * 凭证从 apps/web/.env.local（gitignored）读取。脚本不打印任何密钥，
 * 签名 URL 仅打印掩码；结束时删除本次上传的 OSS 对象。
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const WEB_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)))

// ─── 先加载 .env.local，再动态引入业务模块（模块在加载期读 env）───
for (const line of readFileSync(resolve(WEB_ROOT, ".env.local"), "utf8").split("\n")) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (!match || process.env[match[1]]) continue
  // 去掉 .env 常见的包裹引号，否则 NODE_ENV 之类会被判为无效枚举
  const raw = match[2].replace(/^(['"])(.*)\1$/, "$2")
  process.env[match[1]] = raw
}

const TEXT = process.argv[2] ?? "大家好，这是一条自有语音驱动数字人的验收样音。"

function maskUrl(url: string): string {
  // 保留 host 与路径尾部，隐去签名参数
  try {
    const u = new URL(url)
    const tail = u.pathname.split("/").slice(-2).join("/")
    return `${u.host}/…/${tail}${u.search ? "?<signature>" : ""}`
  } catch {
    return "<unparsable>"
  }
}

const steps: Array<{ step: string; result: string }> = []
function record(step: string, result: string) {
  steps.push({ step, result })
  console.log(`  ✓ ${step} — ${result}`)
}

async function main() {
  const {
    synthesizeOwnVoiceToOss,
    CHANJING_GRAB_URL_TTL_SECONDS,
    DigitalHumanVoiceBridgeError,
  } = await import("@/lib/digital-human-voice-bridge")
  const { deleteManagedOssObject, isOssConfigured } = await import("@/lib/oss")

  console.log("== 前置条件 ==")
  console.log(`  OSS 已配置: ${isOssConfigured()}`)
  console.log(`  抓取 TTL: ${CHANJING_GRAB_URL_TTL_SECONDS}s (${CHANJING_GRAB_URL_TTL_SECONDS / 3600}h)`)

  console.log("\n== 步骤 1-3：合成 → 上传 OSS → 签名 ==")
  let synthesis
  try {
    synthesis = await synthesizeOwnVoiceToOss({
      userId: "acceptance-bridge-check",
      text: TEXT,
      format: "mp3",
    })
  } catch (error) {
    if (error instanceof DigitalHumanVoiceBridgeError) {
      console.error(`  ✗ 桥接层拒绝: [${error.code}] ${error.message}`)
      process.exit(1)
    }
    throw error
  }
  record("Fish Audio 真实合成", `${synthesis.bytes} 字节 / ${synthesis.charCount} 字 / 档位 ${synthesis.model} / ${synthesis.contentType}`)
  record("受管 OSS 上传", maskUrl(synthesis.ossUrl))
  record("签名 URL 生成", maskUrl(synthesis.signedUrl))

  if (synthesis.bytes <= 0) throw new Error("合成音频为空")
  if (synthesis.signedUrl === synthesis.ossUrl) {
    throw new Error("签名未生效：signedUrl 与 ossUrl 相同（受管判定或 OSS 配置有问题）")
  }

  console.log("\n== 步骤 4：模拟蝉镜抓取（关键验证）==")
  const grabbed = await fetch(synthesis.signedUrl)
  const body = new Uint8Array(await grabbed.arrayBuffer())
  record("签名 URL HTTP 抓取", `HTTP ${grabbed.status} / ${body.byteLength} 字节`)
  record("Content-Type", grabbed.headers.get("content-type") ?? "<none>")

  const isMp3 = body.length > 2 && ((body[0] === 0x49 && body[1] === 0x44 && body[2] === 0x33) || (body[0] === 0xff && (body[1] & 0xe0) === 0xe0))
  const isWav = body.length > 2 && body[0] === 0x52 && body[1] === 0x49 && body[2] === 0x46
  record("音频头校验", isMp3 ? "ID3/MPEG 帧同步（mp3）" : isWav ? "RIFF（wav）" : "⚠ 未识别为已知音频头")

  if (!grabbed.ok) throw new Error(`签名 URL 抓取失败：HTTP ${grabbed.status}`)
  if (body.byteLength !== synthesis.bytes) {
    throw new Error(`抓取字节数(${body.byteLength})与上传字节数(${synthesis.bytes})不一致`)
  }
  if (!isMp3 && !isWav) throw new Error("抓取内容不是可识别的音频")

  console.log("\n== 步骤 5：清理本次上传 ==")
  const removed = await deleteManagedOssObject(synthesis.ossUrl)
  record("删除验收对象", removed ? "已删除" : "未删除（非受管对象或删除失败）")

  console.log("\n== 汇总 ==")
  for (const { step, result } of steps) console.log(`  - ${step}: ${result}`)
  console.log("\n✅ 桥接层真实链路通过：Fish 合成 → OSS 受管 → 签名 URL 可被第三方抓取，字节一致。")
  console.log("   蝉镜那一跳需 CHANJING_APP_ID/SECRET_KEY，补齐后跑 scripts/chanjing-acceptance.ts。")
}

main().catch((error) => {
  console.error("\n❌ 验收失败:", error instanceof Error ? error.message : error)
  process.exit(1)
})
