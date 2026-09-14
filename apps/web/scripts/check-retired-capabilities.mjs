import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { execFileSync } from "node:child_process"
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

/**
 * 只扫描 **git 跟踪** 的文件，不遍历文件系统。
 *
 * 原因（2026-09-14 实测）：原实现用 readdirSync 遍历，会把本机 `.git/info/exclude`
 * 排除的文件（本地遗留产物）也算进来，导致同一提交在这台机器上门禁红、在 CI 上绿，
 * 门禁噪声化——而门禁的可信度正是它全部价值所在。
 */
function collectTrackedFiles() {
  let tracked = ""
  try {
    tracked = execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024 }).toString()
  } catch {
    // 非 git 环境（如打包产物内）退回遍历，保持可用
    for (const directory of scanRoots) walk(directory)
    return
  }
  for (const relativePath of tracked.split("\0")) {
    if (!relativePath) continue
    const normalized = relativePath.replaceAll("\\", "/")
    if (ignoredSegments.some((segment) => normalized.includes(segment))) continue
    if (!allowedExtensions.has(extname(normalized))) continue
    // 只保留扫描根目录内的文件
    if (!scanRoots.some((root) => {
      const relativeRoot = relative(repoRoot, root).replaceAll("\\", "/")
      return normalized === relativeRoot || normalized.startsWith(`${relativeRoot}/`)
    })) continue
    files.push(resolve(repoRoot, normalized))
  }
}

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

collectTrackedFiles()

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
