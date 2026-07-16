import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

const guard = join(process.cwd(), "scripts/check-domain-boundaries.mjs")
const fixtures: string[] = []

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), "aim-domain-guard-"))
  fixtures.push(root)
  return root
}

function write(root: string, path: string, content: string) {
  const file = join(root, path)
  mkdirSync(join(file, ".."), { recursive: true })
  writeFileSync(file, content)
}

afterEach(() => {
  while (fixtures.length > 0) rmSync(fixtures.pop()!, { recursive: true, force: true })
})

describe("domain boundary guard", () => {
  it("accepts thin composition pages and routes", () => {
    const root = fixtureRoot()
    write(root, "src/app/demo/page.tsx", 'import { Demo } from "@/features/demo"\nexport default Demo\n')
    write(root, "src/app/api/demo/route.ts", "export async function GET() { return Response.json({ ok: true }) }\n")

    expect(() => execFileSync(process.execPath, [guard, "--root", root])).not.toThrow()
  })

  it("rejects a page that imports Prisma directly", () => {
    const root = fixtureRoot()
    write(root, "src/app/demo/page.tsx", 'import { prisma } from "@/lib/prisma"\nexport default function Page() { return null }\n')

    const result = spawnSync(process.execPath, [guard, "--root", root], { encoding: "utf8" })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("pages and layouts must load data through a service or API")
  })

  it("rejects a new route that exceeds the thin-route budget", () => {
    const root = fixtureRoot()
    write(root, "src/app/api/demo/route.ts", `${Array.from({ length: 251 }, (_, index) => `// ${index}`).join("\n")}\n`)

    const result = spawnSync(process.execPath, [guard, "--root", root], { encoding: "utf8" })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("new routes must stay at or below 250")
  })
})
