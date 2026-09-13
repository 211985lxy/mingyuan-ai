import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import {
  runAccountWorksSync,
  type AccountWorksFetchResult,
  type AccountWorksSyncStorePort,
  type AccountWorksSyncSummary,
} from "@/lib/aim/account-works-sync"
import { fetchAccountWorks } from "@/lib/aim/account-works-source"
import { readWorkStats, type AccountWorkLike } from "@/lib/aim/account-work-assets"

const VIDEO_FETCH_MAX = 50

/**
 * 作品取数：抖音官方「授权账号作品列表」能力已下线（实测 28001056），
 * 改走第三方公开数据通道（TikHub 主 / 红狐备），全部失败时抛错（不返回空数组造成假绿）。
 */
async function fetchWorks(binding: { id: string; userId: string }): Promise<AccountWorksFetchResult> {
  const row = await prisma.douyinAccountBinding.findFirst({
    where: { id: binding.id, userId: binding.userId },
    select: { id: true, userId: true, secUserId: true, profileUrl: true },
  })
  if (!row) throw Object.assign(new Error("绑定不存在"), { code: "missing" })
  return fetchAccountWorks({
    secUserId: row.secUserId,
    profileUrl: row.profileUrl,
    count: VIDEO_FETCH_MAX,
  })
}

async function listBindingsWithProject(): Promise<Array<{ id: string; userId: string; projectId: string | null }>> {
  const rows = await prisma.douyinAccountBinding.findMany({
    select: { id: true, userId: true },
    orderBy: { createdAt: "asc" },
    take: 100,
  })
  // 项目归属以账号绑定为准（row-ownership：一个 AIM 账号绑定一个 IP 项目）。
  const projectByUser = new Map<string, string | null>()
  for (const binding of rows) {
    if (projectByUser.has(binding.userId)) continue
    const user = await prisma.user.findUnique({
      where: { id: binding.userId },
      select: { boundProjectId: true },
    })
    projectByUser.set(binding.userId, user?.boundProjectId ?? null)
  }
  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    projectId: projectByUser.get(row.userId) ?? null,
  }))
}

async function loadExistingWorks(bindingId: string) {
  const rows = await prisma.accountWorkAsset.findMany({
    where: { bindingId },
    select: {
      externalWorkId: true,
      title: true,
      coverUrl: true,
      publishedAt: true,
      stats: true,
      transcript: true,
      transcriptStatus: true,
      transcriptAttempts: true,
    },
    take: 500,
  })
  return rows.map((row) => ({
    externalWorkId: row.externalWorkId,
    title: row.title,
    coverUrl: row.coverUrl,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    stats: readWorkStats(row.stats),
    transcript: row.transcript,
    transcriptStatus: (row.transcriptStatus as "none" | "pending" | "ready" | "failed") ?? "none",
    transcriptAttempts: row.transcriptAttempts,
  }))
}

async function saveMergedWorks(input: {
  bindingId: string
  projectId: string | null
  works: AccountWorkLike[]
}): Promise<{ upserted: number }> {
  let upserted = 0
  for (const work of input.works) {
    await prisma.accountWorkAsset.upsert({
      where: {
        bindingId_externalWorkId: { bindingId: input.bindingId, externalWorkId: work.externalWorkId },
      },
      create: {
        bindingId: input.bindingId,
        projectId: input.projectId,
        platform: "douyin",
        externalWorkId: work.externalWorkId,
        title: work.title,
        coverUrl: work.coverUrl,
        publishedAt: work.publishedAt ? new Date(work.publishedAt) : null,
        stats: work.stats as unknown as Prisma.InputJsonValue,
        transcript: work.transcript,
        transcriptStatus: work.transcriptStatus,
        transcriptAttempts: work.transcriptAttempts,
        lastSyncedAt: new Date(),
      },
      update: {
        projectId: input.projectId,
        title: work.title,
        coverUrl: work.coverUrl,
        publishedAt: work.publishedAt ? new Date(work.publishedAt) : null,
        stats: work.stats as unknown as Prisma.InputJsonValue,
        lastSyncedAt: new Date(),
      },
    })
    upserted += 1
  }
  return { upserted }
}

export function createPrismaAccountWorksSyncStore(): AccountWorksSyncStorePort {
  return {
    listBindings: listBindingsWithProject,
    fetchWorks,
    loadExisting: loadExistingWorks,
    saveMerged: saveMergedWorks,
  }
}

export async function runAccountWorksSyncWithPrisma(options: {
  bindingId?: string
} = {}): Promise<AccountWorksSyncSummary> {
  return runAccountWorksSync(createPrismaAccountWorksSyncStore(), options)
}
