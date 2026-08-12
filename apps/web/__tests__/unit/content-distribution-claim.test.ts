import { describe, expect, it, vi } from "vitest"

import {
  buildContentDistributionClaimDraft,
  buildFeishuWorkItemOpenUrl,
} from "@/lib/aim/content-distribution-claim"
import { submitContentDistributionClaim } from "@/lib/aim/content-distribution-claim-submit"
import type { TaskSpec } from "@/lib/task-spec"

const taskSpec = {
  canonical: {
    schemaVersion: 1,
    status: "confirmed",
    coreMessage: "总部生产、门店领取同款内容包",
    targetCustomer: "连锁门店",
    realProblem: "分发靠微信群转发",
    contentGoal: "获客",
    evidence: [],
    desiredAction: "领取后按时发布",
    mustKeep: [],
    avoid: [],
    missingEvidence: [],
    versionHistory: [],
  },
  contentPackage: {
    schemaVersion: 1,
    canonicalGenerationId: "gen_claim",
    requestedFormats: ["video_script", "moments_post"],
    completedFormats: ["video_script", "moments_post"],
    failedFormats: [],
    knowledgeUsed: [],
  },
} as unknown as TaskSpec

describe("buildContentDistributionClaimDraft", () => {
  it("builds a copyable Feishu claim draft for content growth workflow", () => {
    const draft = buildContentDistributionClaimDraft({
      generationId: "gen_claim",
      projectId: "proj_1",
      projectName: "试点客户 A",
      taskSpec,
      aimBaseUrl: "https://aim.example.com",
      publishUrl: null,
      publishPlatform: "抖音",
    })

    expect(draft.workflow).toBe("内容增长")
    expect(draft.status).toBe("待处理")
    expect(draft.contentPackageName).toContain("总部生产")
    expect(draft.projectId).toBe("proj_1")
    expect(draft.platforms).toEqual(["短视频口播", "朋友圈文案"])
    expect(draft.reviewStatus).toBe("母内容已确认")
    expect(draft.aimContentLink).toBe("https://aim.example.com/aim?generationId=gen_claim")
    expect(draft.publishLink).toBe("（发布后回填）")
    expect(draft.plainText).toContain("【飞书领取事项草稿·内容增长】")
    expect(draft.plainText).toContain("试点客户 A")
    expect(draft.plainText).toContain("AiM 保存内容与结果正本")
    expect(draft.feishuFields["工作流"]).toBe("内容增长")
    expect(draft.feishuFields["状态"]).toBe("待处理")
    expect(draft.feishuFields["AIM结果ID"]).toBe("gen_claim")
    expect(draft.idempotencyKey).toBe("content-claim:gen_claim")
  })

  it("falls back when project and canonical are missing", () => {
    const draft = buildContentDistributionClaimDraft({
      generationId: "abcdef12zzzz",
      formats: ["wechat_article"],
    })
    expect(draft.contentPackageName).toContain("内容包 abcdef12")
    expect(draft.platforms).toEqual(["公众号文章"])
    expect(draft.projectId).toBeNull()
    expect(draft.reviewStatus).toBe("待确认母内容")
    expect(draft.aimContentLink).toBe("aim://generation/abcdef12zzzz")
  })
})

describe("submitContentDistributionClaim", () => {
  it("upserts Feishu work item when config is present", async () => {
    const draft = buildContentDistributionClaimDraft({
      generationId: "gen_claim",
      projectId: "proj_1",
      taskSpec,
      aimBaseUrl: "https://aim.example.com",
    })
    const upsert = vi.fn(async () => ({ ok: true as const, recordId: "rec_1", created: true }))
    const result = await submitContentDistributionClaim({
      draft,
      upsert,
      readConfig: () => ({
        baseToken: "base_token",
        tableId: "table_1",
        cliPath: "/usr/bin/lark-cli",
      }),
    })
    expect(result.ok).toBe(true)
    if (!result.ok || result.mode !== "feishu_upsert") throw new Error("expected upsert")
    expect(result.created).toBe(true)
    expect(result.recordId).toBe("rec_1")
    expect(result.openUrl).toContain("feishu.cn/base/base_token")
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      baseToken: "base_token",
      tableId: "table_1",
      idempotencyField: "AIM结果ID",
      idempotencyKey: "gen_claim",
    }))
  })

  it("falls back to copy_only when Feishu work item config is missing", async () => {
    const draft = buildContentDistributionClaimDraft({ generationId: "gen_x" })
    const result = await submitContentDistributionClaim({
      draft,
      readConfig: () => {
        throw new Error("经营事项入口缺少 LARK_WORK_ITEM_TABLE_ID 配置")
      },
    })
    expect(result.ok).toBe(true)
    if (!result.ok || result.mode !== "copy_only") throw new Error("expected copy_only")
    expect(result.connectorStatus).toBe("disabled")
    expect(result.reason).toContain("LARK_WORK_ITEM_TABLE_ID")
    expect(result.draft.plainText).toContain("飞书领取事项草稿")
  })
})

describe("buildFeishuWorkItemOpenUrl", () => {
  it("builds table and record deep links", () => {
    expect(buildFeishuWorkItemOpenUrl({
      baseToken: "bt",
      tableId: "tbl",
      recordId: "rec",
    })).toBe("https://feishu.cn/base/bt?table=tbl&record=rec")
  })
})
