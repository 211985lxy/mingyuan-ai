import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

function collectFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry)
    const stat = statSync(fullPath)

    if (stat.isDirectory()) {
      return collectFiles(fullPath)
    }

    if (/\.(ts|tsx)$/.test(fullPath)) {
      return [fullPath]
    }

    return []
  })
}

describe("Runtime Contract", () => {
  it("does not allow app runtime to import mock modules", () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url))
    const appRoot = path.resolve(currentDir, "../../src/app")
    const offenders = collectFiles(appRoot).filter((file) =>
      readFileSync(file, "utf8").includes("@/lib/mock")
    )

    expect(offenders).toEqual([])
  })
})
