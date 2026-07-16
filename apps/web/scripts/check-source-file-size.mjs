import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"

const WEB_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)))
const CONFIG_PATH = join(WEB_ROOT, "config", "architecture-size-policy.json")
const SOURCE_ROOT = join(WEB_ROOT, "src")
const PRISMA_ROOT = join(WEB_ROOT, "prisma")
const require = createRequire(import.meta.url)
const ts = require("typescript")

function listSourceFiles(dir, files = [], filePattern = /\.(ts|tsx)$/) {
  for (const entry of readdirSync(dir)) {
    if (["generated", "node_modules", ".next"].includes(entry)) continue
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      listSourceFiles(path, files, filePattern)
    } else if (filePattern.test(entry)) {
      files.push(path)
    }
  }
  return files
}

function lineCount(path) {
  const text = readFileSync(path, "utf8")
  return text ? text.split(/\r?\n/).length - (text.endsWith("\n") ? 1 : 0) : 0
}

function longFunctions(path, text, limit) {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true)
  const findings = []
  const visit = (node) => {
    if (ts.isFunctionLike(node) && node.body) {
      const start = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
      const end = source.getLineAndCharacterOfPosition(node.end).line + 1
      if (end - start + 1 > limit) findings.push(`${relative(WEB_ROOT, path)}:${start}-${end}`)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return findings
}

function main() {
  const policy = JSON.parse(readFileSync(CONFIG_PATH, "utf8"))
  const legacyFiles = new Map(policy.legacyFiles.map((item) => [item.path, item]))
  const violations = []
  const oversizedFunctions = []
  const deadlinePassed = new Date(`${policy.legacyDeadline}T23:59:59Z`).getTime() < Date.now()

  for (const path of listSourceFiles(SOURCE_ROOT)) {
    const file = relative(WEB_ROOT, path)
    const text = readFileSync(path, "utf8")
    const lines = lineCount(path)
    oversizedFunctions.push(...longFunctions(path, text, policy.functionLineLimit))
    if (lines <= policy.fileLineLimit) continue

    const legacy = legacyFiles.get(file)
    if (!legacy) {
      violations.push(`${file}: ${lines} lines; every new module must stay at or below ${policy.fileLineLimit} lines`)
    } else if (lines > legacy.maxLines) {
      violations.push(`${file}: ${lines} lines; approved legacy maximum is ${legacy.maxLines}, extract into ${legacy.target}`)
    } else if (deadlinePassed) {
      violations.push(`${file}: ${lines} lines; legacy waiver expired on ${policy.legacyDeadline}, extract into ${legacy.target}`)
    }
  }

  for (const path of listSourceFiles(PRISMA_ROOT, [], /\.prisma$/)) {
    const file = relative(WEB_ROOT, path)
    const lines = lineCount(path)
    if (lines > policy.prismaFileLineLimit) {
      violations.push(`${file}: ${lines} lines; Prisma domain files must stay at or below ${policy.prismaFileLineLimit} lines`)
    }
  }

  if (deadlinePassed && oversizedFunctions.length > 0) {
    violations.push(`${oversizedFunctions.length} functions exceed ${policy.functionLineLimit} lines after the legacy deadline`)
  }

  if (process.argv.includes("--report") || deadlinePassed) {
    console.log(`Functions above ${policy.functionLineLimit} lines (${oversizedFunctions.length}):`)
    for (const finding of oversizedFunctions) console.log(`  - ${finding}`)
  }

  if (violations.length > 0) {
    console.error("Architecture size policy failed:")
    for (const violation of violations) console.error(`  - ${violation}`)
    process.exit(1)
  }

  const warning = oversizedFunctions.length > 0
    ? ` warnings=functions>${policy.functionLineLimit}:${oversizedFunctions.length} due=${policy.legacyDeadline}`
    : ""
  console.log(`architecture-size-ok fileLimit=${policy.fileLineLimit} prismaFileLimit=${policy.prismaFileLineLimit} legacyFiles=${legacyFiles.size}${warning}`)
}

main()
