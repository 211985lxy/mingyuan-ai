import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? routeFiles(path) : entry.name === "route.ts" ? [path] : []
  })
}

describe("admin write audit manifest", () => {
  it("keeps every admin write route behind the generic audit-capable wrapper", () => {
    const root = join(process.cwd(), "src/app/api/admin")
    const uncovered: string[] = []
    const writeRoutes: string[] = []
    for (const file of routeFiles(root)) {
      const source = readFileSync(file, "utf8")
      if (!/export const (POST|PUT|PATCH|DELETE)/.test(source)) continue
      writeRoutes.push(file)
      if (!/withAdminOnly|withAdminOrEditor/.test(source)) uncovered.push(file)
    }
    expect(writeRoutes.length).toBeGreaterThan(0)
    expect(uncovered).toEqual([])
  })

  it("has one automatic mutation audit boundary in the auth wrapper", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/admin-auth.ts"), "utf8")
    expect(source).toContain("recordAutomaticAdminAudit")
    expect(source).toContain("wasRequestAudited")
  })
})
