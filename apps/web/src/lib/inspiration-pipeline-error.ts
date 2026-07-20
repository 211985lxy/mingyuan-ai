/**
 * Structured error system for the inspiration pipeline.
 *
 * Replaces scattered Chinese-text regex matching with typed error codes
 * that carry retry policy, fallback permission, and safe user-facing messages.
 */

// ---------------------------------------------------------------------------
// Error categories
// ---------------------------------------------------------------------------

export const PIPELINE_ERROR_CATEGORY = {
  input: "input",
  policy: "policy",
  provider: "provider",
  quota: "quota",
  system: "system",
} as const

export type PipelineErrorCategory = (typeof PIPELINE_ERROR_CATEGORY)[keyof typeof PIPELINE_ERROR_CATEGORY]

// ---------------------------------------------------------------------------
// Error codes & their policies
// ---------------------------------------------------------------------------

const ERROR_DEFINITIONS = {
  // -- input ----------------------------------------------------------------
  VIDEO_TOO_LONG: {
    category: "input" as const,
    retryable: false,
    fallbackAllowed: false,
    userMessage: "视频超过10分钟，暂不支持自动收录",
  },
  VIDEO_TOO_LARGE: {
    category: "input" as const,
    retryable: false,
    fallbackAllowed: false,
    userMessage: "视频文件过大，暂不支持自动收录",
  },
  UNSUPPORTED_VIDEO_DIRECT_LINK: {
    category: "input" as const,
    retryable: false,
    fallbackAllowed: false,
    userMessage: "请粘贴视频分享页或作品页链接，不要粘贴视频文件直链",
  },
  UNSUPPORTED_VIDEO_PLATFORM: {
    category: "input" as const,
    retryable: false,
    fallbackAllowed: false,
    userMessage: "暂不支持这个视频平台，请转发抖音、B站、快手、小红书、视频号或 YouTube 链接。",
  },
  UNSUPPORTED_VIDEO_URL: {
    category: "input" as const,
    retryable: false,
    fallbackAllowed: false,
    userMessage: "请输入正确的视频链接",
  },
  MULTIPLE_VIDEO_URLS: {
    category: "input" as const,
    retryable: false,
    fallbackAllowed: false,
    userMessage: "一次请只发送一个视频链接",
  },
  NO_VIDEO_URL: {
    category: "input" as const,
    retryable: false,
    fallbackAllowed: false,
    userMessage: "请发送包含视频链接的消息",
  },
  LOCAL_URL_BLOCKED: {
    category: "input" as const,
    retryable: false,
    fallbackAllowed: false,
    userMessage: "请粘贴公开视频链接，不要粘贴本站地址",
  },
  UNSUPPORTED_MESSAGE_TYPE: {
    category: "input" as const,
    retryable: false,
    fallbackAllowed: false,
    userMessage: "暂不支持处理此类消息，请发送包含链接的文本",
  },

  // -- policy ----------------------------------------------------------------
  CHANNEL_UNBOUND: {
    category: "policy" as const,
    retryable: false,
    fallbackAllowed: false,
    userMessage: "该群聊未绑定选题采集服务",
  },
  CHANNEL_DISABLED: {
    category: "policy" as const,
    retryable: false,
    fallbackAllowed: false,
    userMessage: "选题采集服务已暂停",
  },
  TRIGGER_NOT_MATCHED: {
    category: "policy" as const,
    retryable: false,
    fallbackAllowed: false,
    userMessage: "", // intentional — no reply for unmatched triggers
  },
  PROJECT_FORBIDDEN: {
    category: "policy" as const,
    retryable: false,
    fallbackAllowed: false,
    userMessage: "无权操作该项目",
  },
  PLATFORM_DISABLED: {
    category: "policy" as const,
    retryable: false,
    fallbackAllowed: false,
    userMessage: "该平台接入已关闭",
  },
  RATE_LIMITED: {
    category: "policy" as const,
    retryable: true,
    fallbackAllowed: false,
    userMessage: "消息过于频繁，请稍后再试",
  },

  // -- provider --------------------------------------------------------------
  EXTRACTION_SUBMIT_FAILED: {
    category: "provider" as const,
    retryable: true,
    fallbackAllowed: true,
    userMessage: "文案提取服务暂时不可用，请稍后重试。",
  },
  EXTRACTION_POLL_FAILED: {
    category: "provider" as const,
    retryable: true,
    fallbackAllowed: true,
    userMessage: "文案提取结果查询失败，请稍后重试。",
  },
  EXTRACTION_NO_TRANSCRIPT: {
    category: "provider" as const,
    retryable: false,
    fallbackAllowed: true,
    userMessage: "该视频暂时无法提取文案，请换一个链接试试。",
  },
  FALLBACK_SUBMIT_FAILED: {
    category: "provider" as const,
    retryable: true,
    fallbackAllowed: false,
    userMessage: "备用文案提取服务不可用，请稍后重试。",
  },
  FALLBACK_NO_TRANSCRIPT: {
    category: "provider" as const,
    retryable: false,
    fallbackAllowed: false,
    userMessage: "该视频暂时无法提取文案，请换一个链接试试。",
  },
  FALLBACK_JOB_MISSING: {
    category: "provider" as const,
    retryable: false,
    fallbackAllowed: false,
    userMessage: "文案提取任务丢失，请重新提交链接。",
  },
  CHANNELS_EXTRACT_NOT_READY: {
    category: "provider" as const,
    retryable: false,
    fallbackAllowed: false,
    userMessage: "视频号文案提取服务尚未就绪",
  },
  LLM_GENERATION_FAILED: {
    category: "provider" as const,
    retryable: true,
    fallbackAllowed: false,
    userMessage: "选题生成失败，请稍后重试。",
  },

  // -- quota -----------------------------------------------------------------
  EXTRACTION_QUOTA_EXCEEDED: {
    category: "quota" as const,
    retryable: false,
    fallbackAllowed: true,
    userMessage: "文案提取额度不足，请先补充额度后再试。",
  },
  PROVIDER_AUTH_FAILED: {
    category: "quota" as const,
    retryable: false,
    fallbackAllowed: false,
    userMessage: "文案提取服务配置有问题，请联系管理员。",
  },

  // -- system ----------------------------------------------------------------
  PROJECT_MISSING: {
    category: "system" as const,
    retryable: false,
    fallbackAllowed: false,
    userMessage: "自动收录记录缺少项目绑定，请联系管理员",
  },
  INSPIRATION_NOT_FOUND: {
    category: "system" as const,
    retryable: false,
    fallbackAllowed: false,
    userMessage: "灵感记录不存在",
  },
  BACKGROUND_TASKS_UNAVAILABLE: {
    category: "system" as const,
    retryable: true,
    fallbackAllowed: false,
    userMessage: "系统后台任务暂时不可用，请稍后重试",
  },
  UNKNOWN: {
    category: "system" as const,
    retryable: true,
    fallbackAllowed: false,
    userMessage: "处理过程中出现未知错误，请稍后重试",
  },
} as const

