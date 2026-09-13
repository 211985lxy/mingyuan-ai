"use client"

import { request } from "./core"

/** 公共数字人形象形态（服务端已按可下单条件过滤）。 */
export type PublicDigitalPersonFigure = {
  type: string
  width: number
  height: number
}

/** 公共数字人条目（蝉镜开放平台，服务端代理后归一）。 */
export type PublicDigitalPersonOption = {
  id: string
  name: string
  gender: string | null
  /** 形象绑定的默认音色；缺失时用响应里的 fallbackVoiceId 兜底 */
  defaultVoiceId: string | null
  voiceName: string | null
  figures: PublicDigitalPersonFigure[]
}

export type PublicDigitalPersonList =
  | { status: "not_configured"; message: string }
  | { status: "error"; message: string }
  | {
      status: "ok"
      persons: PublicDigitalPersonOption[]
      fallbackVoiceId: string | null
      fetchedAt: string
    }

/**
 * @description 列出蝉镜公共数字人（服务端代理，令牌不出服务端）
 */
export async function listPublicDigitalPersons(): Promise<PublicDigitalPersonList> {
  return request<PublicDigitalPersonList>("/api/digital-human/public-persons?page=1&size=20", {
    timeout: 20000,
  })
}
