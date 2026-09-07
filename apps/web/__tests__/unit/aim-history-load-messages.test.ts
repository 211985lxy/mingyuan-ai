import { describe, expect, it } from "vitest"

import { buildAimHistoryLoadMessages } from "@/lib/aim/history-load-messages"
import type { AimGeneration } from "@/lib/api/client"

function generation(partial: Partial<AimGeneration> = {}): AimGeneration {
  return {
    id: "gen_empty",
    rawInput: "从爆款拆解带入的口播主题",
    videoScript: null,
    wechatArticle: null,
    momentsPost: null,
    communityMessage: null,
    shootingBrief: null,
    rawCopy: null,
    formatsRequested: ["video_script"],
    knowledgeUsed: [],
    createdAt: "2026-09-07T08:00:00.000Z",
    ...partial,
  }
}

describe("buildAimHistoryLoadMessages", () => {
  it("keeps running, awaiting_input and failed tasks even when results are empty", () => {
    for (const status of ["running", "awaiting_input", "failed"] as const) {
      const { messages, contents } = buildAimHistoryLoadMessages(generation({
        status,
        errorMessage: status === "failed" ? "模型超时" : null,
      }), "assistant-1")
      expect(contents).toEqual([])
      const assistant = messages.find((message) => message.role === "assistant")
      expect(assistant?.deliverables?.id).toBe("gen_empty")
      expect(assistant?.deliverables?.results).toEqual([])
      if (status === "failed") {
        expect(assistant?.failure?.kind).toBe("generate")
      }
      if (status === "running") {
        expect(assistant?.pendingGeneration).toBe(true)
      }
      if (status === "awaiting_input") {
        expect(assistant?.content).toMatch(/^在动笔前先确认/)
      }
    }
  })
})
