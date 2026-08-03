import { env } from "@/env"
import crypto from "crypto"

// 全局缓存 Token 避免每次请求都重新生成
let cachedToken: string | null = null
let tokenExpireTime = 0 // 单位：秒（Unix timestamp）

function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/\+/g, "%20")
    .replace(/\*/g, "%2A")
    .replace("%7E", "~")
}

/**
 * 阿里云 AccessKey 来源：优先视觉服务专用 AK，回退 OSS 通用 AK。
 * 录音文件识别与一句话识别共用同一套 AK（POP RPC 签名鉴权）。
 */
function resolveAliyunAccessKey(): { accessKeyId: string; accessKeySecret: string } {
  const accessKeyId =
    env.ALIYUN_VIAPI_ACCESS_KEY_ID ||
    env.OSS_ACCESS_KEY_ID ||
    ""
  const accessKeySecret =
    env.ALIYUN_VIAPI_ACCESS_KEY_SECRET ||
    env.OSS_ACCESS_KEY_SECRET ||
    ""
  if (!accessKeyId || !accessKeySecret) {
    throw new Error("未配置阿里云 AccessKey 环境变量（OSS_ACCESS_KEY_ID 和 OSS_ACCESS_KEY_SECRET）")
  }
  return { accessKeyId, accessKeySecret }
}

/**
 * 构造阿里云 POP RPC 请求 URL（含 HMAC-SHA1 签名）。
 * 供一句话识别取 Token、录音文件识别提交/查询复用，避免签名逻辑分叉。
 *
 * @param args.endpoint   POP 产品域名，如 nls-meta.cn-shanghai.aliyuncs.com / filetrans.cn-shanghai.aliyuncs.com
 * @param args.regionId   地域，如 cn-shanghai
 * @param args.action     RPC Action 名
 * @param args.version    POP API 版本（如 2019-02-28 / 2019-08-23）
 * @param args.params     业务参数（已编码为 string）
 */
function signPopRpcRequest(args: {
  endpoint: string
  regionId: string
  action: string
  version: string
  params: Record<string, string>
  accessKeyId: string
  accessKeySecret: string
}): string {
  const queryParams: Record<string, string> = {
    AccessKeyId: args.accessKeyId,
    Action: args.action,
    Format: "JSON",
    RegionId: args.regionId,
    SignatureMethod: "HMAC-SHA1",
    SignatureNonce: crypto.randomUUID(),
    SignatureVersion: "1.0",
    Timestamp: new Date().toISOString().replace(/\.\d{3}/, ""),
    Version: args.version,
    ...args.params,
  }

  // 升序排列参数
  const sortedKeys = Object.keys(queryParams).sort()
  const canonicalizedQueryString = sortedKeys
    .map((key) => `${percentEncode(key)}=${percentEncode(queryParams[key])}`)
    .join("&")

  // 构建待签名字符串
  const stringToSign = `GET&${percentEncode("/")}&${percentEncode(canonicalizedQueryString)}`

  // 计算签名（HMAC-SHA1，key 末尾拼 "&"）
  const signature = crypto
    .createHmac("sha1", args.accessKeySecret + "&")
    .update(stringToSign)
    .digest("base64")

  return `https://${args.endpoint}/?${canonicalizedQueryString}&Signature=${percentEncode(signature)}`
}

/**
 * 获取阿里云智能语音交互 NLS Token（供一句话识别鉴权用）。
 * 签名经 signPopRpcRequest 统一构造。
 */
export async function getAliyunNlsToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  // 缓存未过期（预留 60 秒缓冲区）直接返回
  if (cachedToken && tokenExpireTime > now + 60) {
    return cachedToken
  }

  const { accessKeyId, accessKeySecret } = resolveAliyunAccessKey()

  const requestUrl = signPopRpcRequest({
    endpoint: "nls-meta.cn-shanghai.aliyuncs.com",
    regionId: "cn-shanghai",
    action: "CreateToken",
    version: "2019-02-28",
    params: {},
    accessKeyId,
    accessKeySecret,
  })

  const response = await fetch(requestUrl, {
    method: "GET",
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`获取阿里云 NLS Token 失败: Status ${response.status}, ${errorText}`)
  }

  const data = await response.json()
  if (data.Token && data.Token.Id) {
    const tokenId = data.Token.Id as string
    cachedToken = tokenId
    tokenExpireTime = data.Token.ExpireTime // 阿里云返回的过期时间（秒级时间戳）
    return tokenId
  } else {
    throw new Error(`获取阿里云 NLS Token 响应不完整: ${JSON.stringify(data)}`)
  }
}

/**
 * 调用阿里云一句话识别服务，将 WAV 二进制音频文件转写为文本
 * 限制：音频时长不超过 60 秒，建议采样率为 16000Hz 单声道 16bit WAV 格式
 */
/**
 * @description transcribeaudiowav
 * @param audioBuffer - audio缓冲区
 * @returns Promise<string>
 */
