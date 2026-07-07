import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(join(process.cwd(), "src/components/markdown-renderer.tsx"), "utf8")

describe("MarkdownRenderer empty content", () => {
  it("does not render 暂无 for empty streaming placeholders", () => {
    expect(source).toContain("if (!content.trim()) return null")
    expect(source).not.toContain("暂无")
  })
})
