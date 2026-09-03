import { describe, expect, it } from "vitest"
import {
  fetchCreatorMetrics,
  mapDetailRecord,
  readCreatorMetricsConfig,
  type CreatorMetricsConfig,
} from "@/lib/aim/creator-metrics"

// 创作者数据总线：平台明细V2（上游 upsert 当前值）→ 映射/聚合/降级。
// 语义：周期汇总 = 周期内发布作品的当前累计值（非周期内新增）。

const CONFIG: CreatorMetricsConfig = {
  baseToken: "base-1",
  detailTableId: "tbl_detail",
  syncLogTableId: "tbl_log",
}

function makeListRecords(detailRows: Array<{ recordId: string; fields: Record<string, unknown> }>, logRows: Array<{ recordId: string; fields: Record<string, unknown> }> = []) {
  return async (input: { tableId: string }) => {
    if (input.tableId === "tbl_detail") return detailRows
    if (input.tableId === "tbl_log") return logRows
    throw new Error(`未知表：${input.tableId}`)
  }
}

const START = new Date("2026-08-31T00:00:00.000Z")
const END = new Date("2026-09-07T00:00:00.000Z")

function detailRow(overrides: Partial<{ postId: string; platform: unknown; published: unknown; views: unknown; title: string }> = {}) {
  return {
    recordId: `rec_${overrides.postId ?? "p1"}`,
    fields: {
      平台作品键: overrides.postId ?? "p1",
      视频平台: overrides.platform ?? "抖音",
      视频标题: overrides.title ?? "标题A",
      视频发布日期: overrides.published ?? 1788134400000, // 2026-08-31T00:00:00Z，周期起点当天
      总流量: overrides.views ?? 1200,
      点赞量: "88", // 字符串数字应被容错解析
      评论量: 5,
      分享量: null,
      收藏量: 10,
      涨粉量: 3,
      完播率: 0.42,
    },
  }
}

describe("readCreatorMetricsConfig", () => {
  it("缺少 base token 或明细表 ID 时返回 null", () => {
    expect(readCreatorMetricsConfig({})).toBeNull()
    expect(readCreatorMetricsConfig({ LARK_CREATOR_METRICS_BASE_TOKEN: "base-1" })).toBeNull()
  })

  it("齐全时返回配置，同步日志表可选", () => {
    const config = readCreatorMetricsConfig({
      LARK_CREATOR_METRICS_BASE_TOKEN: " base-1 ",
      LARK_CREATOR_METRICS_DETAIL_TABLE_ID: "tbl_detail",
    })
    expect(config).toEqual({ baseToken: "base-1", detailTableId: "tbl_detail", syncLogTableId: undefined, cliPath: undefined })
  })
})

describe("mapDetailRecord", () => {
  it("按上游 feishu_schema.py 正名映射字段与平台码", () => {
    const mapped = mapDetailRecord(detailRow())
    expect(mapped).toMatchObject({
      postId: "p1",
      platform: "douyin",
      platformLabel: "抖音",
      views: 1200,
      likes: 88,
      collects: 10,
      followersDelta: 3,
      quality: { completionRate: 0.42, likeRate: null },
    })
    expect(mapped?.publishedAt).toBe(new Date(1788134400000).toISOString())
  })

  it("平台不在四平台枚举内归为 other，缺平台作品键的行返回 null", () => {
    expect(mapDetailRecord(detailRow({ platform: "视频号" }))?.platform).toBe("other")
    expect(mapDetailRecord({ recordId: "rec_x", fields: { 视频标题: "无键" } })).toBeNull()
  })
})

describe("fetchCreatorMetrics", () => {
  it("未配置时返回 not_configured 且不产生任何读取", async () => {
    const response = await fetchCreatorMetrics({ env: {}, start: START, end: END })
    expect(response.status).toBe("not_configured")
  })

  it("映射作品、周期汇总只计周期内发布、平台汇总覆盖全部", async () => {
    const rows = [
      detailRow({ postId: "p1" }), // 周期内
      detailRow({ postId: "p2", platform: "小红书", published: 1785888000000, views: 500 }), // 2026-08-05 周期外
      detailRow({ postId: "p3", platform: "小红书", published: 1788220800000, views: 800 }), // 2026-09-01 周期内
      { recordId: "rec_bad", fields: { 视频标题: "缺键" } }, // 跳过
    ]
    const response = await fetchCreatorMetrics({
      env: {
        LARK_CREATOR_METRICS_BASE_TOKEN: "base-1",
        LARK_CREATOR_METRICS_DETAIL_TABLE_ID: "tbl_detail",
      },
      start: START,
      end: END,
      listRecords: makeListRecords(rows),
      fetchedAt: new Date("2026-09-03T08:00:00.000Z"),
    })
    if (response.status !== "ok") throw new Error(`期望 ok，实际 ${response.status}`)
    expect(response.posts).toHaveLength(3)
    expect(response.skipped).toBe(1)
    expect(response.period.publishedCount).toBe(2)
    expect(response.period.views).toBe(2000)
    // 周期内 p1、p3 两条，各自贡献 (88 点赞 + 5 评论 + 10 收藏)，shares 为 null 不计
    expect(response.period.interactions).toBe(2 * (88 + 5 + 10))
    const xhs = response.platformTotals.find((item) => item.label === "小红书")
    expect(xhs).toMatchObject({ platform: "xiaohongshu", posts: 2, views: 1300 })
  })

  it("lastSyncedAt 取同步日志最新批次，读取失败进 warnings 不失败整单", async () => {
    const env = {
      LARK_CREATOR_METRICS_BASE_TOKEN: "base-1",
      LARK_CREATOR_METRICS_DETAIL_TABLE_ID: "tbl_detail",
      LARK_CREATOR_METRICS_SYNC_LOG_TABLE_ID: "tbl_log",
    }
    const ok = await fetchCreatorMetrics({
      env,
      start: START,
      end: END,
      listRecords: makeListRecords([detailRow()], [
        { recordId: "l1", fields: { 同步日期: 1756600000000 } },
        { recordId: "l2", fields: { 同步日期: 1756686000000 } },
      ]),
      fetchedAt: new Date("2026-09-03T08:00:00.000Z"),
    })
    if (ok.status !== "ok") throw new Error("期望 ok")
    expect(ok.lastSyncedAt).toBe(new Date(1756686000000).toISOString())
    expect(ok.warnings).toEqual([])

    const failed = await fetchCreatorMetrics({
      env,
      start: START,
      end: END,
      listRecords: async (input) => {
        if (input.tableId === "tbl_log") throw new Error("权限不足")
        return [detailRow()]
      },
      fetchedAt: new Date("2026-09-03T08:00:00.000Z"),
    })
    if (failed.status !== "ok") throw new Error("日志失败不应拖垮明细返回")
    expect(failed.lastSyncedAt).toBeNull()
    expect(failed.warnings[0]).toContain("同步日志表读取失败")
  })

  it("明细表读取失败返回 error 与可行动 message", async () => {
    const response = await fetchCreatorMetrics({
      env: {
        LARK_CREATOR_METRICS_BASE_TOKEN: "base-1",
        LARK_CREATOR_METRICS_DETAIL_TABLE_ID: "tbl_detail",
      },
      start: START,
      end: END,
      listRecords: async () => {
        throw new Error("base 不存在或无权限")
      },
    })
    expect(response.status).toBe("error")
    if (response.status === "error") expect(response.message).toContain("base 不存在或无权限")
  })
})
