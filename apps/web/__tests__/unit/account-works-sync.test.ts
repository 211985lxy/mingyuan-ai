import { describe, expect, it } from "vitest"

import {
  runAccountWorksSync,
  type AccountWorksSyncStorePort,
  type SyncedWorkItem,
} from "@/lib/aim/account-works-sync"
import type { AccountWorkLike } from "@/lib/aim/account-work-assets"

const NOW = "2026-09-12T00:00:00.000Z"

function item(overrides: Partial<SyncedWorkItem> = {}): SyncedWorkItem {
  return {
    externalWorkId: "w1",
    title: "作品一",
    coverUrl: "https://cover/1",
    publishedAt: "2026-09-10T00:00:00.000Z",
    stats: { views: 1000, likes: 100 },
    ...overrides,
  }
}

function makeStore(overrides: Partial<AccountWorksSyncStorePort> = {}): AccountWorksSyncStorePort {
  return {
    listBindings: async () => [{ id: "b1", userId: "u1", projectId: "p1" }],
    fetchWorks: async () => ({ items: [item()], source: "tikhub" as const, fallbackUsed: false, fallbackReason: null }),
    loadExisting: async () => [],
    saveMerged: async () => ({ upserted: 1 }),
    ...overrides,
  }
}

describe("runAccountWorksSync", () => {
  it("正常同步：合并去重后产出摘要（总数/窗口内/逐字稿计划/摘要哈希）", async () => {
    const saved: AccountWorkLike[][] = []
    const summary = await runAccountWorksSync(
      makeStore({
        loadExisting: async () => [
          {
            externalWorkId: "w0",
            title: "老作品",
            coverUrl: null,
            publishedAt: "2026-01-01T00:00:00.000Z",
            stats: { views: 50 },
            transcript: "已有稿",
            transcriptStatus: "ready",
            transcriptAttempts: 1,
          },
        ],
        saveMerged: async (input) => {
          saved.push(input.works)
          return { upserted: input.works.length }
        },
      }),
      { now: NOW },
    )
    expect(summary.okCount).toBe(1)
    expect(summary.failedCount).toBe(0)
    expect(summary.bindings[0]?.fetched).toBe(1)
    expect(summary.bindings[0]?.totalWorks).toBe(2)
    expect(summary.bindings[0]?.withinWindow).toBe(1)
    expect(summary.bindings[0]?.transcriptPlanCount).toBe(1) // 新作品进提取计划，已有稿跳过
    expect(summary.bindings[0]?.digestHash).toHaveLength(64)
    // 合并结果保留 existing 逐字稿成果
    const mergedOld = saved[0]?.find((work) => work.externalWorkId === "w0")
    expect(mergedOld?.transcript).toBe("已有稿")
    expect(mergedOld?.transcriptStatus).toBe("ready")
  })

  it("单账号失败不阻断批次，错误进摘要", async () => {
    const summary = await runAccountWorksSync(
      makeStore({
        listBindings: async () => [
          { id: "bad", userId: "u1", projectId: null },
          { id: "good", userId: "u2", projectId: "p2" },
        ],
        fetchWorks: async (binding) => {
          if (binding.id === "bad") throw new Error("作品数据通道均未取到数据（TikHub: 401；红狐: 未配置）")
          return { items: [item({ externalWorkId: "ok" })], source: "tikhub" as const, fallbackUsed: false, fallbackReason: null }
        },
        saveMerged: async (input) => ({ upserted: input.works.length }),
      }),
      { now: NOW },
    )
    expect(summary.failedCount).toBe(1)
    expect(summary.okCount).toBe(1)
    expect(summary.bindings[0]?.error).toContain("作品数据通道均未取到数据")
    expect(summary.bindings[1]?.error).toBeNull()
  })

  it("bindingId 过滤只同步指定账号", async () => {
    const fetched: string[] = []
    await runAccountWorksSync(
      makeStore({
        listBindings: async () => [
          { id: "b1", userId: "u1", projectId: null },
          { id: "b2", userId: "u2", projectId: null },
        ],
        fetchWorks: async (binding) => {
          fetched.push(binding.id)
          return { items: [], source: "redfox" as const, fallbackUsed: true, fallbackReason: "TikHub: 无 sec_user_id" }
        },
      }),
      { bindingId: "b2", now: NOW },
    )
    expect(fetched).toEqual(["b2"])
  })
})
