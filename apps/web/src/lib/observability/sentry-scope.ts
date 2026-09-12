import * as Sentry from "@sentry/nextjs"

/**
 * 把当前请求 ID 挂到 Sentry 这条错误上，方便和 pino 日志对得上。
 * SDK 没 init 时 setTag 是空操作，不会打断出稿。
 */
export function bindRequestIdToSentry(requestId: string) {
  if (!requestId) return
  Sentry.getCurrentScope().setTag("requestId", requestId)
}
