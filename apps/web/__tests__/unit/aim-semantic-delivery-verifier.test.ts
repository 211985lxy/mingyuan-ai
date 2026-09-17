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

  it("does not start another round once the budget gate says stop", async () => {
    const execute = vi.fn().mockResolvedValue("未合格候选")
    const verify = vi.fn().mockResolvedValue({ passed: false, gaps: ["交付不完整"] })
    // 第 1 轮（attempt=1）开工前预算已不够：必须直接收手，不能再跑第二、第三轮。
    const beforeRound = vi.fn((attempt: number) => {
      if (attempt > 0) throw new Error("剩余预算不足以再完成一轮返工")
    })

    await expect(runAimSemanticRevisionLoop({ execute, verify, maxRevisions: 2, beforeRound }))
      .rejects.toThrow("剩余预算不足以再完成一轮返工")
    expect(beforeRound).toHaveBeenCalledWith(1)
    // 只跑了第 0 轮：返工轮一次都没启动（否则用户剩下的等待就白烧了）。
    expect(execute).toHaveBeenCalledTimes(1)
    expect(verify).toHaveBeenCalledTimes(1)
  })

  it("keeps revising while the budget gate allows it", async () => {
    const execute = vi.fn().mockResolvedValueOnce("只有开头").mockResolvedValueOnce("完整脚本")
    const verify = vi.fn()
      .mockResolvedValueOnce({ passed: false, gaps: ["缺完整正文"] })
      .mockResolvedValueOnce({ passed: true })
    const beforeRound = vi.fn()

    await expect(runAimSemanticRevisionLoop({ execute, verify, maxRevisions: 2, beforeRound }))
      .resolves.toBe("完整脚本")
    expect(beforeRound).toHaveBeenCalledTimes(1)
    expect(beforeRound).toHaveBeenCalledWith(1)
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
