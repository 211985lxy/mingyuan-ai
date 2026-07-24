import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(join(process.cwd(), "src/components/aim/aim-prompt-composer.tsx"), "utf8")

describe("AIM prompt composer Enter behavior", () => {
  it("uses Codex-style Enter submit and Shift+Enter newline", () => {
    expect(source).toContain("onKeyDown")
    expect(source).toContain("event.shiftKey")
    // 行为断言：Enter（非 Shift、非输入法组合）才触发生成。
    // 旧版断言的「Enter 发送 · Shift+Enter 换行」提示文案已随 UI 重构移除，
    // 改为断言真实提交逻辑，避免对装饰性文案的脆弱依赖。
    expect(source).toContain("if (canSubmit) onGenerate()")
    expect(source).toContain("event.nativeEvent.isComposing")
  })

  it("closes the skill menu on outside click and Escape", () => {
    expect(source).toContain('document.addEventListener("pointerdown", closeOnOutside)')
    expect(source).toContain('document.addEventListener("keydown", closeOnEscape)')
    expect(source).toContain('event.key !== "Escape"')
  })
})
