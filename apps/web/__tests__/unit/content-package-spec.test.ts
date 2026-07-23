import { describe, expect, it } from "vitest"

import {
  CONTENT_PACKAGE_FORMATS,
  buildContentPackageConstraintBlock,
  buildContentPackageSpec,
  contentFormatToColumn,
  getContentPackageFromTaskSpec,
  normalizeContentPackageFormats,
  parseContentPackageSpec,
  withContentPackageOnTaskSpec,
} from "@/lib/content-package-spec"
import type { TaskSpec } from "@/lib/task-spec"

function baseTaskSpec(): TaskSpec {
  return {
    goal: "多平台派生",
    mode: "direct_delivery",
    riskLevel: "low",
    knownFacts: [],
    unknowns: [],
    assumptions: [],
    nextAction: "生成",
    classifiedBy: "rule",
    classifiedAt: "2026-07-23T00:00:00.000Z",
  }
}

describe("content package formats", () => {
  it("defines the five first-batch package formats", () => {
    expect([...CONTENT_PACKAGE_FORMATS]).toEqual([
      "video_script",
      "xiaohongshu_post",
      "wechat_article",
      "moments_post",
      "shooting_brief",
    ])
  })

  it("normalizes koubo to video_script and dedupes", () => {
    expect(
      normalizeContentPackageFormats([
        "koubo_script",
        "video_script",
        "moments_post",
        "moments_post",
        "community_message",
      ]),
    ).toEqual(["video_script", "moments_post"])
  })

  it("maps formats to AimGeneration columns except xiaohongshu", () => {
    expect(contentFormatToColumn("video_script")).toBe("videoScript")
    expect(contentFormatToColumn("wechat_article")).toBe("wechatArticle")
    expect(contentFormatToColumn("xiaohongshu_post")).toBeNull()
  })
})

describe("buildContentPackageSpec", () => {
  it("marks empty formats as failed and keeps successful ones", () => {
    const pkg = buildContentPackageSpec({
      canonicalGenerationId: "gen-1",
      requestedFormats: ["moments_post", "wechat_article", "shooting_brief"],
      parsed: {
        moments_post: "这是一条足够长的朋友圈文案，带一点场景和行动。",
        wechat_article: "",
        shooting_brief: "短",
      },
      knowledgeUsed: [{ id: "k1", title: "案例", category: "project_case" }],
      now: "2026-07-23T12:00:00.000Z",
    })

    expect(pkg.schemaVersion).toBe(1)
    expect(pkg.completedFormats).toEqual(["moments_post"])
    expect(pkg.failedFormats.map((item) => item.format).sort()).toEqual([
      "shooting_brief",
      "wechat_article",
    ])
    expect(pkg.knowledgeUsed[0]?.id).toBe("k1")
  })

  it("merges retry results without dropping earlier completed formats", () => {
    const first = buildContentPackageSpec({
      canonicalGenerationId: "gen-1",
      requestedFormats: ["moments_post", "wechat_article"],
      parsed: {
        moments_post: "这是一条足够长的朋友圈文案，带一点场景和行动。",
        wechat_article: "",
      },
    })
    const retried = buildContentPackageSpec({
      canonicalGenerationId: "gen-1",
      requestedFormats: ["wechat_article"],
      parsed: {
        wechat_article: "这是一篇足够长的公众号正文，用来补上刚才失败的格式。",
      },
      previous: first,
    })

    expect(retried.completedFormats.sort()).toEqual(["moments_post", "wechat_article"])
    expect(retried.failedFormats).toEqual([])
  })

  it("stores xiaohongshu in artifacts for refresh recovery", () => {
    const pkg = buildContentPackageSpec({
      canonicalGenerationId: "gen-1",
      requestedFormats: ["xiaohongshu_post"],
      parsed: {
        xiaohongshu_post: "标题：真实案例\n\n这是小红书正文，分段写清楚收藏点。",
      },
    })
    expect(pkg.completedFormats).toEqual(["xiaohongshu_post"])
    expect(pkg.artifacts?.xiaohongshu_post).toContain("真实案例")
  })

  it("builds platform constraint block for selected formats", () => {
    const block = buildContentPackageConstraintBlock(["moments_post", "shooting_brief"])
    expect(block).toContain("内容包平台契约")
    expect(block).toContain("朋友圈")
    expect(block).toContain("拍摄交接单")
    expect(block).toContain("禁止复制同一正文只换标题")
  })

  it("round-trips through taskSpec.contentPackage", () => {
    const pkg = buildContentPackageSpec({
      canonicalGenerationId: "gen-9",
      requestedFormats: ["moments_post"],
      parsed: { moments_post: "这是一条足够长的朋友圈文案，带一点场景和行动。" },
    })
    const taskSpec = withContentPackageOnTaskSpec(baseTaskSpec(), pkg)
    expect(getContentPackageFromTaskSpec(taskSpec)?.canonicalGenerationId).toBe("gen-9")
    expect(parseContentPackageSpec({ schemaVersion: 2 })).toBeNull()
  })
})
