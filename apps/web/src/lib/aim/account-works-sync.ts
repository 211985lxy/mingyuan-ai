/**
 * 账号作品全量同步（WP-A1 接线）：把绑定账号的历史/新增作品同步进 AccountWorkAsset 投影。
 * 纯编排层：合并去重、历史摘要、逐字稿提取计划都走 account-work-assets 的纯逻辑；
 * 拉取与落库走 store 端口（Prisma 适配在 account-works-sync-store.ts）。
 *
 * 幂等：binding+externalWorkId 唯一，重复同步只更新数据字段、绝不覆盖逐字稿成果。
 */

import {
  buildAccountHistoryDigest,
  dedupeAndMergeWorks,
  planTranscriptExtraction,
  readWorkStats,
  type AccountWorkLike,
} from "@/lib/aim/account-work-assets"

export interface SyncedWorkItem {
  externalWorkId: string
  title: string
  coverUrl: string | null
  publishedAt: string | null
  stats: Record<string, unknown>
}

export interface AccountWorksSyncStorePort {
  listBindings(): Promise<Array<{ id: string; userId: string; projectId: string | null }>>
  fetchWorks(binding: { id: string; userId: string }): Promise<SyncedWorkItem[]>
  loadExisting(bindingId: string): Promise<AccountWorkLike[]>
  saveMerged(input: {
    bindingId: string
    userId: string
    projectId: string | null
    works: AccountWorkLike[]
  }): Promise<{ upserted: number }>
}

export interface BindingSyncSummary {
  bindingId: string
  userId: string
  projectId: string | null
  fetched: number
  totalWorks: number
  upserted: number
  withinWindow: number
  transcriptPlanCount: number
  digestHash: string
  error: string | null
}

export interface AccountWorksSyncSummary {
  ranAt: string
  bindings: BindingSyncSummary[]
  okCount: number
  failedCount: number
}

function toAccountWork(item: SyncedWorkItem): AccountWorkLike {
  return {
    externalWorkId: item.externalWorkId,
    title: item.title,
    coverUrl: item.coverUrl,
    publishedAt: item.publishedAt,
    stats: readWorkStats(item.stats),
    transcript: null,
    transcriptStatus: "none",
    transcriptAttempts: 0,
  }
}

export async function runAccountWorksSync(
  store: AccountWorksSyncStorePort,
  options: { bindingId?: string; now?: string } = {},
): Promise<AccountWorksSyncSummary> {
  const now = options.now ?? new Date().toISOString()
  const bindings = (await store.listBindings()).filter((binding) =>
    options.bindingId ? binding.id === options.bindingId : true,
  )

  const summaries: BindingSyncSummary[] = []
  for (const binding of bindings) {
    try {
      const fetched = await store.fetchWorks(binding)
      const incoming = fetched.map(toAccountWork)
      const existing = await store.loadExisting(binding.id)
      const merged = dedupeAndMergeWorks(existing, incoming)
      const { upserted } = await store.saveMerged({
        bindingId: binding.id,
        userId: binding.userId,
        projectId: binding.projectId,
        works: merged,
      })
      const digest = buildAccountHistoryDigest(merged, { now })
      const plan = planTranscriptExtraction(merged, { now })
      summaries.push({
        bindingId: binding.id,
        userId: binding.userId,
        projectId: binding.projectId,
        fetched: fetched.length,
        totalWorks: digest.totalWorks,
        upserted,
        withinWindow: digest.publishedWithinWindow,
        transcriptPlanCount: plan.length,
        digestHash: digest.hash,
        error: null,
      })
    } catch (error) {
      summaries.push({
        bindingId: binding.id,
        userId: binding.userId,
        projectId: binding.projectId,
        fetched: 0,
        totalWorks: 0,
        upserted: 0,
        withinWindow: 0,
        transcriptPlanCount: 0,
        digestHash: "",
        error: error instanceof Error ? error.message : "同步失败",
      })
    }
  }

  return {
    ranAt: now,
    bindings: summaries,
    okCount: summaries.filter((item) => item.error === null).length,
    failedCount: summaries.filter((item) => item.error !== null).length,
  }
}
