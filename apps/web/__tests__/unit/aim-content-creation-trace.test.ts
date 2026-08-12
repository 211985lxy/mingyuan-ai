import { describe, expect, it } from "vitest"
import { ensureContentCreationTrace } from "@/lib/aim-content-creation-trace"
import { splitAimMethodNote } from "@/lib/aim/workbench-display"

// 安全闸门末次命中后，警告经 ensureContentCreationTrace 注入 METHOD_NOTE，
// 由前端 splitAimMethodNote 归入"思考依据"区，正文不被污染。
describe("ensureContentCreationTrace safety warning injection", () => {
  type Ctx = Parameters<typeof ensureContentCreationTrace>[1]
  const lightEditContext = { runtimeTask: "light_edit" } as unknown as Ctx
  const warning = "经 2 轮重写仍检出风险，以下为最后一版，发布前请人工核实"

  it("注入警告到 METHOD_NOTE，splitAimMethodNote 将其归入思考依据而非正文", () => {
    const body = "这是正文，用户要复制发布的口播内容。"
    const traced = ensureContentCreationTrace(body, lightEditContext, warning)
    const display = splitAimMethodNote(traced)

    expect(display.methodNote).toContain("⚠ 内容安全提示")
    expect(display.methodNote).toContain(warning)
    // 正文保留且不被警告污染
    expect(display.result).toContain("这是正文")
    expect(display.result).not.toContain("内容安全提示")
  })

  it("无 safetyWarning 时行为不变（不注入提示）", () => {
    const body = "正文内容"
    const traced = ensureContentCreationTrace(body, lightEditContext, undefined)
    expect(traced).not.toContain("内容安全提示")
    expect(traced).toContain("正文内容")
  })
})
