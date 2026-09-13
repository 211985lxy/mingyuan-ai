import { prisma } from "@/lib/prisma"
import {
  renderAccountHistoryBlock,
  summarizeAccountHistory,
  TRANSCRIPT_LAZY_KIND,
  transcriptIdempotencyKey,
  type WorkSignalSnapshot,
} from "@/lib/aim/account-work-asset"
import { hashAccountHistory } from "@/lib/aim/account-work-sync"
import { enqueueBackgroundTask } from "@/lib/background-tasks"

type HistoryRow = {
  id: string
  title: string
  publishedAt: Date | null
  signalSnapshot: unknown
  transcript: string | null
  transcriptStatus: string
}

type AssetDelegate = {
  findMany(args: unknown): Promise<HistoryRow[]>
}

function assets(): AssetDelegate | null {
  return (prisma as unknown as { accountWorkAsset?: AssetDelegate }).accountWorkAsset ?? null
}

function asSignal(value: unknown): WorkSignalSnapshot | null {
  if (!value || typeof value !== "object") return null
  return value as WorkSignalSnapshot
}

export async function loadAccountHistoryContext(input: {
  userId: string
  projectId?: string | null
}): Promise<{ block: string; hash: string; count: number }> {
  if (!input.projectId) return { block: "", hash: "", count: 0 }
  const delegate = assets()
  if (!delegate) return { block: "", hash: "", count: 0 }
  const rows = await delegate.findMany({
    where: { userId: input.userId, projectId: input.projectId },
    orderBy: { publishedAt: "desc" },
    take: 80,
    select: {
      id: true,
      title: true,
      publishedAt: true,
      signalSnapshot: true,
      transcript: true,
      transcriptStatus: true,
    },
  })
  const summarized = summarizeAccountHistory(rows.map((row) => ({
    title: row.title,
    publishedAt: row.publishedAt,
    signalSnapshot: asSignal(row.signalSnapshot),
    transcript: row.transcript,
  })))
  const samples = rows.slice(0, 8)
  for (const sample of samples) {
    if (!sample.transcript && sample.transcriptStatus !== "extracting") {
      await enqueueBackgroundTask(prisma, {
        kind: TRANSCRIPT_LAZY_KIND,
        aggregateType: "account_work_asset",
        aggregateId: sample.id,
        idempotencyKey: transcriptIdempotencyKey(sample.id),
        maxAttempts: 2,
      }).catch(() => undefined)
    }
  }
  const block = renderAccountHistoryBlock({
    summary: summarized.summary,
    samples: samples.map((row) => ({
      title: row.title,
      transcript: row.transcript,
      publishedAt: row.publishedAt,
    })),
  })
  return { block, hash: block ? hashAccountHistory(block) : "", count: rows.length }
}
