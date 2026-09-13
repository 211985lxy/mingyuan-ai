import {
  DigitalHumanProviderError,
  getDigitalHumanAuthorizationText,
  type DigitalHumanProvider,
} from "@/lib/digital-human-provider"

export type AuthorizationTextResolution =
  | { ok: true; authText: string }
  | { ok: false; status: 503 | 422; code: string; message: string }

/**
 * 解析本次请求应使用的授权原文（按声明人姓名实例化）。
 *
 * 两个克隆入口（新建 / 重试）必须走同一判定，否则会出现「一处放行一处拦截」
 * 的合规分叉。文案未配置或模板含 {name} 而账号无姓名时，返回可直接映射为
 * 响应的失败描述。
 */
export function resolveAuthorizedAuthText(
  provider: DigitalHumanProvider,
  userName: string | null,
): AuthorizationTextResolution {
  try {
    return { ok: true, authText: getDigitalHumanAuthorizationText(provider, userName) }
  } catch (error) {
    if (error instanceof DigitalHumanProviderError) {
      if (error.code === "AUTH_TEXT_NOT_CONFIGURED") {
        return { ok: false, status: 503, code: error.code, message: error.message }
      }
      if (error.code === "AUTH_NAME_REQUIRED") {
        return { ok: false, status: 422, code: error.code, message: error.message }
      }
    }
    throw error
  }
}
