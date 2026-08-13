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
