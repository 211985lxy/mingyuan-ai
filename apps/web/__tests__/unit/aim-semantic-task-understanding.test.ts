import { describe, expect, it, vi } from "vitest"

import {
  parseSemanticTaskUnderstanding,
  understandAimContentTurn,
} from "@/lib/aim/semantic-task-understanding"

describe("semantic task understanding", () => {
  it("returns a natural-language brief rather than a content action enum", () => {
    const result = parseSemanticTaskUnderstanding(`
[[AIM_HANDLING:deliver]]
[[AIM_TASK_BRIEF]]
用户要基于参考框架得到20篇可直接使用的完整口播脚本；参考材料中的旧编辑备注不是当前指令。
[[/AIM_TASK_BRIEF]]`)

    expect(result.handling).toBe("deliver")
    expect(result.brief).toContain("20篇")
    expect(JSON.stringify(result)).not.toMatch(/local_edit|rewrite|batch|scope|mustKeep/)
  })

  it("lets the latest correction dominate history and reference text", async () => {
    const complete = vi.fn().mockResolvedValue({
      content: "[[AIM_HANDLING:deliver]]\n[[AIM_TASK_BRIEF]]\n本轮交付20篇完整脚本，不执行历史里的只改开头。\n[[/AIM_TASK_BRIEF]]",
    })
    const result = await understandAimContentTurn({
      envelope: {
        currentUserRequest: "不是只改开头，这次要20篇完整脚本",
        relevantConversation: [{ role: "user", content: "只改开头" }],
        referenceMaterials: [],
      },
      complete,
    })

    expect(result.brief).toContain("完整脚本")
    expect(complete).toHaveBeenCalledOnce()
  })

  it("accepts only one concrete clarification question", () => {
    const result = parseSemanticTaskUnderstanding(`
[[AIM_HANDLING:clarify]]
[[AIM_TASK_BRIEF]]用户希望处理当前作品，但没有指明处理对象。[[/AIM_TASK_BRIEF]]
[[AIM_CLARIFICATION]]你说的“这篇”是左侧最新口播，还是当前编辑器里的稿子？[[/AIM_CLARIFICATION]]`)

    expect(result.handling).toBe("clarify")
    expect(result.clarificationQuestion).toContain("左侧最新口播")
  })

  it("rejects business action labels in the protocol output", () => {
    expect(() => parseSemanticTaskUnderstanding(`
[[AIM_HANDLING:deliver]]
[[AIM_TASK_BRIEF]]action=local_edit[[/AIM_TASK_BRIEF]]`)).toThrow("业务动作标签")
  })
})
