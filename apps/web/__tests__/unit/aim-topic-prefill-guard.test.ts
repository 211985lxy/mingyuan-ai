import { describe, expect, it } from "vitest"

import { mergeAimGenerationIntoMessages } from "@/hooks/use-aim-generation-actions"
import { shouldApplyAimTopicPrefill } from "@/hooks/use-aim-route-sync"
import type { AimWorkbenchMessage } from "@/lib/aim/workbench-types"

describe("shouldApplyAimTopicPrefill", () => {
  it("does not clear the workbench when URL only has projectId", () => {
    expect(shouldApplyAimTopicPrefill({
      topicTitle: null,
      topicRationale: null,
      idea: null,
    })).toBe(false)
  })

  it("applies when topic or idea prefill is present", () => {
    expect(shouldApplyAimTopicPrefill({
      topicTitle: "机器人失业",
      topicRationale: null,
      idea: null,
    })).toBe(true)
    expect(shouldApplyAimTopicPrefill({
      topicTitle: null,
      topicRationale: "有冲突",
      idea: null,
    })).toBe(true)
    expect(shouldApplyAimTopicPrefill({
      topicTitle: null,
      topicRationale: null,
      idea: "换个角度",
    })).toBe(true)
  })

  it("ignores blank prefill strings", () => {
    expect(shouldApplyAimTopicPrefill({
      topicTitle: "  ",
      topicRationale: "",
      idea: null,
    })).toBe(false)
  })
})

describe("mergeAimGenerationIntoMessages", () => {
  const deliverables = {
    id: "gen-1",
    results: [{ format: "video_script" as const, content: "口播正文", wordCount: 4 }],
    knowledgeUsed: [],
  }

  it("re-inserts the assistant bubble when the pending message was wiped", () => {
    const next = mergeAimGenerationIntoMessages([], "assistant-1", {
      content: "内容创作官 交付物已生成",
      agentId: "content_producer",
      deliverables,
      regenerating: false,
      failure: null,
    })

    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({
      id: "assistant-1",
      role: "assistant",
      deliverables,
    })
  })

  it("updates the existing pending bubble in place", () => {
    const messages: AimWorkbenchMessage[] = [
      { id: "user-1", role: "user", content: "写一篇" },
      { id: "assistant-1", role: "assistant", content: "正在生成…" },
    ]
    const next = mergeAimGenerationIntoMessages(messages, "assistant-1", {
      content: "交付物已生成",
      agentId: "content_producer",
      deliverables,
      regenerating: false,
      failure: null,
    })

    expect(next).toHaveLength(2)
    expect(next[1]).toMatchObject({
      id: "assistant-1",
      content: "交付物已生成",
      deliverables,
    })
  })
})
