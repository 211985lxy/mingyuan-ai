import {
  VIDEO_TEXT_EXTRACT_USER_AGENT,
  parseVideoTextSubmitResult,
  parseVideoTextTaskResult,
  fetchVideoTextExtractionResult,
  submitVideoTextExtractionTask,
} from "@/lib/video-text-extractor"
import type { VideoTextExtractionResult } from "@/lib/video-text-extractor"

/**
 * 视频文案提取服务商抽象。
 * submitTask 返回 providerBatchId；fetchResult 返回统一的三态结果
 * （extracting / completed / failed），与编排层的轮询流程保持一致。
 */
export interface VideoTextProvider {
  name: string
  submitTask(url: string): Promise<{ batchId: string }>
  fetchResult(batchId: string): Promise<VideoTextExtractionResult>
}

/** 轻抖（qingdou.vip）：默认服务商，委托给 video-text-extractor 里的现有实现。 */
export const qingdouProvider: VideoTextProvider = {
  name: "qingdou",
  submitTask: (url) => submitVideoTextExtractionTask(url),
  fetchResult: (batchId) => fetchVideoTextExtractionResult(batchId),
}

const CHANNELS_SUBMIT_PATH = "/web/api/commitGetTextTask"
const CHANNELS_RESULT_PATH = "/web/api/getTaskResult"

function getChannelsConfig(): { baseUrl: string; apiKey: string } {
  const baseUrl = process.env.CHANNELS_EXTRACT_API_URL?.trim().replace(/\/+$/, "")
  const apiKey = process.env.CHANNELS_EXTRACT_API_KEY?.trim()
  if (!baseUrl || !apiKey) {
    throw new Error("视频号文案提取服务未配置，请联系管理员配置 CHANNELS_EXTRACT_API_URL 和 CHANNELS_EXTRACT_API_KEY")
  }
  return { baseUrl, apiKey }
}

function getChannelsHeaders(apiKey: string): HeadersInit {
  return {
    "content-type": "application/json",
    "user-agent": VIDEO_TEXT_EXTRACT_USER_AGENT,
    "x-api-key": apiKey,
  }
}

async function readChannelsJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text()
  if (!response.ok) {
    throw new Error(text || `request failed: ${response.status}`)
  }
  if (!text) return {}
  return JSON.parse(text) as Record<string, unknown>
}

/**
 * 视频号专用服务商。
 *
 * TODO: 服务商尚未确定。当前按与轻抖一致的"提交任务 / 轮询结果"协议实现：
 *   - POST {CHANNELS_EXTRACT_API_URL}/web/api/commitGetTextTask
 *       header: x-api-key；body: { userInputList: [{ numberIndex, url }] }
 *   - GET  {CHANNELS_EXTRACT_API_URL}/web/api/getTaskResult?batchId=xxx
 * 接入真实服务商时，按其文档调整以下三处的请求 / 响应映射：
 *   - submitTask 的请求路径、header 与 body
 *   - fetchResult 的请求路径与参数
 *   - parseVideoTextSubmitResult / parseVideoTextTaskResult 的字段映射
 *     （若响应结构不同，在本文件内另写解析函数，不要改动轻抖的解析逻辑）
 */
export const channelsProvider: VideoTextProvider = {
  name: "channels",
  async submitTask(url) {
    const { baseUrl, apiKey } = getChannelsConfig()
    const response = await fetch(`${baseUrl}${CHANNELS_SUBMIT_PATH}`, {
      method: "POST",
      headers: getChannelsHeaders(apiKey),
      body: JSON.stringify({
        userInputList: [{ numberIndex: 0, url }],
      }),
    })
    return parseVideoTextSubmitResult(await readChannelsJson(response))
  },
  async fetchResult(batchId) {
    const { baseUrl, apiKey } = getChannelsConfig()
    const url = new URL(`${baseUrl}${CHANNELS_RESULT_PATH}`)
    url.searchParams.set("batchId", batchId)
    const response = await fetch(url, {
      method: "GET",
      headers: getChannelsHeaders(apiKey),
    })
    return parseVideoTextTaskResult(await readChannelsJson(response))
  },
}

/** 按平台路由提取服务商：视频号走专用服务商，其余平台统一走轻抖。 */
export function getVideoTextProvider(platform: string): VideoTextProvider {
  if (platform === "channels") return channelsProvider
  return qingdouProvider
}
