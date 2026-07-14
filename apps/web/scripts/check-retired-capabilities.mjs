import { readdirSync, readFileSync, statSync } from "node:fs"
import { extname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(fileURLToPath(new URL("..", import.meta.url)))
const scanRoots = [
  resolve(root, "src"),
  resolve(root, "prisma"),
]
const files = [
  resolve(root, "package.json"),
  resolve(root, "vercel.json"),
  resolve(root, ".env.example"),
  resolve(root, ".env.production.example"),
]
const allowedExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".prisma"])
const ignoredSegments = ["/generated/", "/migrations/", "/baseline/"]
const retiredPatterns = [
  /\bVideoTask\b/,
  /\bVideoProductionPlan\b/,
  /\bVideoPackagingTemplate\b/,
  /\bPexelsMedia\b/,
  /\bPexelsQueryCache\b/,
  /\bPublicAvatarPreview/,
  /\bSHANJIAN_/,
  /\bPEXELS_/,
  /\bPIXABAY_/,
  /\bVOLC_(?:SPEECH|TTS)_/,
  /\bPACKAGING_MATERIAL_PLAN_MODEL\b/,
  /\/api\/(?:tasks|production-plans|packaging-templates|packaging-material-suggestions|pexels)(?:\/|\b)/,
  /@\/lib\/(?:shanjian|task-recovery|video-task|aliyun-enhancement|packaging-material)/,
]

function walk(directory) {
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
  const content = readFileSync(file, "utf8")
  for (const pattern of retiredPatterns) {
    if (pattern.test(content)) violations.push(`${relative(root, file)} matches ${pattern}`)
  }
}

if (violations.length > 0) {
  console.error("Retired video-generation capability returned:")
  for (const violation of violations) console.error(`  - ${violation}`)
  process.exit(1)
}

console.log(`retired-capability-guard-ok files=${files.length}`)
