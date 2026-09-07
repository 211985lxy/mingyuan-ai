import { describe, expect, it, vi } from "vitest"

const { prepareAimGenerateRequest, executePreparedAimGeneration } = vi.hoisted(() => ({
  prepareAimGenerateRequest: vi.fn(),
  executePreparedAimGeneration: vi.fn(),
}))

vi.mock("@/lib/aim/services/generate-request", () => ({
  prepareAimGenerateRequest,
  executePreparedAimGeneration,
}))

import {
  executeVerifiedUnifiedDelivery,
  executeVerifiedUnifiedReply,
} from "@/lib/aim/services/unified-content-execution"

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

  it("updates the provisional history row when producing the deliverable", async () => {
    prepareAimGenerateRequest.mockResolvedValue({ ok: true, parsed: {}, trace: undefined })
    executePreparedAimGeneration.mockResolvedValue({ generationId: "web_attempt" })

    await executeVerifiedUnifiedDelivery({
      userId: "user-1",
      generationAttemptId: "web_0123456789abcdef01234567",
      parsed: {
        agentId: "content_producer",
        projectId: "project-1",
        sourceEnvelope: {
          currentUserRequest: "按对标材料生成文案",
          relevantConversation: [],
          referenceMaterials: [],
        },
        targetFormats: ["video_script"],
      },
      understanding: { handling: "deliver", brief: "生成一篇新文案" },
    })

    expect(prepareAimGenerateRequest).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        existingGenerationId: "web_0123456789abcdef01234567",
      }),
      expect.any(Object),
    )
    expect(executePreparedAimGeneration).toHaveBeenCalledOnce()
  })
})
