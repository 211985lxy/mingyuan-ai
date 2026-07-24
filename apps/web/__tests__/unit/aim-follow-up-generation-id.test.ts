import { describe, expect, it } from "vitest"

import { resolveFollowUpGenerationId } from "@/hooks/use-aim-generation-actions"
import type { AimWorkbenchMessage } from "@/lib/aim/workbench-types"

function messageWithDeliverable(id: string, generationId: string): AimWorkbenchMessage {
  return {
    id,
    role: "assistant",
    content: "交付物已生成",
    deliverables: {
      id: generationId,
      results: [{ format: "video_script", content: "口播稿", wordCount: 3 }],
      knowledgeUsed: [],
    },
  }
}

describe("resolveFollowUpGenerationId", () => {
  it("reuses the latest deliverable id when continuing the same task", () => {
    const messages: AimWorkbenchMessage[] = [
      { id: "u1", role: "user", content: "写一篇口播" },
      messageWithDeliverable("a1", "gen-old"),
      { id: "u2", role: "user", content: "改短一点" },
      messageWithDeliverable("a2", "gen-latest"),
    ]

    expect(resolveFollowUpGenerationId(false, messages)).toBe("gen-latest")
    expect(resolveFollowUpGenerationId(undefined, messages)).toBe("gen-latest")
  })

  it("does not reuse an id when starting a new task", () => {
    const messages: AimWorkbenchMessage[] = [
      messageWithDeliverable("a1", "gen-1"),
    ]

    expect(resolveFollowUpGenerationId(true, messages)).toBeUndefined()
  })

  it("returns undefined when there is no deliverable yet", () => {
    const messages: AimWorkbenchMessage[] = [
      { id: "u1", role: "user", content: "先聊聊选题" },
      { id: "a1", role: "assistant", content: "好的" },
    ]

    expect(resolveFollowUpGenerationId(false, messages)).toBeUndefined()
  })
})
