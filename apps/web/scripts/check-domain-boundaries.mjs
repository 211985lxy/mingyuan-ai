import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const defaultWebRoot = resolve(fileURLToPath(new URL("..", import.meta.url)))
const rootFlag = process.argv.indexOf("--root")
const webRoot = rootFlag >= 0 ? resolve(process.argv[rootFlag + 1]) : defaultWebRoot
const sourceRoot = join(webRoot, "src")
const policyPath = join(webRoot, "config", "domain-boundary-policy.json")
const policy = existsSync(policyPath)
  ? JSON.parse(readFileSync(policyPath, "utf8"))
  : { routeLineLimit: 250, legacyDeadline: "2999-12-31", legacyRoutes: [] }
const legacyRoutes = new Map(policy.legacyRoutes.map((item) => [item.path, item]))
const violations = []

function walk(directory, files = []) {
  if (!existsSync(directory)) return files
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) walk(path, files)
    else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) files.push(path)
  }
  return files
}

function lineCount(content) {
  return content ? content.split(/\r?\n/).length - (content.endsWith("\n") ? 1 : 0) : 0
}

const files = walk(sourceRoot)
const deadlinePassed = new Date(`${policy.legacyDeadline}T23:59:59Z`).getTime() < Date.now()

for (const file of files) {
  const path = relative(webRoot, file).replaceAll("\\", "/")
  const content = readFileSync(file, "utf8")

  if (/\/(?:page|layout)\.tsx$/.test(path)) {
    const importsPrisma =
      /from\s+["']@\/lib\/prisma["']/.test(content) ||
      /from\s+["']@\/generated\/prisma/.test(content)
    if (importsPrisma) {
      violations.push(`${path}: pages and layouts must load data through a service or API, not Prisma`)
    }
  }

  if (/^src\/app\/api\/.+\/route\.ts$/.test(path)) {
    const lines = lineCount(content)
    if (lines <= policy.routeLineLimit) continue

    const legacy = legacyRoutes.get(path)
    if (!legacy) {
      violations.push(`${path}: ${lines} lines; new routes must stay at or below ${policy.routeLineLimit}`)
    } else if (lines > legacy.maxLines) {
      violations.push(`${path}: ${lines} lines; legacy maximum is ${legacy.maxLines}, extract into ${legacy.target}`)
    } else if (deadlinePassed) {
      violations.push(`${path}: route waiver owned by ${legacy.owner} expired on ${policy.legacyDeadline}`)
    }
  }
}

if (violations.length > 0) {
  console.error("Domain boundary policy failed:")
  for (const violation of violations) console.error(`  - ${violation}`)
  process.exit(1)
}

console.log(
  `domain-boundaries-ok pages=${files.filter((file) => /\/(?:page|layout)\.tsx$/.test(file)).length} routeLimit=${policy.routeLineLimit} legacyRoutes=${legacyRoutes.size}`,
)