export type PipelineErrorCode = keyof typeof ERROR_DEFINITIONS

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class InspirationPipelineError extends Error {
  readonly code: PipelineErrorCode
  readonly category: PipelineErrorCategory
  readonly retryable: boolean
  readonly fallbackAllowed: boolean
  readonly userMessage: string
  readonly internalDetails?: string

  constructor(
    code: PipelineErrorCode,
    options?: { cause?: Error; internalDetails?: string },
  ) {
    const def = ERROR_DEFINITIONS[code] ?? ERROR_DEFINITIONS.UNKNOWN
    super(def.userMessage || code, options?.cause ? { cause: options.cause } : undefined)
    this.name = "InspirationPipelineError"
    this.code = code
    this.category = def.category
    this.retryable = def.retryable
    this.fallbackAllowed = def.fallbackAllowed
    this.userMessage = def.userMessage
    this.internalDetails = options?.internalDetails
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wrap an unknown error into InspirationPipelineError when it isn't already. */
/**
 * @description aspipelineerror
 * @param error - 错误对象
 * @param defaultCode - 默认值代码
 * @returns InspirationPipelineError
 */
export function asPipelineError(error: unknown, defaultCode: PipelineErrorCode = "UNKNOWN"): InspirationPipelineError {
  if (error instanceof InspirationPipelineError) return error
  const message = error instanceof Error ? error.message : String(error)
  const details = error instanceof Error ? error.stack : undefined
  return new InspirationPipelineError(defaultCode, { cause: error instanceof Error ? error : undefined, internalDetails: details })
}

/** Map a raw error to a user-facing message, falling back to safe defaults. */
/**
 * @description 格式化pipelineusermessage
 * @param error - 错误对象
 * @returns string
 */
export function formatPipelineUserMessage(error: unknown): string {
  if (error instanceof InspirationPipelineError) return error.userMessage
  if (error instanceof Error) {
    const msg = error.message
    // Fallback heuristics for unstructured errors from external providers
    if (/timeout|timed out|fetch failed/i.test(msg)) {
      return ERROR_DEFINITIONS.EXTRACTION_SUBMIT_FAILED.userMessage
    }
    if (/balance|quota|额度|余额|充值/i.test(msg)) {
      return ERROR_DEFINITIONS.EXTRACTION_QUOTA_EXCEEDED.userMessage
    }
    if (/1004|apikey|api key/i.test(msg)) {
      return ERROR_DEFINITIONS.PROVIDER_AUTH_FAILED.userMessage
    }
    if (/link|url|链接/i.test(msg)) {
      return ERROR_DEFINITIONS.UNSUPPORTED_VIDEO_URL.userMessage
    }
  }
  return ERROR_DEFINITIONS.UNKNOWN.userMessage
}

/** Determine if an error is retryable. Works with both structured and raw errors. */
/**
 * @description 判断是否pipelineretryable
 * @param error - 错误对象
 * @returns boolean
 */
export function isPipelineRetryable(error: unknown): boolean {
  if (error instanceof InspirationPipelineError) return error.retryable
  if (error instanceof Error) {
    const msg = error.message
    // Legacy non-retryable patterns (kept for backward compat during migration)
    if (/(超过10分钟|超过200MB|缺少项目绑定|不存在|暂不支持|不要粘贴|项目不存在|权限|额度不足)/.test(msg)) {
      return false
    }
  }
  return true // default to retryable for unknown errors
}
