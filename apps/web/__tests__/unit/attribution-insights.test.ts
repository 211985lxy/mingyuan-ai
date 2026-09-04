/**
 * WP-D 选题归因聚合测试。
 *
 * 钉死纪律：
 * - 只聚合周期内已发布内容
 * - 播放取周期末最成熟快照，不相加；全未回填 → null（空值≠0）
 * - 可追溯（explicit/first_touch）与来源不明分开统计
 * - publishedCount < 3 只列事实，附带样本不足提示
 * - 「未标注」固定排最后
 */
import { describe, expect, it, vi } from "vitest"
import {
  computeTaskAttributionInsights,
  type AttributionInsightsStorePort,
  type InsightGenerationRow,
} from "@/lib/aim/attribution-insights"

const PERIOD_START = new Date("2026-08-01T00:00:00.000Z")
const PERIOD_END = new Date("2026-09-01T00:00:00.000Z")

interface StoreFixture {
  generations?: Array<Partial<InsightGenerationRow> & { id: string }>
  outcomes?: Array<{
    generationId: string
    collectWindowDay: number
    collectedAt: Date
    views: number | null
  }>
  attributions?: Array<{ generationId: string; attributionMethod: string }>
}

function createStore(fixture: StoreFixture) {
  const generations: InsightGenerationRow[] = (fixture.generations ?? []).map((g) => ({
    workflowStatus: "published",
    publishedAt: new Date("2026-08-10T00:00:00.000Z"),
    taskSpec: null,
    ...g,
  }))
  const store = {
    generations,
    aimGeneration: { findMany: vi.fn(async () => generations) },
    contentOutcome: { findMany: vi.fn(async () => fixture.outcomes ?? []) },
    outcomeAttribution: { findMany: vi.fn(async () => fixture.attributions ?? []) },
  }
  return store as typeof store & AttributionInsightsStorePort
}

async function compute(store: AttributionInsightsStorePort, userId = "user-1", projectId = "p1") {
  return computeTaskAttributionInsights({ userId, projectId, start: PERIOD_START, end: PERIOD_END, store })
}

