import { describe, expect, it, vi } from "vitest"

import {
  classifyPublishedWorkKey,
  isDouyinPublishPlatform,
  resolveCollectWindowDay,
  runOutcomeAutofetch,
  type OutcomeAutofetchStore,
  type PublishedGenerationRow,
} from "@/lib/aim/outcome-autofetch"

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date("2026-09-12T03:00:00.000Z")

function gen(overrides: Partial<PublishedGenerationRow> & Pick<PublishedGenerationRow, "id">): PublishedGenerationRow {
  return {
    userId: "user-1",
    projectId: "proj-1",
    topicSelectionId: "topic-1",
    publishPlatform: "抖音",
    publishUrl: "https://www.douyin.com/video/7123456789012345678",
    publishedAt: new Date(NOW.getTime() - 8 * DAY),
    ...overrides,
  }
}

function createStore(overrides: Partial<OutcomeAutofetchStore> = {}): OutcomeAutofetchStore & {
  upserts: Array<Record<string, unknown>>
  alerts: Array<{ fingerprint: string; summary: string }>
} {
  const upserts: Array<Record<string, unknown>> = []
  const alerts: Array<{ fingerprint: string; summary: string }> = []
  return {
    upserts,
    alerts,
    listPublishedGenerations: async () => [gen({ id: "g1" })],
    listBindings: async () => [{ id: "b1", userId: "user-1", openId: "oid-1" }],
    fetchVideosForBinding: async () => [
      {
        itemId: "7123456789012345678",
        videoId: null,
        shareUrl: "https://www.douyin.com/video/7123456789012345678",
        statistics: {
          playCount: 1000,
          diggCount: 20,
          commentCount: 3,
          collectCount: 4,
          shareCount: 5,
        },
      },
    ],
    upsertContentSignals: async (input) => {
      upserts.push(input)
    },
    markBindingExpired: async () => {},
    alert: async (input) => {
      alerts.push(input)
    },
    ...overrides,
  }
}

describe("isDouyinPublishPlatform", () => {
  it("recognizes 抖音 and douyin, ignores other platforms", () => {
    expect(isDouyinPublishPlatform("抖音")).toBe(true)
    expect(isDouyinPublishPlatform(" Douyin ")).toBe(true)
    expect(isDouyinPublishPlatform("小红书")).toBe(false)
    expect(isDouyinPublishPlatform("")).toBe(false)
  })
})

describe("classifyPublishedWorkKey", () => {
  it("accepts long-form video URL and raw aweme_id", () => {
    expect(classifyPublishedWorkKey("抖音", "https://www.douyin.com/video/7123456789012345678")).toEqual({
      status: "aweme",
      awemeId: "7123456789012345678",
    })
    expect(classifyPublishedWorkKey("douyin", " 7123456789012345678 ")).toEqual({
      status: "aweme",
      awemeId: "7123456789012345678",
    })
  })

  it("keeps v.douyin.com short links as resolvable later", () => {
    expect(classifyPublishedWorkKey("抖音", "https://v.douyin.com/AbCdEf/")).toEqual({
      status: "short",
      url: "https://v.douyin.com/AbCdEf/",
    })
  })

  it("flags unparseable Douyin keys as missing", () => {
    expect(classifyPublishedWorkKey("抖音", "dy_123").status).toBe("missing")
    expect(classifyPublishedWorkKey("抖音", "https://example.com/foo").status).toBe("missing")
  })

  it("does not require aweme_id on other platforms", () => {
    expect(classifyPublishedWorkKey("小红书", "https://xhs.link/abc")).toEqual({
      status: "other",
    })
  })
})

describe("resolveCollectWindowDay", () => {
  it("returns null before day 7, then 7 / 14 / 30 without backfilling a later snapshot into an earlier window", () => {
    expect(resolveCollectWindowDay(new Date(NOW.getTime() - 6 * DAY), NOW)).toBeNull()
    expect(resolveCollectWindowDay(new Date(NOW.getTime() - 7 * DAY), NOW)).toBe(7)
    expect(resolveCollectWindowDay(new Date(NOW.getTime() - 13 * DAY), NOW)).toBe(7)
    expect(resolveCollectWindowDay(new Date(NOW.getTime() - 14 * DAY), NOW)).toBe(14)
    expect(resolveCollectWindowDay(new Date(NOW.getTime() - 29 * DAY), NOW)).toBe(14)
    expect(resolveCollectWindowDay(new Date(NOW.getTime() - 30 * DAY), NOW)).toBe(30)
  })
})

