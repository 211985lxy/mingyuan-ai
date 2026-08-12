import { describe, expect, it } from "vitest"

import { formatPublishPackText } from "@/lib/aim/publish-pack"
import type { TaskSpec } from "@/lib/task-spec"

const taskSpec = {
  canonical: {
    schemaVersion: 1,
    status: "confirmed",
    coreMessage: "用真实案例证明交付可复制",
    targetCustomer: "本地服务老板",
    realProblem: "内容有流量没线索",
    contentGoal: "获客",
    evidence: [],
    desiredAction: "加微预约诊断",
    mustKeep: ["真实成交数字"],
    avoid: ["夸张承诺"],
    missingEvidence: [],
    versionHistory: [],
  },
  contentPackage: {
    schemaVersion: 1,
    canonicalGenerationId: "gen_1",
    requestedFormats: ["video_script", "xiaohongshu_post"],
    completedFormats: ["video_script", "xiaohongshu_post"],
    failedFormats: [],
    knowledgeUsed: [],
  },
  production: {
    schemaVersion: 1,
    kind: "shooting_handoff",
    adapter: "manual",
    status: "prepared",
    sourceGenerationId: "gen_1",
    evidenceRef: "manual-handoff:gen_1",
    updatedAt: "2026-08-12T00:00:00.000Z",
  },
} as unknown as TaskSpec

describe("formatPublishPackText", () => {
  it("includes mother content, platform summaries, review note and publish link slots", () => {
    const text = formatPublishPackText({
      generationId: "gen_1",
      topicTitle: "案例拆解",
      taskSpec,
      results: [
        { format: "video_script", content: "口播正文第一行\n第二行" },
        { format: "xiaohongshu_post", content: "小红书图文开头" },
        { format: "shooting_brief", content: "景别：近景" },
      ],
      publishPlatform: "抖音",
      publishUrl: "",
      reviewNote: "事实已核对",
    })

    expect(text).toContain("【母内容要点】")
    expect(text).toContain("用真实案例证明交付可复制")
    expect(text).toContain("【多平台成稿摘要】")
    expect(text).toContain("口播文案")
    expect(text).toContain("小红书图文")
    expect(text).toContain("【人工审核备注】")
    expect(text).toContain("事实已核对")
    expect(text).toContain("【发布链接位】")
    expect(text).toContain("（发布后回填）")
    expect(text).toContain("【素材/拍摄交接】")
    expect(text).toContain("景别：近景")
    expect(text).toContain("生产方式：人工交接")
    expect(text).toContain("未产生可交付视频")
  })
})