describe("computeTaskAttributionInsights", () => {
  it("只聚合周期内已发布内容，并把查询范围限定在用户/项目", async () => {
    const store = createStore({
      generations: [
        { id: "gen-in" },
        { id: "gen-before", publishedAt: new Date("2026-07-15T00:00:00.000Z") },
        { id: "gen-after", publishedAt: new Date("2026-09-02T00:00:00.000Z") },
        { id: "gen-draft", workflowStatus: "ready_to_publish" },
        { id: "gen-none", publishedAt: null },
      ],
    })

    const insights = await compute(store)

    expect(insights).toHaveLength(1)
    expect(insights[0]).toMatchObject({ contentTask: "未标注", publishedCount: 1 })
    expect(store.aimGeneration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1", projectId: "p1" } }),
    )
  })

  it("按内容任务聚合播放与线索，可追溯多的排前；样本充足时无提示", async () => {
    const store = createStore({
      generations: [
        { id: "a1", taskSpec: { contentTask: "吸引目标客户" } },
        { id: "a2", taskSpec: { contentTask: "吸引目标客户" } },
        { id: "a3", taskSpec: { contentTask: "吸引目标客户" } },
        { id: "b1", taskSpec: { contentTask: "建立专业信任" } },
        { id: "b2", taskSpec: { contentTask: "建立专业信任" } },
      ],
      outcomes: [
        { generationId: "a1", collectWindowDay: 7, collectedAt: new Date("2026-08-08"), views: 100 },
        { generationId: "a1", collectWindowDay: 14, collectedAt: new Date("2026-08-15"), views: 300 },
        { generationId: "a1", collectWindowDay: 30, collectedAt: new Date("2026-08-31"), views: 900 },
        { generationId: "a2", collectWindowDay: 7, collectedAt: new Date("2026-08-20"), views: 500 },
        { generationId: "b1", collectWindowDay: 7, collectedAt: new Date("2026-08-20"), views: null },
      ],
      attributions: [
        { generationId: "a1", attributionMethod: "explicit" },
        { generationId: "a2", attributionMethod: "first_touch" },
        { generationId: "b1", attributionMethod: "unknown" },
      ],
    })

    const insights = await compute(store)

    expect(insights).toHaveLength(2)
    const attract = insights.find((i) => i.contentTask === "吸引目标客户")
    const trust = insights.find((i) => i.contentTask === "建立专业信任")
    expect(insights[0].contentTask).toBe("吸引目标客户")
    expect(attract).toMatchObject({
      publishedCount: 3,
      viewsTotal: 1400,
      traceableLeadCount: 2,
      unknownLeadCount: 0,
      sampleNote: null,
    })
    expect(trust).toMatchObject({
      publishedCount: 2,
      viewsTotal: null,
      traceableLeadCount: 0,
      unknownLeadCount: 1,
    })
    expect(trust?.sampleNote).toContain("样本不足（2 条）")
  })

  it("窗口只取周期末最成熟一个不相加；周期末之后采集的快照不算", async () => {
    const store = createStore({
      generations: [
        { id: "gen-x", taskSpec: { contentTask: "吸引目标客户" } },
        { id: "gen-y", taskSpec: { contentTask: "吸引目标客户" } },
        { id: "gen-z", taskSpec: { contentTask: "吸引目标客户" } },
      ],
      outcomes: [
        { generationId: "gen-x", collectWindowDay: 7, collectedAt: new Date("2026-08-08"), views: 100 },
        { generationId: "gen-x", collectWindowDay: 14, collectedAt: new Date("2026-08-15"), views: 300 },
        { generationId: "gen-x", collectWindowDay: 30, collectedAt: new Date("2026-08-31"), views: 900 },
        {
          generationId: "gen-y",
          collectWindowDay: 7,
          collectedAt: new Date("2026-09-05"),
          views: 999,
        },
      ],
    })

    const insights = await compute(store)
    const one = insights.find((i) => i.contentTask === "吸引目标客户")

    expect(one?.publishedCount).toBe(3)
    expect(one?.viewsTotal).toBe(900)
    expect(one?.sampleNote).toBeNull()
  })

  it("归因方式未知值按来源不明统计，不混入可追溯", async () => {
    const store = createStore({
      generations: [{ id: "gen-1", taskSpec: { contentTask: "推动咨询行动" } }],
      attributions: [
        { generationId: "gen-1", attributionMethod: "explicit" },
        { generationId: "gen-1", attributionMethod: "随便填的" },
        { generationId: "gen-1", attributionMethod: "" },
      ],
    })

    const insights = await compute(store)

    expect(insights[0]).toMatchObject({ traceableLeadCount: 1, unknownLeadCount: 2 })
  })

  it("线索查询只按内容归属过滤，不按登记时间丢弃晚登记的线索", async () => {
    const store = createStore({
      generations: [{ id: "gen-1", taskSpec: { contentTask: "推动咨询行动" } }],
    })

    await compute(store)

    expect(store.outcomeAttribution.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          generationId: { in: ["gen-1"] },
        }),
      }),
    )
    const args = store.outcomeAttribution.findMany.mock.calls[0][0] as { where: Record<string, unknown> }
    expect(args.where.occurredAt).toBeUndefined()
  })

  it("任务未标注的内容固定排在最后", async () => {
    const store = createStore({
      generations: [
        { id: "gen-plain", taskSpec: null },
        { id: "gen-empty", taskSpec: {} },
        { id: "gen-blank", taskSpec: { contentTask: "  " } },
        { id: "gen-t1", taskSpec: { contentTask: "筛选不适合客户" } },
        { id: "gen-t2", taskSpec: { contentTask: "筛选不适合客户" } },
        { id: "gen-t3", taskSpec: { contentTask: "筛选不适合客户" } },
      ],
    })

    const insights = await compute(store)

    expect(insights.at(-1)?.contentTask).toBe("未标注")
    expect(insights).toHaveLength(2)
    expect(insights[0]).toMatchObject({ contentTask: "筛选不适合客户", publishedCount: 3 })
  })

  it("周期内没有已发布内容时返回空数组", async () => {
    const store = createStore({
      generations: [{ id: "gen-draft", workflowStatus: "draft" }],
    })

    await expect(compute(store)).resolves.toEqual([])
  })
})
