import { env } from "@/env"
import crypto from "crypto"

// 全局缓存 Token 避免每次请求都重新生成
let cachedToken: string | null = null
let tokenExpireTime = 0 // 单位：秒（Unix timestamp）

function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/\+/g, "%20")
    .replace(/\*/g, "%2A")
    .replace(/%7E/g, "~")
}

/**
 * 自动使用原生的 crypto 模块，计算阿里云签名，换取 NLS Token
 */
/**
 * @description 获取aliyunnlstoken
 * @returns Promise<string>
 */
export async function getAliyunNlsToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  // 如果缓存未过期（预留 60 秒缓冲区），直接返回
  if (cachedToken && tokenExpireTime > now + 60) {
    return cachedToken
  }

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

  const regionId = "cn-shanghai"
  const timestamp = new Date().toISOString().replace(/\.\d{3}/, "") // YYYY-MM-DDTHH:mm:ssZ

  const queryParams: Record<string, string> = {
    AccessKeyId: accessKeyId,
    Action: "CreateToken",
    Format: "JSON",
    RegionId: regionId,
    SignatureMethod: "HMAC-SHA1",
    SignatureNonce: crypto.randomUUID(),
    SignatureVersion: "1.0",
    Timestamp: timestamp,
    Version: "2019-02-28",
  }

  // 升序排列参数
  const sortedKeys = Object.keys(queryParams).sort()
  const canonicalizedQueryString = sortedKeys
    .map((key) => `${percentEncode(key)}=${percentEncode(queryParams[key])}`)
    .join("&")

  // 构建待签名字符串
  const stringToSign = `GET&${percentEncode("/")}&${percentEncode(canonicalizedQueryString)}`

  // 计算签名
  const signature = crypto
    .createHmac("sha1", accessKeySecret + "&")
    .update(stringToSign)
    .digest("base64")

  // 构建最终请求 URL
  const requestUrl = `https://nls-meta.cn-shanghai.aliyuncs.com/?${canonicalizedQueryString}&Signature=${percentEncode(signature)}`

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
