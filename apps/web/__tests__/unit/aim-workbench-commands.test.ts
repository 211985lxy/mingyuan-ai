import { describe, expect, it } from "vitest"

import { detectAimWorkbenchCommand } from "@/lib/aim-workbench-commands"

describe("aim workbench commands", () => {
  it("detects editor commands", () => {
    expect(detectAimWorkbenchCommand("整合到编辑区")?.id).toBe("integrate_editor")
    expect(detectAimWorkbenchCommand("打开编辑区")?.id).toBe("open_editor")
    expect(detectAimWorkbenchCommand("隐藏文案编辑")?.id).toBe("close_editor")
    expect(detectAimWorkbenchCommand("保存我的稿子到交付物")?.id).toBe("save_editor")
    expect(detectAimWorkbenchCommand("把对标原文填到右侧编辑区")?.id).toBe("fill_reference")
  })

  it("detects generation and quality commands", () => {
    expect(detectAimWorkbenchCommand("重新生成这一版")?.id).toBe("regenerate")
    expect(detectAimWorkbenchCommand("优化下开头")?.id).toBe("optimize_opening")
    expect(detectAimWorkbenchCommand("把他的人设IP故事自然融入这版文案")?.id).toBe("revise_current_draft")
    expect(detectAimWorkbenchCommand("别越改越短，保持原稿长度")?.id).toBe("revise_current_draft")
    expect(detectAimWorkbenchCommand("按原文字数重新改写")?.id).toBe("rewrite_benchmark")
    expect(detectAimWorkbenchCommand("检查一下有没有照抄")?.id).toBe("run_quality_check")
  })

  it("detects memory commands without swallowing normal chat", () => {
    expect(detectAimWorkbenchCommand("记住这个偏好")?.id).toBe("remember_preference")
    expect(detectAimWorkbenchCommand("清空当前对话")?.id).toBe("reset_conversation")
    expect(detectAimWorkbenchCommand("帮我改得更口语化")).toBeNull()
  })

  it("does not treat long source material as a workbench command", () => {
    const longMeetingNote = `
第一部分：视频脚本模板
模板一：Vlog纪实类（项目施工日常）
关键原则
●痛点前置：痛点必须前置。
●结果后置：提高成本是结果，要放在结尾说。
模板四：Vlog纪实五步结构法（通用骨架）
五步法的三条铁律
●痛点前置
●结果后置
●对赌收尾
`.trim()

    expect(detectAimWorkbenchCommand(longMeetingNote)).toBeNull()
  })
})
