import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const WEB_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)))
const ENV_PATH = join(WEB_ROOT, "src", "env.ts")
const ENV_ACCESS = /process\.env(?:\.([A-Z][A-Z0-9_]*)|\[["']([A-Z][A-Z0-9_]*)["']\])/g

function listFiles(directory, files = []) {
  for (const entry of readdirSync(directory)) {
    if (["node_modules", ".next", "generated"].includes(entry)) continue
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) listFiles(path, files)
    else if (/\.(ts|tsx|mjs)$/.test(entry)) files.push(path)
  }
  return files
}

function readEnvironmentNames(path) {
  const names = new Set()
  const source = readFileSync(path, "utf8")
  for (const match of source.matchAll(/^\s{4}([A-Z][A-Z0-9_]*): z\./gm)) names.add(match[1])
  return names
}

function findEnvironmentReads(paths) {
  const reads = new Set()
  for (const path of paths) {
    if (path === ENV_PATH) continue
    const source = readFileSync(path, "utf8")
    for (const match of source.matchAll(ENV_ACCESS)) reads.add(match[1] || match[2])
  }
  return reads
}

const sourceFiles = [
  ...listFiles(join(WEB_ROOT, "src")),
  ...listFiles(join(WEB_ROOT, "scripts")),
  join(WEB_ROOT, "prisma.config.ts"),
  join(WEB_ROOT, "create-codes.ts"),
]
const declared = readEnvironmentNames(ENV_PATH)
const missing = [...findEnvironmentReads(sourceFiles)].filter((name) => !declared.has(name)).sort()

if (missing.length > 0) {
  console.error("Environment contract failed. Add these variables to src/env.ts:")
  for (const name of missing) console.error(`  - ${name}`)
  process.exit(1)
}

console.log(`environment-contract-ok variables=${declared.size}`)
