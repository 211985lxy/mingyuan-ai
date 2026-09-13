import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { extname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const webRoot = resolve(fileURLToPath(new URL("..", import.meta.url)))
const repoRoot = resolve(webRoot, "../..")

/**
 * 2026-09-12 数字人/视频成片域恢复（codex/aim-digital-human-implementation 合并）。
 *
 * 门禁重划边界（非整体放开）：
 * - 放行：VideoTask / VideoProductionPlan / VideoPackagingTemplate / Avatar 模型、
 *   SHANJIAN_*（管理员手动备用链路）、PACKAGING_MATERIAL_PLAN_MODEL、
 *   worker:task-recovery、api/{tasks,production-plans,packaging-templates}、
 *   cron/{poll-tasks,backfill-delivery,poll-enhancements}。
 * - 继续拦截（仍处退役态，恢复前先评审）：Pexels / Pixabay / Volcengine TTS、
 *   PublicAvatarPreview、packaging-material-suggestions、cron/pexels-transfer、
 *   mingyuan-worker。
 */
const scanRoots = [
  resolve(webRoot, "src"),
  resolve(webRoot, "prisma"),
  resolve(repoRoot, ".github"),
  resolve(repoRoot, "docs"),
  resolve(repoRoot, "k8s"),
  resolve(repoRoot, "openspec"),
]
const files = [
  resolve(webRoot, "package.json"),
  resolve(webRoot, "vercel.json"),
  resolve(webRoot, ".env.example"),
  resolve(webRoot, ".env.production.example"),
  resolve(webRoot, "Dockerfile"),
  resolve(repoRoot, "CLAUDE.md"),
]
const allowedExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".json",
  ".prisma",
  ".md",
  ".yml",
  ".yaml",
])
const ignoredSegments = ["/generated/", "/migrations/", "/baseline/"]
const ignoredFiles = new Set([
  resolve(repoRoot, "docs/plans/2026-07-13-aim-repository-reliability-master-plan.md"),
  // 数字人收编决策：点名退休域是为了禁止 merge，不是为了恢复它们。
  resolve(repoRoot, "docs/plans/2026-09-12-aim-digital-human-chanjing-delivery-plan.md"),
])
const retiredPatterns = [
  /\bPexelsMedia\b/,
  /\bPexelsQueryCache\b/,
  /\bPublicAvatarPreview/,
  /\bPEXELS_/,
  /\bPIXABAY_/,
  /\bVOLC_(?:SPEECH|TTS)_/,
  /\bmingyuan-worker\b/,
  /\/api\/(?:packaging-material-suggestions|pexels)(?:\/|\b)/,
  /\/api\/cron\/pexels-transfer(?:\/|\b)/,
  /@\/lib\/(?:pexels|pixabay|volcengine-tts|public-avatar-preview)/,
]

function walk(directory) {
  if (!existsSync(directory)) return

  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    const normalized = path.replaceAll("\\", "/")
    if (ignoredSegments.some((segment) => normalized.includes(segment))) continue
    if (statSync(path).isDirectory()) walk(path)
    else if (allowedExtensions.has(extname(path))) files.push(path)
  }
}

for (const directory of scanRoots) walk(directory)

const violations = []
for (const file of files) {
  if (!existsSync(file) || ignoredFiles.has(file)) continue
  const content = readFileSync(file, "utf8")
  for (const pattern of retiredPatterns) {
    if (pattern.test(content)) violations.push(`${relative(repoRoot, file)} matches ${pattern}`)
  }
}

const retainedAsrContracts = [
  [resolve(webRoot, "src/app/api/aim/transcribe/route.ts"), "ALIYUN_NLS_APP_KEY"],
  [resolve(webRoot, "src/lib/api/aim-chat.ts"), "/api/aim/transcribe"],
  [resolve(webRoot, "src/hooks/use-audio-recorder.ts"), "transcribeFn"],
  [resolve(webRoot, ".env.example"), "ALIYUN_NLS_APP_KEY"],
  [resolve(webRoot, ".env.production.example"), "ALIYUN_NLS_APP_KEY"],
]

for (const [file, requiredText] of retainedAsrContracts) {
  if (!existsSync(file) || !readFileSync(file, "utf8").includes(requiredText)) {
    violations.push(`${relative(repoRoot, file)} must retain ASR contract ${requiredText}`)
  }
}

if (violations.length > 0) {
  console.error("Retired media capability returned or retained ASR was removed:")
  for (const violation of violations) console.error(`  - ${violation}`)
  process.exit(1)
}

console.log(`retired-capability-guard-ok files=${new Set(files).size} asr=retained mode=digital-human-restored`)
