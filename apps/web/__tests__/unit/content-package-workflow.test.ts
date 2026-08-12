import { describe, expect, it } from "vitest"

import { getContentOperatingReadiness, suggestWorkflowAfterContentPackageComplete } from "@/lib/aim/content-package-workflow"
import type { TaskSpec } from "@/lib/task-spec"

function taskSpec(partial: {
  requested: string[]
  completed: string[]
  failed?: Array<{ format: string; reason: string }>
}): TaskSpec {
  return {
    goal: "建立咨询信任",
    targetCustomer: "企业创始人",
    contentTask: "建立专业信任",
    knownFacts: [{ statement: "真实客户问题", source: "访谈" }],
    desiredAction: "预约诊断",
    contentPackage: {
      schemaVersion: 1,
      canonicalGenerationId: "gen_1",
      requestedFormats: partial.requested,
      completedFormats: partial.completed,
      failedFormats: partial.failed ?? [],
      knowledgeUsed: [],
    },
  } as unknown as TaskSpec
}

describe("suggestWorkflowAfterContentPackageComplete", () => {
  it("requires the operating brief before content can be marked publishable", () => {
    const readiness = getContentOperatingReadiness({
      goal: "Explain the offer",
      knownFacts: [],
      unknowns: [],
      assumptions: [],
    } as unknown as TaskSpec)
    expect(readiness.ready).toBe(false)
    expect(readiness.missing).toEqual(expect.arrayContaining(["目标客户", "内容任务", "真实证据", "期望行动"]))
  })

  it("suggests pending_review when package is complete from draft", () => {
    const suggestion = suggestWorkflowAfterContentPackageComplete({
      currentStatus: "draft",
      taskSpec: taskSpec({
        requested: ["video_script", "moments_post"],
        completed: ["video_script", "moments_post"],
      }),
    })
    expect(suggestion).toEqual({
      shouldAdvance: true,
      from: "draft",
      to: "pending_review",
      reason: expect.stringContaining("待审核"),
    })
  })

  it("does not skip human review by jumping to ready_to_publish", () => {
    const suggestion = suggestWorkflowAfterContentPackageComplete({
      currentStatus: "draft",
      taskSpec: taskSpec({
        requested: ["video_script", "wechat_article"],
        completed: ["video_script", "wechat_article"],
      }),
    })
    expect(suggestion?.to).toBe("pending_review")
  })

  it("returns null when package incomplete or already past review", () => {
    expect(suggestWorkflowAfterContentPackageComplete({
      currentStatus: "draft",
      taskSpec: taskSpec({
        requested: ["video_script", "moments_post"],
        completed: ["video_script"],
      }),
    })).toBeNull()

    expect(suggestWorkflowAfterContentPackageComplete({
      currentStatus: "pending_review",
      taskSpec: taskSpec({
        requested: ["video_script", "moments_post"],
        completed: ["video_script", "moments_post"],
      }),
    })).toBeNull()
  })
})
