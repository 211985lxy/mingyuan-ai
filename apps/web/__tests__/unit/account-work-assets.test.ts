import { describe, expect, it } from "vitest"

import {
  TRANSCRIPT_MAX_ATTEMPTS,
  buildAccountHistoryDigest,
  dedupeAndMergeWorks,
  planTranscriptExtraction,
  readWorkStats,
  type AccountWorkLike,
} from "@/lib/aim/account-work-assets"

const NOW = "2026-09-12T00:00:00.000Z"
const DAY = 24 * 60 * 60 * 1000

function work(overrides: Partial<AccountWorkLike> = {}): AccountWorkLike {
  return {
    externalWorkId: "w1",
    title: "作品一",
    coverUrl: null,
    publishedAt: NOW,
    stats: { views: 100, likes: 10 },
    transcript: null,
    transcriptStatus: "none",
    transcriptAttempts: 0,
    ...overrides,
  }
}

describe("dedupeAndMergeWorks", () => {
  it("incoming 数据胜出，existing 的逐字稿成果保留", () => {
    const merged = dedupeAndMergeWorks(
      [work({ stats: { views: 50 }, transcript: "逐字稿", transcriptStatus: "ready", transcriptAttempts: 1 })],
      [work({ stats: { views: 200 }, title: "新标题" })],
    )
    expect(merged).toHaveLength(1)
    expect(merged[0]?.stats.views).toBe(200)
    expect(merged[0]?.title).toBe("新标题")
    expect(merged[0]?.transcript).toBe("逐字稿")
    expect(merged[0]?.transcriptStatus).toBe("ready")
  })

  it("新作品追加，重复作品不产生第二条", () => {
    const merged = dedupeAndMergeWorks([work()], [work(), work({ externalWorkId: "w2" })])
    expect(merged).toHaveLength(2)
    expect(merged.map((row) => row.externalWorkId).sort()).toEqual(["w1", "w2"])
  })
})

describe("planTranscriptExtraction", () => {
  it("只排近窗口内的候选，按互动量排序取 Top N", () => {
    const works = [
      work({ externalWorkId: "old", publishedAt: new Date(new Date(NOW).getTime() - 200 * DAY).toISOString(), stats: { likes: 999 } }),
      work({ externalWorkId: "mid", publishedAt: new Date(new Date(NOW).getTime() - 10 * DAY).toISOString(), stats: { likes: 50 } }),
      work({ externalWorkId: "hot", publishedAt: new Date(new Date(NOW).getTime() - 5 * DAY).toISOString(), stats: { likes: 500 } }),
    ]
    const plan = planTranscriptExtraction(works, { now: NOW })
    expect(plan.map((item) => item.externalWorkId)).toEqual(["hot", "mid"])
    expect(plan[0]?.reason).toBe("high_priority_window")
    expect(plan[0]?.priority).toBe(1)
  })

  it("ready/pending 跳过；failed 未超次数的重试且优先；超次数的放弃", () => {
    const works = [
      work({ externalWorkId: "done", transcriptStatus: "ready", transcript: "已有" }),
      work({ externalWorkId: "inflight", transcriptStatus: "pending" }),
      work({ externalWorkId: "retry", transcriptStatus: "failed", transcriptAttempts: 1, stats: { likes: 1 } }),
      work({
        externalWorkId: "giveup",
        transcriptStatus: "failed",
        transcriptAttempts: TRANSCRIPT_MAX_ATTEMPTS,
        stats: { likes: 10000 },
      }),
      work({ externalWorkId: "fresh", stats: { likes: 100 } }),
    ]
    const plan = planTranscriptExtraction(works, { now: NOW })
    expect(plan.map((item) => item.externalWorkId)).toEqual(["retry", "fresh"])
    expect(plan[0]?.reason).toBe("retry_failed")
  })
})

describe("buildAccountHistoryDigest", () => {
  it("确定性输出：同输入同 hash，含总数/窗口数/Top 作品", () => {
    const works = [
      work({ externalWorkId: "a", title: "爆款A", publishedAt: "2026-09-10T00:00:00.000Z", stats: { views: 5000 } }),
      work({ externalWorkId: "b", title: "老作品B", publishedAt: "2026-01-01T00:00:00.000Z", stats: { views: 9000 } }),
    ]
    const first = buildAccountHistoryDigest(works, { now: NOW })
    const second = buildAccountHistoryDigest(
      works.slice().reverse(),
      { now: NOW },
    )
    expect(first.hash).toBe(second.hash)
    expect(first.totalWorks).toBe(2)
    expect(first.publishedWithinWindow).toBe(1)
    expect(first.topWorks[0]?.title).toBe("老作品B") // 按播放排序，不看窗口
    expect(first.digest).toContain("共 2 条作品")
    expect(first.digest).toContain("爆款A")
  })

  it("空账号也给可注入的摘要", () => {
    const digest = buildAccountHistoryDigest([], { now: NOW })
    expect(digest.totalWorks).toBe(0)
    expect(digest.digest).toContain("共 0 条作品")
    expect(digest.hash).toBeTruthy()
  })
})

describe("readWorkStats", () => {
  it("只接受有限数值字段，其余忽略", () => {
    expect(readWorkStats({ views: 10, likes: "x", comments: NaN, saves: 2 })).toEqual({ views: 10, saves: 2 })
    expect(readWorkStats(null)).toEqual({})
    expect(readWorkStats("junk")).toEqual({})
  })
})
