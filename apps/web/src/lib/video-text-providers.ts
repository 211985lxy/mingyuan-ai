import {
  assertVideoTextProviderReady,
  fetchVideoTextExtractionResult,
  submitVideoTextExtractionTask,
} from "@/lib/video-text-extractor"
import type { VideoTextExtractionResult } from "@/lib/video-text-extractor"

/**
 * 视频文案提取服务商抽象。
 * submitTask 返回 providerBatchId；fetchResult 返回统一的三态结果，
 * 与 video-processor.ts 的轮询编排保持一致。
 */

export interface VideoTextProvider {
  name: string
  submitTask(url: string): Promise<{ batchId: string }>
  fetchResult(batchId: string): Promise<VideoTextExtractionResult>
}

/** @deprecated 新调用方使用 VideoTextExtractionResult；保留旧类型名兼容现有导入。 */
export interface VideoTextTaskResult {
  status: "pending" | "processing" | "completed" | "failed"
  transcript?: string
  title?: string
  errorMessage?: string
}

/** 轻抖（qingdou.vip）：复用 video-text-extractor 中已有的提交与回读实现。 */
export const qingdouProvider: VideoTextProvider = {
  name: "qingdou",
  submitTask: submitVideoTextExtractionTask,
  fetchResult: fetchVideoTextExtractionResult,
}

/** 视频号尚未完成真实服务商联调，保持明确失败，不伪装成可用能力。 */
const channelsProvider: VideoTextProvider = {
  name: "channels-unavailable",
  async submitTask() {
    assertVideoTextProviderReady("channels")
    throw new Error("视频号文案提取服务尚未完成真实联调")
  },
  async fetchResult() {
    assertVideoTextProviderReady("channels")
    throw new Error("视频号文案提取服务尚未完成真实联调")
  },
}

export function getVideoTextProvider(platform: string): VideoTextProvider {
  return platform === "channels" ? channelsProvider : qingdouProvider
}
