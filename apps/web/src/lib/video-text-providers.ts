/**
 * 视频文案提取 Provider 注册表（stub — 完整实现待合入）。
 *
 * 为与 video-processor.ts 中的异步轮询调用保持一致，
 * 接口统一为 submitTask → fetchResult 两阶段。
 */

export interface VideoTextTaskResult {
  status: "pending" | "processing" | "completed" | "failed"
  transcript?: string
  title?: string
  errorMessage?: string
}

export interface VideoTextProvider {
  name: string
  submitTask(url: string): Promise<{ batchId: string }>
  fetchResult(batchId: string): Promise<VideoTextTaskResult>
}

const stubProvider: VideoTextProvider = {
  name: "stub",
  async submitTask(_url) {
    return { batchId: "stub-unavailable" }
  },
  async fetchResult(_batchId) {
    return {
      status: "failed",
      errorMessage: "video-text-providers 模块尚未完整合入，暂不可用",
    }
  },
}

export function getVideoTextProvider(_platform: string): VideoTextProvider {
  return stubProvider
}
