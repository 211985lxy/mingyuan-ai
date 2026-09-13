import { describe, expect, it } from "vitest"

import { classifyInspirationPrescreen, isAutonomyL0Enabled, shouldDemoteAutonomyL0 } from "@/lib/aim/autonomy-l0"
import { executeHitlGatedWriteTool } from "@/lib/aim-harness/hitl-write-tools"
import { recommendMonthlyModelTiers } from "@/lib/aim/monthly-model-tiers"
import {
  buildPublishReminderCard,
  isPublishReminderEnabled,
  listPublishReminderDue,
  needsWorkIdBackfill,
} from "@/lib/aim/publish-reminder"
import { hashLearnings, hashLearningsFromManifest } from "@/lib/aim/learning-injection"
import { LOOP_STEP_IDS } from "@/lib/aim/loops/contracts"
import { runReviewAttributionLoopShadow } from "@/lib/aim/review-attribution-loop"
import { assertToolAllowedInToolLoop, getRegisteredTool } from "@/lib/aim-harness/tool-registry"

describe("L0 灵感预筛", () => {
  it("默认关；重复且有链接才 autoPass", () => {
    expect(isAutonomyL0Enabled()).toBe(false)
    expect(classifyInspirationPrescreen({ duplicate: true, hasCanonicalUrl: true }).autoPass).toBe(true)
    expect(classifyInspirationPrescreen({ duplicate: true, hasCanonicalUrl: false }).autoPass).toBe(false)
    expect(classifyInspirationPrescreen({ duplicate: false, hasCanonicalUrl: true }).autoPass).toBe(false)
  })

  it("30 天内有申诉就降回 L2", () => {
    expect(shouldDemoteAutonomyL0([{ createdAt: new Date("2026-09-01T00:00:00Z") }], new Date("2026-09-12T00:00:00Z"))).toBe(true)
    expect(shouldDemoteAutonomyL0([{ createdAt: new Date("2026-07-01T00:00:00Z") }], new Date("2026-09-12T00:00:00Z"))).toBe(false)
  })
})

describe("发布提醒", () => {
  it("缺作品 ID 才入提醒清单", () => {
    expect(needsWorkIdBackfill({
      id: "g1",
      userId: "u1",
      projectId: "p1",
      topicTitle: "案例",
      publishPlatform: "douyin",
      publishUrl: "",
      publishedAt: new Date("2026-09-11T00:00:00Z"),
    })).toBe(true)
    expect(isPublishReminderEnabled()).toBe(false)
    const card = buildPublishReminderCard({
      id: "g1",
      userId: "u1",
      projectId: "p1",
      topicTitle: "案例",
      publishPlatform: "douyin",
      publishUrl: "",
      publishedAt: new Date("2026-09-11T00:00:00Z"),
    })
    expect(card.header.title.content).toContain("作品 ID")
  })

  it("只看 48 小时内已发布且缺作品键的记录", async () => {
    const due = await listPublishReminderDue({
      now: new Date("2026-09-12T12:00:00Z"),
      store: {
        aimGeneration: {
          findMany: async () => [
            {
              id: "old",
              userId: "u1",
              projectId: "p1",
              topicTitle: "过期",
              publishPlatform: "douyin",
              publishUrl: "",
              publishedAt: new Date("2026-09-09T00:00:00Z"),
            },
            {
              id: "fresh",
              userId: "u1",
              projectId: "p1",
              topicTitle: "新发",
              publishPlatform: "douyin",
              publishUrl: "",
              publishedAt: new Date("2026-09-11T12:00:00Z"),
            },
          ],
        },
      },
    })
    expect(due.map((row) => row.id)).toEqual(["fresh"])
  })
})

describe("工具环与复盘 loop", () => {
  it("写工具已注册；复盘 loop 不进自由工具环", () => {
    expect(getRegisteredTool("feishu_draft_write")?.idempotent).toBe(true)
    expect(getRegisteredTool("mark_inspiration_processed")?.idempotent).toBe(true)
    expect(() => assertToolAllowedInToolLoop("review_attribution_loop")).toThrow(/禁止进入/)
    expect(executeHitlGatedWriteTool({ name: "feishu_draft_write" }).ok).toBe(false)
    expect(executeHitlGatedWriteTool({ name: "feishu_draft_write", approvalDecision: "approve" })).toMatchObject({
      ok: true,
      shadow: true,
    })
  })

  it("复盘 loop 默认 shadow，8 步齐全，不编造金额", () => {
    const result = runReviewAttributionLoopShadow({
      periodStart: "2026-09-01T00:00:00.000Z",
      periodEnd: "2026-09-08T00:00:00.000Z",
      source: "metric-layer",
      weekly: {
        periodStart: "2026-09-01T00:00:00.000Z",
        periodEnd: "2026-09-08T00:00:00.000Z",
        publishedCount: 2,
        qualifiedLeadCount: 1,
        appointmentCount: 0,
        dealCount: 0,
        revenue: 0,
        referencedAssetCount: 0,
        reusedAssetCount: 0,
        day7Backfill: { due: 0, filled: 0 },
      },
      canonical: {
        publishedCount: 2,
        traceableLeadCount: 1,
        unknownLeadCount: 0,
        appointmentCount: 0,
        dealCount: 0,
        revenue: 0,
        referencedAssetCount: 0,
        reusedAssetCount: 0,
        day7Backfill: { due: 0, filled: 0 },
      },
    })
    expect(result.shadow).toBe(true)
    expect(result.live).toBe(false)
    expect(result.steps).toEqual([...LOOP_STEP_IDS])
    expect(result.draft).toContain("可追溯线索 1")
    expect(result.draft).toContain("人工终审")
  })
})

describe("月度模型档位", () => {
  it("没分数就复核，成本高且分不够才建议降档", () => {
    const out = recommendMonthlyModelTiers([
      { routeKey: "a", rubricMean: null, costCny: 0.01 },
      { routeKey: "b", rubricMean: 90, costCny: 0.01 },
      { routeKey: "c", rubricMean: 80, costCny: 0.5 },
    ])
    expect(out.map((item) => item.recommended)).toEqual(["review", "keep", "downgrade"])
  })
})

describe("learningsHash 与 manifest 同口径", () => {
  it("从 learning:id 抽哈希，顺序无关", () => {
    const direct = hashLearnings([
      { id: "2", targetType: "skill_draft", constraint: "b" },
      { id: "1", targetType: "methodology_revision", constraint: "a" },
    ])
    const fromManifest = hashLearningsFromManifest([
      { kind: "learnings", id: "learning:1" },
      { kind: "learnings", id: "learnings:block" },
      { kind: "learnings", id: "learning:2" },
    ])
    expect(fromManifest).toBe(direct)
  })
})