export async function transcribeAudioWav(audioBuffer: Buffer): Promise<string> {
  const appKey = env.ALIYUN_NLS_APP_KEY || ""
  if (!appKey) {
    throw new Error("未配置阿里云智能语音交互 AppKey (ALIYUN_NLS_APP_KEY)")
  }

  const token = await getAliyunNlsToken()

  // 阿里云一句话识别 RESTful API
  // 必须配置 sample_rate 为 16000 或者 8000
  const url = `https://nls-gateway.cn-shanghai.aliyuncs.com/stream/v1/asr?appkey=${appKey}&format=wav&sample_rate=16000`

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "X-NLS-Token": token,
      "Content-Type": "application/octet-stream",
    },
    body: new Uint8Array(audioBuffer),
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`阿里云语音转写失败: Status ${response.status}, ${errorText}`)
  }

  const data = await response.json()
  if (data.status === 20000000) {
    return data.result || ""
  } else {
    throw new Error(`语音转写识别失败，错误码：${data.status}，详情：${data.message || "未知错误"}`)
  }
}

// ── 录音文件识别（长音频 + 说话人分离）──────────────────────────────
// 与上面「一句话识别」并存，互不影响。一句话识别面向 ≤60s 短语音；
// 录音文件识别面向整场会议录音（≤12h，说话人分离建议 ≤2h）。
// 产品 nls-filetrans，端点 filetrans.cn-shanghai.aliyuncs.com。

const FILETRANS_ENDPOINT = "filetrans.cn-shanghai.aliyuncs.com"
const FILETRANS_REGION = "cn-shanghai"
const FILETRANS_VERSION = "2018-08-17"
const FILETRANS_SUBMIT_ACTION = "SubmitTask"
const FILETRANS_QUERY_ACTION = "GetTaskResult"

// 任务状态码（来自官方文档，非 21xxxxx 成功态为失败）
const STATUS_SUCCESS = 21050000 // SUCCESS
const STATUS_RUNNING = 21050001 // RUNNING（识别中）
const STATUS_QUEUEING = 21050002 // QUEUEING（排队中）

/** 录音文件识别单段结果（按 ChannelId 区分发言人）。 */
export interface FileTranscriptionSegment {
  /** 映射后的发言人标签，如「发言人A」「发言人B」（由 channelId 顺序映射）。 */
  speaker: string
  /** 原始声道/发言人编号。 */
  channelId: number
  /** 起止时间戳（毫秒）。 */
  startMs: number
  endMs: number
  text: string
}

/** 录音文件识别归一化结果。 */
export interface FileTranscriptionResult {
  taskId: string
  /** 按 ChannelId 切分的逐段结果（结构化，供存档/检索）。 */
  segments: FileTranscriptionSegment[]
  /** 带说话人前缀的可读逐字稿，可直接喂入 meeting-insight 管道（吃 string）。 */
  readableTranscript: string
  stats: {
    segmentCount: number
    speakerCount: number
    durationSec: number
    totalChars: number
  }
}

/** 录音文件识别选项。 */
export interface TranscribeRecordingFileOptions {
  /** 预期说话人数（2-100）；不填则算法自动判断（supervise_type=0）。 */
  speakerNum?: number
  /** 轮询超时（毫秒），默认 10 分钟。 */
  pollTimeoutMs?: number
  /** 轮询间隔（毫秒），默认 5 秒。 */
  pollIntervalMs?: number
}

/**
 * 提交录音文件识别任务，返回 TaskId。
 * fileLink 必须是公网可访问的音频/视频 URL（推荐 OSS 签名 URL）。
 */
async function submitRecordingTask(
  fileLink: string,
  appKey: string,
  options: TranscribeRecordingFileOptions,
): Promise<string> {
  const task: Record<string, unknown> = {
    appkey: appKey,
    file_link: fileLink,
    version: "4.0",
    auto_split: true, // 说话人分离
    enable_words: false,
    enable_sample_rate_adaptive: true,
  }
  if (options.speakerNum && options.speakerNum >= 2) {
    task.supervise_type = 1 // 1 = 手动指定说话人数
    task.speaker_num = options.speakerNum
  }

  const { accessKeyId, accessKeySecret } = resolveAliyunAccessKey()
  // SubmitTask 为 POST，但 POP RPC 签名固定按 GET 签（阿里云 POP 惯例）。
  const requestUrl = signPopRpcRequest({
    endpoint: FILETRANS_ENDPOINT,
    regionId: FILETRANS_REGION,
    action: FILETRANS_SUBMIT_ACTION,
    version: FILETRANS_VERSION,
    params: { Task: JSON.stringify(task) },
    accessKeyId,
    accessKeySecret,
  })

  const response = await fetch(requestUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`录音文件识别提交失败: Status ${response.status}, ${errorText}`)
  }
  const data = await response.json()
  const taskId = data?.TaskId
  if (!taskId) {
    throw new Error(`录音文件识别提交未返回 TaskId: ${JSON.stringify(data)}`)
  }
  return String(taskId)
}

