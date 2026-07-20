import type { ApiVideoCopyExtraction } from "@/types/api"

function durationToSeconds(value: string | null) {
  if (!value) return 0
  const clock = value.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/)
  if (clock) {
    const [, a, b, c] = clock
    return c ? Number(a) * 3600 + Number(b) * 60 + Number(c) : Number(a) * 60 + Number(b)
  }
  const minutes = value.match(/(\d+(?:\.\d+)?)\s*分钟/)
  if (minutes) return Number(minutes[1]) * 60
  const seconds = value.match(/^\d+$/)
  return seconds ? Number(value) : 0
}

/**
 * @description 判断视频文案拆解是否应打开深度文案编辑器（时长≥10分钟或转录文本≥1200字）
 * @param record - 视频拆解记录（包含时长和转录文本）
 * @returns 应打开深度编辑器返回 true，否则返回 false
 */
export function shouldOpenDeepCopywriter(record: Pick<ApiVideoCopyExtraction, "videoDuration" | "transcript">) {
  return durationToSeconds(record.videoDuration) >= 600 || (record.transcript?.length ?? 0) >= 1200
}
