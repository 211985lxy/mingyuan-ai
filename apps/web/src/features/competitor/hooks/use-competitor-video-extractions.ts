import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
  extractWatchAccountVideo,
  syncVideoCopyExtraction,
} from "@/lib/api/client"
import {
  getCompetitorVideoPageUrl,
  isActiveVideoExtractionStatus,
  type CompetitorWatchVideo,
} from "@/components/competitor/competitor-video-sections"
import type { ApiVideoCopyExtraction } from "@/types/api"

/**
 * @description React Hook：competitorvideoextractions
 * @returns 无返回值
 */
export function useCompetitorVideoExtractions() {
  const [extractingVideoId, setExtractingVideoId] = useState<string | null>(null)
  const [videoExtractions, setVideoExtractions] = useState<Record<string, ApiVideoCopyExtraction>>({})

  async function extractVideo(video: CompetitorWatchVideo) {
    const key = `${video.account.id}-${video.videoId}`
    setExtractingVideoId(key)
    try {
      const record = await extractWatchAccountVideo({
        watchAccountId: video.account.id,
        videoUrl: getCompetitorVideoPageUrl(video),
        videoTitle: video.title,
        coverUrl: video.coverUrl,
      })
      setVideoExtractions((previous) => ({ ...previous, [key]: record }))
      if (record.status === "failed") {
        toast.error(record.errorMessage || "文案提取失败")
      } else {
        toast.success("已创建文案拆解任务")
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建文案拆解任务失败")
    } finally {
      setExtractingVideoId(null)
    }
  }

  useEffect(() => {
    const active = Object.entries(videoExtractions).find(([, record]) =>
      isActiveVideoExtractionStatus(record.status),
    )
    if (!active) return

    const [key, record] = active
    const timer = window.setTimeout(() => {
      syncVideoCopyExtraction(record.id)
        .then((next) => setVideoExtractions((previous) => ({ ...previous, [key]: next })))
        .catch(() => {})
    }, 2500)

    return () => window.clearTimeout(timer)
  }, [videoExtractions])

  return { extractingVideoId, videoExtractions, extractVideo }
}
