import type { NextRequest } from "next/server"

/**
 * 抖音扫码绑定完成后回跳的站内路径。
 *
 * 背景：绑定入口有两处（账户设置的「多平台数据同步」卡片、数据看板的绑定按钮），
 * 回调此前硬编码跳 /home，导致只有挂在 /account 的提示组件读不到 douyin_ok 参数。
 * 改为由发起方带上 ?return=，回调按 Cookie 回跳，用户在哪发起就回到哪，提示才可见。
 */
export const DOUYIN_RETURN_COOKIE = "douyin_oauth_return"

/** 未显式指定回跳页时的落地页：绑定入口所在页 */
export const DEFAULT_DOUYIN_RETURN_PATH = "/account"

/**
 * 校验站内跳转路径，防开放重定向。
 * 只放行以单个 "/" 开头的相对路径；拒绝协议相对（`//host`）、反斜杠与控制字符。
 */
export function sanitizeLocalPath(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null
  if (trimmed.includes("\\") || trimmed.includes("\n") || trimmed.includes("\r")) return null
  return trimmed
}

/** 读取发起授权时写入的回跳路径；缺失或非法时落到默认页。 */
export function readDouyinReturnPath(request: NextRequest): string {
  return sanitizeLocalPath(request.cookies.get(DOUYIN_RETURN_COOKIE)?.value) ?? DEFAULT_DOUYIN_RETURN_PATH
}
