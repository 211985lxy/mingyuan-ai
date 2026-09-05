import { env } from "@/env"
import type { SmsProvider } from "./provider"
import { consoleSmsProvider } from "./console"
import { aliyunSmsProvider } from "./aliyun"

let cached: SmsProvider | null = null

/**
 * 按 SMS_PROVIDER 返回短信 Provider 单例。
 * console 模式仅用于本地开发；生产环境误配时 fail-fast，禁止静默降级。
 */
export function getSmsProvider(): SmsProvider {
  if (cached) return cached

  const providerName = env.SMS_PROVIDER || "console"

  if (providerName === "console") {
    if (env.NODE_ENV === "production") {
      throw new Error(
        "SMS_PROVIDER=console 禁止用于生产环境。请配置 SMS_PROVIDER=aliyun 及阿里云短信凭证。"
      )
    }
    cached = consoleSmsProvider
  } else if (providerName === "aliyun") {
    cached = aliyunSmsProvider
  } else {
    throw new Error(`未知的 SMS_PROVIDER：${providerName}（支持 console | aliyun）`)
  }

  return cached
}
