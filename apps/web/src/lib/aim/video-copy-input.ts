import type { AimAgentId } from "@/lib/aim-ui-config"
import { agentAllowsVideoCopyExtraction } from "@/lib/aim/agent-capabilities"
import type { ApiVideoCopyExtraction } from "@/types/api"

const ACTIVE_VIDEO_COPY_STATUSES = new Set(["queued", "extracting", "analyzing"])
const VIDEO_URL_PATTERN = /https?:\/\/[^\s，。；、"'<>]+/gi
const VIDEO_HOST_SUFFIXES = [
  "douyin.com",
  "iesdouyin.com",
  "bilibili.com",
  "b23.tv",
  "kuaishou.com",
  "xiaohongshu.com",
  "xhslink.com",
  "youtube.com",
  "youtu.be",
]

function isSupportedVideoHost(hostname: string) {
  const host = hostname.toLowerCase()
  return VIDEO_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
}

/**
 * 仅能力矩阵授权 `videoCopyExtraction` 的专家接管视频链接；
 * 其他智能体继续按普通文本处理，避免能力串台。
 */
export function resolveContentProducerVideoUrl(agentId: AimAgentId, input: string): string | null {
  if (!agentAllowsVideoCopyExtraction(agentId)) return null
  const candidates = input.match(VIDEO_URL_PATTERN) ?? []
  for (const candidate of candidates) {
    const cleaned = candidate.replace(/[),.。]+$/, "")
    try {
      const parsed = new URL(cleaned)
      if (isSupportedVideoHost(parsed.hostname)) return parsed.toString()
    } catch {
      // 继续检查下一条候选链接。
    }
  }
  return null
}

export function buildContentProducerVideoCopyHref(input: {
  recordId: string
  projectId?: string
}) {
  const params = new URLSearchParams({
    agent: "content_producer",
    videoCopyExtractionId: input.recordId,
  })
  if (input.projectId) params.set("projectId", input.projectId)
  else params.set("mode", "quick")
  return `/aim?${params.toString()}`
}

interface CompleteVideoCopyExtractionDependencies {
  create: (url: string) => Promise<ApiVideoCopyExtraction>
  sync: (id: string) => Promise<ApiVideoCopyExtraction>
  wait?: (milliseconds: number) => Promise<void>
  pollIntervalMs?: number
  maxSyncAttempts?: number
}

const defaultWait = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds))

/**
 * 复用爆款拆解任务并等待“提取 + 分析”结束。任务超时后仍保留在爆款拆解记录中。
 */
export async function completeVideoCopyExtraction(
  url: string,
  dependencies: CompleteVideoCopyExtractionDependencies,
) {
  const wait = dependencies.wait ?? defaultWait
  const interval = dependencies.pollIntervalMs ?? 2500
  const maxAttempts = dependencies.maxSyncAttempts ?? 48
  let record = await dependencies.create(url)

  for (let attempt = 0; ACTIVE_VIDEO_COPY_STATUSES.has(record.status) && attempt < maxAttempts; attempt += 1) {
    await wait(interval)
    record = await dependencies.sync(record.id)
  }

  if (ACTIVE_VIDEO_COPY_STATUSES.has(record.status)) {
    throw new Error("视频仍在提取中，请稍后到「爆款拆解」查看结果。")
  }
  if (record.status === "failed") {
    throw new Error(record.errorMessage || "文案提取失败，请换一个视频链接重试。")
  }
  if (!record.transcript?.trim()) {
    throw new Error("没有提取到可用文案，请换一个视频链接重试。")
  }
  return record
}