describe("runOutcomeAutofetch", () => {
  it("matches by aweme_id and upserts only content-signal fields", async () => {
    const store = createStore()
    const summary = await runOutcomeAutofetch({ store, now: NOW, resolveShortUrl: async (url) => url })

    expect(summary.upserted).toBe(1)
    expect(store.upserts[0]).toMatchObject({
      userId: "user-1",
      generationId: "g1",
      collectWindowDay: 7,
      platform: "抖音",
      views: 1000,
      likes: 20,
      comments: 3,
      saves: 4,
      shares: 5,
    })
    expect(store.upserts[0]).not.toHaveProperty("qualifiedLeadCount")
    expect(store.upserts[0]).not.toHaveProperty("verdictCode")
    expect(store.upserts[0]).not.toHaveProperty("revenue")
  })

  it("skips generations younger than 7 days", async () => {
    const store = createStore({
      listPublishedGenerations: async () => [
        gen({ id: "g-new", publishedAt: new Date(NOW.getTime() - 2 * DAY) }),
      ],
    })
    const summary = await runOutcomeAutofetch({ store, now: NOW, resolveShortUrl: async (url) => url })
    expect(summary.upserted).toBe(0)
    expect(summary.tooEarly).toBe(1)
    expect(store.upserts).toHaveLength(0)
  })

  it("records unmatched Douyin posts for manual backfill instead of guessing", async () => {
    const store = createStore({
      fetchVideosForBinding: async () => [
        {
          itemId: "999",
          videoId: null,
          shareUrl: null,
          statistics: { playCount: 1, diggCount: 1, commentCount: 0, collectCount: 0, shareCount: 0 },
        },
      ],
    })
    const summary = await runOutcomeAutofetch({ store, now: NOW, resolveShortUrl: async (url) => url })
    expect(summary.upserted).toBe(0)
    expect(summary.unmatched).toBe(1)
    expect(summary.needsBackfill).toEqual([
      expect.objectContaining({ generationId: "g1", reason: "not_in_recent_videos" }),
    ])
  })

  it("lists unparseable published Douyin records as backfill, without calling the API", async () => {
    const store = createStore({
      listPublishedGenerations: async () => [gen({ id: "g-bad", publishUrl: "随便贴的文字" })],
      fetchVideosForBinding: async () => {
        throw new Error("should not fetch")
      },
    })
    const summary = await runOutcomeAutofetch({ store, now: NOW, resolveShortUrl: async (url) => url })
    expect(summary.needsBackfill).toEqual([
      expect.objectContaining({ generationId: "g-bad", reason: "unparseable_work_key" }),
    ])
  })

  it("continues other accounts when one binding is expired", async () => {
    const store = createStore({
      listPublishedGenerations: async () => [
        gen({ id: "g1", userId: "user-expired" }),
        gen({ id: "g2", userId: "user-ok", publishUrl: "7123000000000000001" }),
      ],
      listBindings: async (userId) =>
        userId === "user-expired"
          ? []
          : [{ id: "b-ok", userId: "user-ok", openId: "oid-ok" }],
      fetchVideosForBinding: async () => [
        {
          itemId: "7123000000000000001",
          videoId: null,
          shareUrl: null,
          statistics: { playCount: 9, diggCount: 1, commentCount: 0, collectCount: 0, shareCount: 0 },
        },
      ],
    })
    const summary = await runOutcomeAutofetch({ store, now: NOW, resolveShortUrl: async (url) => url })
    expect(summary.tokenMissing).toBe(1)
    expect(summary.upserted).toBe(1)
    expect(store.upserts[0]).toMatchObject({ generationId: "g2", views: 9 })
  })

  it("alerts when a binding is expired and does not block the batch", async () => {
    const store = createStore({
      fetchVideosForBinding: async () => {
        throw Object.assign(new Error("token expired"), { code: "expired" })
      },
    })
    const markBindingExpired = vi.fn(async () => {})
    store.markBindingExpired = markBindingExpired
    const summary = await runOutcomeAutofetch({ store, now: NOW, resolveShortUrl: async (url) => url })
    expect(summary.tokenExpired).toBe(1)
    expect(summary.upserted).toBe(0)
    expect(store.alerts[0]?.fingerprint).toContain("outcome-autofetch")
    expect(markBindingExpired).toHaveBeenCalled()
  })

  it("resolves short links then matches, and repeats only overwrite content signals", async () => {
    const store = createStore({
      listPublishedGenerations: async () => [gen({ id: "g-short", publishUrl: "https://v.douyin.com/AbCdEf/" })],
    })
    const resolveShortUrl = vi.fn(async () => "https://www.douyin.com/video/7123456789012345678")
    await runOutcomeAutofetch({ store, now: NOW, resolveShortUrl })
    await runOutcomeAutofetch({ store, now: NOW, resolveShortUrl })
    expect(resolveShortUrl).toHaveBeenCalled()
    expect(store.upserts).toHaveLength(2)
    expect(store.upserts[1]).toMatchObject({ generationId: "g-short", views: 1000, likes: 20 })
  })
})
