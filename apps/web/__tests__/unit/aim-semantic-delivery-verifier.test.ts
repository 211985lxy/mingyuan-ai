import { describe, expect, it, vi } from "vitest"

import {
  parseAimSemanticDeliveryVerdict,
  runAimSemanticRevisionLoop,
  verifyAimDelivery,
} from "@/lib/aim/semantic-delivery-verifier"

describe("semantic delivery verifier", () => {
  it("parses concrete gaps without an action classification", () => {
    expect(parseAimSemanticDeliveryVerdict(`
[[AIM_VERDICT:REVISE]]
[[AIM_GAPS]]
- 用户要20篇完整脚本，候选只给了20个开头。
- 每篇缺少正文和结尾引导。
[[/AIM_GAPS]]`)).toEqual({
      passed: false,
      gaps: ["用户要20篇完整脚本，候选只给了20个开头。", "每篇缺少正文和结尾引导。"],
    })
  })

  it("revises at most twice and returns only a passed candidate", async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce("只有开头")
      .mockResolvedValueOnce("仍然只有开头")
      .mockResolvedValueOnce("20篇完整脚本")
    const verify = vi.fn()
      .mockResolvedValueOnce({ passed: false, gaps: ["缺完整正文"] })
      .mockResolvedValueOnce({ passed: false, gaps: ["仍然不完整"] })
      .mockResolvedValueOnce({ passed: true })

    await expect(runAimSemanticRevisionLoop({ execute, verify, maxRevisions: 2 }))
      .resolves.toBe("20篇完整脚本")
    expect(execute).toHaveBeenCalledTimes(3)
  })

  it("fails closed after two rejected revisions", async () => {
    const execute = vi.fn().mockResolvedValue("未合格候选")
    const verify = vi.fn().mockResolvedValue({ passed: false, gaps: ["交付不完整"] })

    await expect(runAimSemanticRevisionLoop({ execute, verify, maxRevisions: 2 }))
      .rejects.toThrow("连续修正后仍未完成当前要求")
    expect(execute).toHaveBeenCalledTimes(3)
  })

  it("rejects a missing-body provider stub without calling the LLM verifier", async () => {
    const complete = vi.fn().mockResolvedValue({ content: "[[AIM_VERDICT:PASS]]" })
    await expect(verifyAimDelivery({
      envelope: { currentUserRequest: "出一版抖音口播", relevantConversation: [], referenceMaterials: [] },
      candidate: "模型服务暂时未能返回完整正文，素材和要求已保留。点击重试会自动更换线路。",
      agentId: "content_producer",
      complete,
    })).resolves.toEqual({
      passed: false,
      gaps: ["候选没有完整正文，不能把线路失败说明当成交付"],
    })
    expect(complete).not.toHaveBeenCalled()
  })

  it("rejects an analysis-plan candidate without calling the LLM verifier", async () => {
    const complete = vi.fn().mockResolvedValue({ content: "[[AIM_VERDICT:PASS]]" })
    const analysis = `好的老板。本轮输入只锁定了结构、没锁定具体主题素材，我按最贴近该结构服务场景的选题假设交付一版口播成稿，缺口位置已如实标注。

1. 目标判定
- businessGoal：lead（获客）。依据：用户本轮显式要求仿写「3秒抛冲突→身份认同`
    await expect(verifyAimDelivery({
      envelope: { currentUserRequest: "参考对标结构仿写一条脚本", relevantConversation: [], referenceMaterials: [] },
      candidate: analysis,
      agentId: "content_producer",
      complete,
    })).resolves.toEqual({
      passed: false,
      gaps: ["候选是分析方案或任务复述，不是可直接使用的脚本正文"],
    })
    expect(complete).not.toHaveBeenCalled()
  })

  it("gives the verifier source-labeled conversation and references", async () => {
    const complete = vi.fn().mockResolvedValue({ content: "[[AIM_VERDICT:PASS]]" })
    await verifyAimDelivery({
      envelope: {
        currentUserRequest: "按框架写完整脚本",
        relevantConversation: [{ role: "user", content: "上轮只改开头" }],
        referenceMaterials: [{ title: "六种框架", content: "故事型：目标到结果" }],
      },
      candidate: "完整脚本",
      agentId: "content_producer",
      complete,
    })

    expect(complete.mock.calls[0][1]).toContain("【最近相关对话】")
    expect(complete.mock.calls[0][1]).toContain("【参考材料：六种框架】")
  })
})
