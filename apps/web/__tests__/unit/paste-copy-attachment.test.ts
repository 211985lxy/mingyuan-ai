import { describe, expect, it } from "vitest"
import {
  assemblePasteUsageInput,
  canSubmitWithPasteAttachment,
  createPastedCopyAttachment,
  inferPasteUsageFromInstruction,
  isLongCopyPaste,
} from "@/lib/aim/paste-copy-attachment"

describe("paste-copy-attachment", () => {
  it("短文本不算长文附件", () => {
    expect(isLongCopyPaste("短短一句")).toBe(false)
    expect(isLongCopyPaste("一行\n两行\n三行\n四行\n五行")).toBe(false)
  })

  it("字数或行数达标时识别为长文", () => {
    expect(isLongCopyPaste("字".repeat(300))).toBe(true)
    expect(isLongCopyPaste("一\n二\n三\n四\n五\n六")).toBe(true)
  })

  it("从指令自动推断三类用途", () => {
    expect(inferPasteUsageFromInstruction("帮我润色这篇")).toBe("edit")
    expect(inferPasteUsageFromInstruction("按这篇仿写一版")).toBe("benchmark")
    expect(inferPasteUsageFromInstruction("记住这种风格以后按这个感觉写")).toBe("style_sample")
    expect(inferPasteUsageFromInstruction("随便写一篇")).toBeUndefined()
  })

  it("裸粘贴未选用途时不能提交", () => {
    const attachment = createPastedCopyAttachment("字".repeat(300))
    expect(canSubmitWithPasteAttachment({ text: "", attachment })).toBe(false)
    expect(canSubmitWithPasteAttachment({ text: "写一篇", attachment: { ...attachment, usage: "edit" } })).toBe(true)
    expect(canSubmitWithPasteAttachment({ text: "", attachment: { ...attachment, usage: "style_sample" } })).toBe(false)
  })

  it("装配修改、质检与对标输入", () => {
    const attachment = createPastedCopyAttachment("原稿正文", "edit")
    const editInput = assemblePasteUsageInput({ instruction: "优化一下", attachment })
    expect(editInput).toContain("【待修改原文】")
    expect(editInput).toContain("原稿正文")

    const review = assemblePasteUsageInput({
      instruction: "",
      attachment: { ...attachment, usage: "review" },
    })
    expect(review).toContain("【待质检原文】")
    expect(review).toContain("不要整篇重写")

    const bench = assemblePasteUsageInput({
      instruction: "按结构仿写",
      attachment: { ...attachment, usage: "benchmark" },
    })
    expect(bench).toContain("对标原文：")
    expect(assemblePasteUsageInput({
      instruction: "",
      attachment: { ...attachment, usage: "style_sample" },
    })).toBeNull()
  })
})
