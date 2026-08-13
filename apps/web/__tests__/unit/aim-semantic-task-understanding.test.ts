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

  it("repairs an incomplete protocol once without changing the current request", async () => {
    const complete = vi.fn()
      .mockResolvedValueOnce({ content: "用户要基于现有材料写一篇供暖口播。" })
      .mockResolvedValueOnce({
        content: "[[AIM_HANDLING:deliver]]\n[[AIM_TASK_BRIEF]]\n基于现有材料交付一篇可直接使用的供暖口播。\n[[/AIM_TASK_BRIEF]]",
      })

    const result = await understandAimContentTurn({
      envelope: {
        currentUserRequest: "按这些材料写一篇供暖口播",
        relevantConversation: [],
        referenceMaterials: [],
      },
      complete,
    })

    expect(result).toEqual({
      handling: "deliver",
      brief: "基于现有材料交付一篇可直接使用的供暖口播。",
    })
    expect(complete).toHaveBeenCalledTimes(2)
    expect(complete.mock.calls[1]?.[1]).toContain("按这些材料写一篇供暖口播")
    expect(complete.mock.calls[1]?.[1]).toContain("用户要基于现有材料写一篇供暖口播")
  })

  it("repairs a malformed clarification protocol once", async () => {
    const complete = vi.fn()
      .mockResolvedValueOnce({
        content: "[[AIM_HANDLING:clarify]]\n[[AIM_TASK_BRIEF]]需要确认对象。[[/AIM_TASK_BRIEF]]",
      })
      .mockResolvedValueOnce({
        content: "[[AIM_HANDLING:clarify]]\n[[AIM_TASK_BRIEF]]需要确认对象。[[/AIM_TASK_BRIEF]]\n[[AIM_CLARIFICATION]]你要修改当前编辑器里的稿子吗？[[/AIM_CLARIFICATION]]",
      })

    const result = await understandAimContentTurn({
      envelope: {
        currentUserRequest: "帮我改一下这个",
        relevantConversation: [],
        referenceMaterials: [],
      },
      complete,
    })

    expect(result.handling).toBe("clarify")
    expect(result.clarificationQuestion).toContain("当前编辑器")
    expect(complete).toHaveBeenCalledTimes(2)
  })

  it("falls back to the user's explicit new-copy request when both protocols are invalid", async () => {
    const complete = vi.fn().mockResolvedValue({ content: "我理解了，开始创作。" })
    const request = "参考这个文案给罗老板写一个新的文案"

    const result = await understandAimContentTurn({
      envelope: {
        currentUserRequest: request,
        relevantConversation: [],
        currentArtifact: { content: "这是一篇供参考的原文。" },
        referenceMaterials: [],
      },
      complete,
    })

    expect(result).toEqual({ handling: "deliver", brief: request })
    expect(complete).toHaveBeenCalledTimes(2)
  })

  it("recognizes the concise production wording seen in the live failure", async () => {
    const complete = vi.fn().mockResolvedValue({ content: "收到。" })
    const request = "参考这个给葛老板写一个"

    const result = await understandAimContentTurn({
      envelope: {
        currentUserRequest: request,
        relevantConversation: [],
        referenceMaterials: [{ title: "用户参考原文", content: "参考文案正文" }],
      },
      complete,
    })

    expect(result).toEqual({ handling: "deliver", brief: request })
  })

  it("does not turn an analysis question into content delivery when protocols fail", async () => {
    const complete = vi.fn().mockResolvedValue({ content: "这篇是故事结构。" })

    await expect(understandAimContentTurn({
      envelope: {
        currentUserRequest: "这个文案是什么结构？",
        relevantConversation: [],
        currentArtifact: { content: "参考正文" },
        referenceMaterials: [],
      },
      complete,
    })).rejects.toThrow("语义理解协议不完整")
  })

  it("keeps a polite but explicit creation request as delivery", async () => {
    const complete = vi.fn().mockResolvedValue({ content: "好的。" })
    const request = "你能帮我写一个文案吗？"

    await expect(understandAimContentTurn({
      envelope: {
        currentUserRequest: request,
        relevantConversation: [],
        referenceMaterials: [],
      },
      complete,
    })).resolves.toEqual({ handling: "deliver", brief: request })
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
