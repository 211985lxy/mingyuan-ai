import fs from "node:fs"
import path from "node:path"

const rootDir = process.argv[2]

if (!rootDir) {
  console.error("Usage: node scripts/materialize-standalone-node-modules.mjs <standalone-dir>")
  process.exit(1)
}

const standaloneDir = path.resolve(rootDir)
const rootNodeModules = path.join(standaloneDir, "node_modules")
const appNodeModules = path.join(standaloneDir, "apps", "web", "node_modules")
const pnpmDir = path.join(rootNodeModules, ".pnpm")

if (!fs.existsSync(pnpmDir)) {
  console.error(`Missing pnpm directory: ${pnpmDir}`)
  process.exit(1)
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function resetPath(target) {
  if (!fs.existsSync(target) && !fs.lstatSync(target, { throwIfNoEntry: false })) return

  const stat = fs.lstatSync(target)
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    fs.rmSync(target, { recursive: true, force: true })
    return
  }
  fs.rmSync(target, { force: true })
}

function ensureLink(targetRoot, packagePath, sourcePath) {
  const destination = path.join(targetRoot, packagePath)
  if (fs.existsSync(destination) || fs.lstatSync(destination, { throwIfNoEntry: false })) {
    return
  }

  ensureDir(path.dirname(destination))
  const relativeSource = path.relative(path.dirname(destination), sourcePath)
  fs.symlinkSync(relativeSource, destination, "junction")
}

function linkPackage(packagePath, sourcePath) {
  ensureLink(rootNodeModules, packagePath, sourcePath)
  ensureLink(appNodeModules, packagePath, sourcePath)
}

const entries = fs.readdirSync(pnpmDir).sort()
for (const entry of entries) {
  const vendorNodeModules = path.join(pnpmDir, entry, "node_modules")
  if (!fs.existsSync(vendorNodeModules)) continue

  for (const child of fs.readdirSync(vendorNodeModules).sort()) {
    if (child === ".bin") continue

    const childPath = path.join(vendorNodeModules, child)
    const childStat = fs.statSync(childPath)
    if (!childStat.isDirectory()) continue

    if (child.startsWith("@")) {
      for (const scopedChild of fs.readdirSync(childPath).sort()) {
        const scopedPath = path.join(childPath, scopedChild)
        if (!fs.statSync(scopedPath).isDirectory()) continue
        linkPackage(path.join(child, scopedChild), scopedPath)
      }
      continue
    }

    linkPackage(child, childPath)
  }
}

for (const mustResolve of ["next", "styled-jsx", "@next/env", "react", "react-dom", "pino"]) {
  const destination = path.join(appNodeModules, ...mustResolve.split("/"))
  if (!fs.existsSync(destination) && !fs.lstatSync(destination, { throwIfNoEntry: false })) {
    console.error(`Failed to materialize ${mustResolve}`)
    process.exit(1)
  }
}

