import { createHash } from "node:crypto"
import { prisma } from "@/lib/prisma"
import {
  fetchVideoTextExtractionResult,
  submitVideoTextExtractionTask,
} from "@/lib/video-text-extractor"

const POLL_ATTEMPTS = 8
const POLL_WAIT_MS = 4000

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type AssetRow = {
  id: string
  shareUrl: string | null
  transcript: string | null
  transcriptStatus: string
}

type AssetDelegate = {
  findUnique(args: unknown): Promise<AssetRow | null>
  update(args: unknown): Promise<AssetRow>
}

function assets(): AssetDelegate | null {
  return (prisma as unknown as { accountWorkAsset?: AssetDelegate }).accountWorkAsset ?? null
}

export function transcriptContentHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex")
}

export async function extractAccountWorkTranscript(assetId: string): Promise<{
  extracted: boolean
  skipped: boolean
  reason?: string
}> {
  const delegate = assets()
  if (!delegate) return { extracted: false, skipped: true, reason: "table_missing" }
  const row = await delegate.findUnique({ where: { id: assetId } })
  if (!row) return { extracted: false, skipped: true, reason: "missing" }
  if (row.transcript?.trim()) return { extracted: false, skipped: true, reason: "already_extracted" }
  if (!row.shareUrl) {
    await delegate.update({ where: { id: assetId }, data: { transcriptStatus: "skipped" } })
    return { extracted: false, skipped: true, reason: "no_share_url" }
  }

  await delegate.update({ where: { id: assetId }, data: { transcriptStatus: "extracting" } })
  try {
    const submitted = await submitVideoTextExtractionTask(row.shareUrl)
    let transcript = ""
    for (let i = 0; i < POLL_ATTEMPTS; i += 1) {
      const result = await fetchVideoTextExtractionResult(submitted.batchId)
      if (result.status === "completed" && result.transcript?.trim()) {
        transcript = result.transcript.trim()
        break
      }
      if (result.status === "failed") throw new Error(result.errorMessage || "逐字稿提取失败")
      await wait(POLL_WAIT_MS)
    }
    if (!transcript) throw new Error("逐字稿提取超时")
    await delegate.update({
      where: { id: assetId },
      data: {
        transcript,
        transcriptHash: transcriptContentHash(transcript),
        transcriptStatus: "ready",
      },
    })
    return { extracted: true, skipped: false }
  } catch (error) {
    await delegate.update({
      where: { id: assetId },
      data: { transcriptStatus: "failed" },
    })
    throw error
  }
}
