import { env } from "@/env"
// ─── 微信公众号后端服务 ─────────────────────────────────
// 封装微信公众号服务端 API：access_token、素材上传、草稿箱新增
// 环境变量：WECHAT_APP_ID, WECHAT_APP_SECRET, WECHAT_DEFAULT_AUTHOR

import { redis } from "@/lib/redis"

const WECHAT_API_BASE = "https://api.weixin.qq.com"
const ACCESS_TOKEN_CACHE_KEY = "wechat:access_token"
const ACCESS_TOKEN_TTL_SECONDS = 7000 // ~2h, 提前 200s 刷新

export class WechatOfficialAccountError extends Error {
  constructor(
    message: string,
    public readonly code: number,
  ) {
    super(message)
    this.name = "WechatOfficialAccountError"
  }
}

export interface WechatDraftParams {
  title: string
  author: string
  digest: string
  content: string // HTML
  thumbMediaId: string
  contentSourceUrl?: string
}

export interface WechatDraftResult {
  mediaId: string
  appmsgId: string
}

export class WechatOfficialAccount {
  private readonly appId: string
  private readonly appSecret: string

  constructor() {
    const appId = env.WECHAT_APP_ID
    const appSecret = env.WECHAT_APP_SECRET
    if (!appId || !appSecret) {
      throw new WechatOfficialAccountError(
        "WECHAT_APP_ID 和 WECHAT_APP_SECRET 必须配置",
        503,
      )
    }
    this.appId = appId
    this.appSecret = appSecret
  }

  /** 获取 access_token，优先读 Redis 缓存 */
  async getAccessToken(): Promise<string> {
    // 先尝试从 Redis 读取缓存
    try {
      const cached = await redis.get(ACCESS_TOKEN_CACHE_KEY)
      if (cached) return cached
    } catch {
      // Redis 不可用时直接走 API
    }

    // 调用微信 API 获取新 token
    const url = `${WECHAT_API_BASE}/cgi-bin/token?grant_type=client_credential&appid=${this.appId}&secret=${this.appSecret}`
    const response = await fetch(url)
    const data = (await response.json()) as Record<string, unknown>

    if (data.errcode) {
      throw new WechatOfficialAccountError(
        `获取 access_token 失败: ${data.errmsg} (${data.errcode})`,
        502,
      )
    }

    const token = data.access_token as string
    if (!token) {
      throw new WechatOfficialAccountError("获取 access_token 返回为空", 502)
    }

    // 写入 Redis 缓存
    try {
      await redis.set(
        ACCESS_TOKEN_CACHE_KEY,
        token,
        "EX",
        ACCESS_TOKEN_TTL_SECONDS,
      )
    } catch {
      // Redis 写入失败不影响主流程
    }

    return token
  }

  /** 上传封面图（thumb_media_id） */
  async uploadThumbMedia(imageBuffer: ArrayBuffer, filename: string): Promise<string> {
    const token = await this.getAccessToken()
    const url = `${WECHAT_API_BASE}/cgi-bin/material/add_material?access_token=${token}&type=thumb`

    const formData = new FormData()
    formData.append("media", new Blob([imageBuffer]), filename)

    const response = await fetch(url, { method: "POST", body: formData })
    const data = (await response.json()) as Record<string, unknown>

    if (data.errcode) {
      throw new WechatOfficialAccountError(
        `封面上传失败: ${data.errmsg} (${data.errcode})`,
        502,
      )
    }

    return data.media_id as string
  }

  /** 上传临时图文素材内的图片，返回微信图片 URL */
  async uploadImageForContent(imageBuffer: ArrayBuffer, filename: string): Promise<string> {
    const token = await this.getAccessToken()
    const url = `${WECHAT_API_BASE}/cgi-bin/media/uploadimg?access_token=${token}`

    const formData = new FormData()
    formData.append("media", new Blob([imageBuffer]), filename)

    const response = await fetch(url, { method: "POST", body: formData })
    const data = (await response.json()) as Record<string, unknown>

    if (data.errcode) {
      throw new WechatOfficialAccountError(
        `正文图片上传失败: ${data.errmsg} (${data.errcode})`,
        502,
      )
    }

    return data.url as string
  }

  /** 新建草稿（draft/add） */
  async createDraft(params: WechatDraftParams): Promise<WechatDraftResult> {
    const token = await this.getAccessToken()
    const url = `${WECHAT_API_BASE}/cgi-bin/draft/add?access_token=${token}`

    const body = {
      articles: [
        {
          title: params.title,
          author: params.author,
          digest: params.digest,
          content: params.content,
          thumb_media_id: params.thumbMediaId,
          ...(params.contentSourceUrl
            ? { content_source_url: params.contentSourceUrl }
            : {}),
        },
      ],
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    const data = (await response.json()) as Record<string, unknown>

    if (data.errcode) {
      throw new WechatOfficialAccountError(
        `草稿创建失败: ${data.errmsg} (${data.errcode})`,
        502,
      )
    }

    return {
      mediaId: data.media_id as string,
      appmsgId: data.appmsgid as string,
    }
  }
}

/** 获取默认作者名 */
export function getWechatDefaultAuthor(fallback: string = "明远"): string {
  return env.WECHAT_DEFAULT_AUTHOR || fallback
}
