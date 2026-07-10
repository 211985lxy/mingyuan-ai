import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const DEFAULT_MAX_BYTES = 768 * 1024 * 1024

function isInside(root, target) {
  const relative = path.relative(root, target)
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
}

export function validateStandaloneArtifact(rootDir, options = {}) {
  const root = fs.realpathSync(rootDir)
  const maxBytes = options.maxBytes ?? Number(process.env.STANDALONE_MAX_BYTES || DEFAULT_MAX_BYTES)
  const externalSymlinks = []
  const brokenSymlinks = []
  const seenFiles = new Set()
  let bytes = 0

  function walk(current) {
    const stat = fs.lstatSync(current)
    if (stat.isSymbolicLink()) {
      try {
        const target = fs.realpathSync(current)
        if (!isInside(root, target)) externalSymlinks.push({ link: current, target })
      } catch {
        brokenSymlinks.push(current)
      }
      return
    }
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current)) walk(path.join(current, entry))
      return
    }
    if (stat.isFile()) {
      const key = `${stat.dev}:${stat.ino}`
      if (!seenFiles.has(key)) {
        seenFiles.add(key)
        bytes += stat.size
      }
    }
  }

  walk(root)

  if (brokenSymlinks.length > 0) {
    throw new Error(`Standalone artifact contains broken symlinks: ${brokenSymlinks.join(", ")}`)
  }
  if (externalSymlinks.length > 0) {
    const detail = externalSymlinks.map((item) => `${item.link} -> ${item.target}`).join("; ")
    throw new Error(`Standalone symlink escapes artifact root: ${detail}`)
  }
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    throw new Error(`Invalid standalone size limit: ${maxBytes}`)
  }
  if (bytes > maxBytes) {
    throw new Error(`Standalone artifact size ${bytes} exceeds limit ${maxBytes}`)
  }

  return { root, bytes, externalSymlinks, brokenSymlinks }
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isCli) {
  const rootDir = process.argv[2]
  if (!rootDir) {
    console.error("Usage: node scripts/validate-standalone-artifact.mjs <standalone-dir>")
    process.exit(1)
  }
  try {
    const result = validateStandaloneArtifact(rootDir)
    console.log(`standalone-artifact-ok bytes=${result.bytes}`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
