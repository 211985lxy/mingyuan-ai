import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(join(process.cwd(), "src/components/aim/aim-prompt-composer.tsx"), "utf8")

describe("AIM prompt composer Enter behavior", () => {
  it("uses Codex-style Enter submit and Shift+Enter newline", () => {
    expect(source).toContain("onKeyDown")
    expect(source).toContain("event.shiftKey")
    expect(source).toContain("Enter 发送 · Shift+Enter 换行")
  })

  it("closes the skill menu on outside click and Escape", () => {
    expect(source).toContain('document.addEventListener("pointerdown", closeOnOutside)')
    expect(source).toContain('document.addEventListener("keydown", closeOnEscape)')
    expect(source).toContain('event.key !== "Escape"')
  })
})
