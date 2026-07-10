import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { validateStandaloneArtifact } from "./validate-standalone-artifact.mjs"

function tempDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`))
}

test("rejects symlinks that escape the standalone root", () => {
  const root = tempDir("standalone-root")
  const external = tempDir("standalone-external")
  fs.symlinkSync(external, path.join(root, "node_modules"), "dir")

  assert.throws(
    () => validateStandaloneArtifact(root, { maxBytes: 1024 }),
    /escapes artifact root/,
  )
})

test("accepts internal links and reports artifact bytes", () => {
  const root = tempDir("standalone-valid")
  const packageDir = path.join(root, "node_modules", ".pnpm", "pkg", "node_modules", "pkg")
  fs.mkdirSync(packageDir, { recursive: true })
  fs.writeFileSync(path.join(packageDir, "index.js"), "module.exports = true\n")
  fs.symlinkSync(
    path.relative(path.join(root, "node_modules"), packageDir),
    path.join(root, "node_modules", "pkg"),
    "dir",
  )

  const result = validateStandaloneArtifact(root, { maxBytes: 1024 })
  assert.ok(result.bytes > 0)
  assert.equal(result.externalSymlinks.length, 0)
})

test("rejects artifacts above the configured size limit", () => {
  const root = tempDir("standalone-large")
  fs.writeFileSync(path.join(root, "server.js"), "1234567890")

  assert.throws(
    () => validateStandaloneArtifact(root, { maxBytes: 5 }),
    /exceeds limit/,
  )
})
