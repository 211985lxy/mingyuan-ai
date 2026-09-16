import {
  DigitalHumanProviderError,
  getDigitalHumanAuthorizationText,
  type DigitalHumanProvider,
} from "@/lib/digital-human-provider"

export type AuthorizationTextResolution =
  | { ok: true; authText: string }
  | { ok: false; status: 503 | 422; code: string; message: string }

/**
 * 解析本次请求应使用的授权原文。
 *
 * 两个克隆入口（新建 / 重试）必须走同一判定，否则会出现「一处放行一处拦截」
 * 的合规分叉。文案未配置时，返回可直接映射为响应的失败描述。
 * 姓名不做校验：原文姓名位为通用占位，声明人念自己的名字即可。
 */
export function resolveAuthorizedAuthText(
  provider: DigitalHumanProvider,
): AuthorizationTextResolution {
  try {
    return { ok: true, authText: getDigitalHumanAuthorizationText(provider) }
  } catch (error) {
    if (error instanceof DigitalHumanProviderError) {
      if (error.code === "AUTH_TEXT_NOT_CONFIGURED") {
        return { ok: false, status: 503, code: error.code, message: error.message }
      }
    }
    throw error
  }
}