/**
 * 轮询录音文件识别结果，直到 SUCCESS 或超时/失败。
 */
async function pollRecordingTask(
  taskId: string,
  options: TranscribeRecordingFileOptions,
): Promise<Record<string, unknown>> {
  const { accessKeyId, accessKeySecret } = resolveAliyunAccessKey()
  const timeoutMs = options.pollTimeoutMs ?? 600_000
  const intervalMs = options.pollIntervalMs ?? 5_000
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const requestUrl = signPopRpcRequest({
      endpoint: FILETRANS_ENDPOINT,
      regionId: FILETRANS_REGION,
      action: FILETRANS_QUERY_ACTION,
      version: FILETRANS_VERSION,
      params: { TaskId: taskId },
      accessKeyId,
      accessKeySecret,
    })
    const response = await fetch(requestUrl, {
      method: "GET",
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`录音文件识别查询失败: Status ${response.status}, ${errorText}`)
    }
    const data = (await response.json()) as Record<string, unknown>
    const statusCode = Number(data.StatusCode ?? data.statusCode)

    if (statusCode === STATUS_SUCCESS) {
      return data
    }
    // RUNNING / QUEUEING 继续轮询；其他非成功码视为失败。
    if (statusCode !== STATUS_RUNNING && statusCode !== STATUS_QUEUEING) {
      throw new Error(
        `录音文件识别失败（StatusCode=${statusCode}）: ${data.StatusText ?? data.statusText ?? "未知错误"}`,
      )
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error(`录音文件识别轮询超时（${timeoutMs / 1000}s），TaskId=${taskId}`)
}

/**
 * 把录音文件识别的原始 Sentences 归一化为带说话人前缀的可读逐字稿。
 * channelId → 「发言人A/B/...」（顺序映射，非真实姓名——真实姓名对齐见 P4）。
 */
function buildFileTranscriptionResult(
  taskId: string,
  raw: Record<string, unknown>,
): FileTranscriptionResult {
  const result = (raw.Result ?? raw.result ?? {}) as Record<string, unknown>
  const sentences = (result.Sentences ?? result.sentences ?? []) as Array<Record<string, unknown>>
  if (!Array.isArray(sentences) || sentences.length === 0) {
    throw new Error(`录音文件识别结果无 Sentences，原始返回: ${JSON.stringify(raw).slice(0, 500)}`)
  }

  const channelLabel: Record<number, string> = {}
  const segments: FileTranscriptionSegment[] = []
  const lines: string[] = []
  for (const s of sentences) {
    const ch = Number(s.ChannelId ?? 0)
    if (!(ch in channelLabel)) {
      channelLabel[ch] = `发言人${String.fromCharCode("A".charCodeAt(0) + Object.keys(channelLabel).length)}`
    }
    const label = channelLabel[ch]
    const text = String(s.Text ?? "").trim()
    const startMs = Number(s.BeginTime ?? 0)
    const endMs = Number(s.EndTime ?? startMs)
    segments.push({ speaker: label, channelId: ch, startMs, endMs, text })
    lines.push(`${label}: ${text}`)
  }

  const readableTranscript = lines.join("\n")
  const durationSec = Math.round((segments[segments.length - 1]?.endMs ?? 0) / 1000)
  return {
    taskId,
    segments,
    readableTranscript,
    stats: {
      segmentCount: segments.length,
      speakerCount: Object.keys(channelLabel).length,
      durationSec,
      totalChars: readableTranscript.length,
    },
  }
}

/**
 * 录音文件识别：把公网音频 URL 转写为带说话人前缀的可读逐字稿。
 *
 * - 提交（SubmitTask，POST）→ 轮询（GetTaskResult，GET）直到 SUCCESS。
 * - 说话人分离通过 auto_split:true 开启，结果按 ChannelId 区分发言人。
 * - 输出 readableTranscript 可直接喂入 meeting-insight 管道（吃 string）。
 *
 * @param fileLink 公网可访问的音频/视频 URL（推荐 OSS 签名 URL）
 */
export async function transcribeRecordingFile(
  fileLink: string,
  options?: TranscribeRecordingFileOptions,
): Promise<FileTranscriptionResult> {
  const appKey = env.ALIYUN_NLS_APP_KEY?.trim() || ""
  if (!appKey) {
    throw new Error("未配置 ALIYUN_NLS_APP_KEY（录音文件识别需要智能语音交互项目 AppKey）")
  }
  if (!fileLink) {
    throw new Error("fileLink 为空：录音文件识别需要公网可访问的音频 URL")
  }

  const taskId = await submitRecordingTask(fileLink, appKey, options ?? {})
  const raw = await pollRecordingTask(taskId, options ?? {})
  return buildFileTranscriptionResult(taskId, raw)
}
