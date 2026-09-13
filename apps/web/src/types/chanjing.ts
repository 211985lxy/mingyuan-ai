/** Standard ChanJing OpenAPI response wrapper. */
export interface ChanjingResponse<T = unknown> {
  code: number
  msg: string
  data: T
  trace_id?: string
}

export interface ChanjingAccessTokenData {
  access_token: string
  expire_in: number
}

export interface ChanjingUploadUrlData {
  sign_url: string
  full_path: string
  key: string
  mime_type: string
  file_id: string
}

export interface ChanjingFileDetail {
  id: string
  status: number
  msg?: string
}

export interface ChanjingCustomisedPerson {
  id: string
  name: string
  type?: string
  pic_url?: string
  preview_url?: string
  width?: number
  height?: number
  audio_man_id?: string
  /** 1=制作中 2=成功 4=失败 5=系统错误 */
  status: number
  err_reason?: string
  reason?: string
  progress?: number
  is_open?: number
}

export interface ChanjingVideoTask {
  id: string
  status: number
  progress?: number
  msg?: string
  video_url?: string
  preview_url?: string
  duration?: number
}

export type ChanjingWebhookPayload = ChanjingCustomisedPerson | ChanjingVideoTask
