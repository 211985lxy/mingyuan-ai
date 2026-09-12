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
  /** 规范枚举：queued | processing | completed | failed | other */
  queue_status?: string
  /** 排队/处理进度说明，与 msg（错误信息）分离 */
  queue_desc?: string
  progress?: number
  msg?: string
  video_url?: string
  preview_url?: string
  duration?: number
}

/** /list_common_audio 条目 */
export interface ChanjingCommonAudioMan {
  id: string
  name: string
  gender?: string
  desc?: string
  lang?: string
  audition?: string
  grade?: number
  speed?: number
  pitch?: number
}

/** /list_common_dp 数字人形态条目 */
export interface ChanjingDpFigure {
  type: string
  width?: number
  height?: number
  cover?: string
  preview_video_url?: string
}

/** /list_common_dp 条目 */
export interface ChanjingCommonDigitalPerson {
  id: string
  name: string
  gender?: string
  audio_man_id?: string
  audio_name?: string
  figures: ChanjingDpFigure[]
}

/** /create_audio_task 响应后的 /audio_task_state 轮询结果 */
export interface ChanjingAudioTaskState {
  id?: string
  status: number
  errMsg?: string
  errReason?: string
  full?: {
    url?: string
    duration?: number
    path?: string
    watermark_url?: string
  }
}

export type ChanjingWebhookPayload = ChanjingCustomisedPerson | ChanjingVideoTask
