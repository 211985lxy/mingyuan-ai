import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

function extractAuditBlocks(source: string): string[] {
  const blocks: string[] = []
  const marker = "recordAdminAudit("
  let from = 0
  while (from < source.length) {
    const start = source.indexOf(marker, from)
    if (start < 0) break
    let depth = 0
    let end = start + marker.length - 1
    for (; end < source.length; end++) {
      const ch = source[end]
      if (ch === "(") depth += 1
      if (ch === ")") {
        depth -= 1
        if (depth === 0) {
          end += 1
          break
        }
      }
    }
    blocks.push(source.slice(start, end))
    from = end
  }
  return blocks
}

describe("sensitive admin audit metadata stays scrubbed", () => {
  const files = [
    "src/app/api/admin/activation-codes/route.ts",
    "src/app/api/admin/activation-codes/export/route.ts",
    "src/app/api/admin/activation-codes/generate/route.ts",
    "src/app/api/admin/aim/runs/route.ts",
    "src/app/api/admin/aim/runs/[runId]/route.ts",
    "src/app/api/admin/agents/traces/route.ts",
    "src/app/api/admin/agents/traces/[id]/route.ts",
  ]

  it("records audit actions without embedding codes, prompts, emails, or body text", () => {
    for (const rel of files) {
      const source = readFileSync(join(process.cwd(), rel), "utf8")
      const blocks = extractAuditBlocks(source)
      expect(blocks.length, rel).toBeGreaterThan(0)
      for (const block of blocks) {
        expect(block, rel).not.toMatch(/\bemail\b/)
        expect(block, rel).not.toMatch(/\bprompt\b/i)
        expect(block, rel).not.toMatch(/\binputSummary\b/)
        expect(block, rel).not.toMatch(/\boutputSummary\b/)
        // 不得把激活码明文字段写入 metadata
        expect(block, rel).not.toMatch(/metadata:\s*\{[^}]*\bcode\b/)
      }
    }
  })
})
