import { describe, expect, it } from "vitest"

import {
  getAimHistoryContents,
  mapAimGenerationToDeliverables,
  patchDeliverableWorkflowFields,
} from "@/lib/aim/workbench-helpers"
import type { AimGeneration } from "@/lib/api/client"
import type { AimWorkbenchMessage } from "@/lib/aim/workbench-types"

function generation(partial: Partial<AimGeneration> = {}): AimGeneration {
  return {
    id: "gen_1",
    rawInput: "母内容输入",
    videoScript: "口播正文".padEnd(40, "。"),
    wechatArticle: null,
    momentsPost: null,
    communityMessage: null,
    shootingBrief: null,
    rawCopy: null,
    formatsRequested: ["video_script"],
    knowledgeUsed: [{ id: "k1", title: "案例", category: "case_study" }],
    createdAt: "2026-07-23T00:00:00.000Z",
    workflowStatus: "pending_review",
    projectId: "proj_1",
    publishPlatform: null,
    publishUrl: null,
    reviewNote: "先过审",
    taskSpec: {
      contentPackage: {
        schemaVersion: 1,
        canonicalGenerationId: "gen_1",
        requestedFormats: ["video_script", "xiaohongshu_post"],
        completedFormats: ["video_script", "xiaohongshu_post"],
        failedFormats: [],
        knowledgeUsed: [],
        artifacts: {
          xiaohongshu_post: "小红书图文正文".padEnd(40, "！"),
        },
      },
    } as AimGeneration["taskSpec"],
    ...partial,
  }
}

describe("mapAimGenerationToDeliverables", () => {
  it("maps workflowStatus and publish fields into deliverables for UI status select", () => {
    const deliverables = mapAimGenerationToDeliverables(generation())
    expect(deliverables.workflowStatus).toBe("pending_review")
    expect(deliverables.projectId).toBe("proj_1")
    expect(deliverables.reviewNote).toBe("先过审")
    expect(deliverables.knowledgeUsed).toEqual([{
      id: "k1",
      title: "案例",
      category: "case_study",
      categoryLabel: "case_study",
    }])
    expect(deliverables.results.map((item) => item.format)).toEqual(
      expect.arrayContaining(["video_script", "xiaohongshu_post"]),
    )
  })

  it("defaults missing workflowStatus to draft", () => {
    const deliverables = mapAimGenerationToDeliverables(generation({ workflowStatus: undefined }))
    expect(deliverables.workflowStatus).toBe("draft")
  })
})

describe("getAimHistoryContents", () => {
  it("includes contentPackage artifacts such as xiaohongshu_post", () => {
    const contents = getAimHistoryContents(generation({ videoScript: null }))
    expect(contents).toEqual([
      { format: "xiaohongshu_post", content: expect.stringContaining("小红书图文正文") },
    ])
  })
})

describe("patchDeliverableWorkflowFields", () => {
  it("updates matching message deliverables in place after status change", () => {
    const messages: AimWorkbenchMessage[] = [
      {
        id: "m1",
        role: "assistant",
        content: "ok",
        deliverables: {
          id: "gen_1",
          results: [{ format: "video_script", content: "x", wordCount: 1 }],
          knowledgeUsed: [],
          workflowStatus: "draft",
        },
      },
      { id: "m2", role: "user", content: "hi" },
    ]
    const next = patchDeliverableWorkflowFields(messages, "gen_1", {
      workflowStatus: "ready_to_publish",
      publishPlatform: "抖音",
      publishUrl: "https://example.com",
    })
    expect(next[0].deliverables?.workflowStatus).toBe("ready_to_publish")
    expect(next[0].deliverables?.publishPlatform).toBe("抖音")
    expect(next[0].deliverables?.publishUrl).toBe("https://example.com")
    expect(next[1]).toEqual(messages[1])
  })
})
