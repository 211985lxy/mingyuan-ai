import { describe, expect, it, vi } from "vitest"

import { executeVerifiedUnifiedReply } from "@/lib/aim/services/unified-content-execution"

describe("unified content execution", () => {
  it("returns a verified answer without creating a deliverable", async () => {
    const complete = vi.fn().mockResolvedValue({
      content: "===FORMAT:raw_copy===\n这是‘冲突—原因—行动’结构。",
    })
    const verify = vi.fn().mockResolvedValue({ passed: true })

    await expect(executeVerifiedUnifiedReply({
      userId: "user-1",
      parsed: {
        agentId: "content_producer",
        sourceEnvelope: {
          currentUserRequest: "这篇文案是什么结构？",
          relevantConversation: [],
          currentArtifact: { content: "先给冲突，再解释原因，最后行动。" },
          referenceMaterials: [],
        },
        targetFormats: ["video_script"],
      },
      understanding: { handling: "respond", brief: "回答当前文案的结构" },
      ports: { complete, verify },
    })).resolves.toBe("这是‘冲突—原因—行动’结构。")
    expect(complete).toHaveBeenCalledOnce()
    expect(verify).toHaveBeenCalledOnce()
  })

  it("fails closed instead of returning an unverified answer", async () => {
    const complete = vi.fn().mockResolvedValue({ content: "===FORMAT:raw_copy===\n任务复述" })
    const verify = vi.fn().mockResolvedValue({ passed: false, gaps: ["没有回答问题"] })

    await expect(executeVerifiedUnifiedReply({
      userId: "user-1",
      parsed: {
        sourceEnvelope: {
          currentUserRequest: "这篇文案是什么结构？",
          relevantConversation: [],
          referenceMaterials: [],
        },
        targetFormats: ["video_script"],
      },
      understanding: { handling: "respond", brief: "回答结构" },
      ports: { complete, verify },
    })).rejects.toThrow("连续修正后仍未完成当前要求")
    expect(complete).toHaveBeenCalledTimes(3)
  })
})
