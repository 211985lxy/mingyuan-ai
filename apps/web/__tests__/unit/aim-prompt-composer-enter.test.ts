import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const composerSource = readFileSync(
  join(process.cwd(), "src/components/aim/aim-prompt-composer.tsx"),
  "utf8",
)
const shellSource = readFileSync(
  join(process.cwd(), "src/components/aim/aim-prompt-composer-shell.tsx"),
  "utf8",
)

describe("AIM prompt composer Enter behavior", () => {
  it("uses Codex-style Enter submit and Shift+Enter newline", () => {
    // 回车提交逻辑在 aim-prompt-composer-shell.tsx（UI 重构时从主文件迁出）。
    expect(shellSource).toContain("onKeyDown")
    expect(shellSource).toContain("event.shiftKey")
    // 行为断言：Enter（非 Shift、非输入法组合）才触发生成。
    expect(shellSource).toContain("if (canSubmit) onGenerate()")
    expect(shellSource).toContain("event.nativeEvent.isComposing")
  })

  it("closes the skill menu on outside click and Escape", () => {
    // 菜单关闭逻辑仍在 aim-prompt-composer.tsx。
    expect(composerSource).toContain('document.addEventListener("pointerdown", closeOnOutside)')
    expect(composerSource).toContain('document.addEventListener("keydown", closeOnEscape)')
    expect(composerSource).toContain('event.key !== "Escape"')
  })
})
