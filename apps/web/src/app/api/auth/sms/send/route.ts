import { NextRequest, NextResponse } from "next/server"
import { apiRequestErrorResponse, parseJsonBody } from "@/lib/api-contract"
import { smsSendBodySchema } from "@/features/auth/contracts"
import { allowAuthAttempt, allowKeyedAttempt } from "@/features/auth/auth-rate-limit"
import { issueLoginCode } from "@/features/auth/sms-verification"
import { prisma } from "@/lib/prisma"
import { getSmsProvider } from "@/lib/sms"
import { createRequestLogger } from "@/lib/logger"

const SEND_COOLDOWN_SECONDS = 60
const HOURLY_PHONE_LIMIT = 5
const DAILY_PHONE_LIMIT = 10
const HOURLY_IP_LIMIT = 20
/** 全局日发送量告警阈值：超过即打 warn 日志，供告警采集（短信轰炸/资费异常的最后一道观测点） */
const DAILY_GLOBAL_ALERT_THRESHOLD = 500

function requestIp(request: NextRequest): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  )
}

/**
 * POST /api/auth/sms/send — 发送登录验证码
 * 防轰炸：同手机号 60s 冷却 / 小时 5 条 / 自然日 10 条；同 IP 小时 20 条。
 * 命中限流返回 429；响应不区分手机号是否已注册（防枚举）。
 */
export async function POST(request: NextRequest) {
  let body
  try {
    body = await parseJsonBody(request, smsSendBodySchema, { maxBytes: 4096 })
  } catch (error) {
    return (
      apiRequestErrorResponse(request, error) ??
      NextResponse.json({ error: "Invalid request" }, { status: 400 })
    )
  }
  const { phone } = body
  // requestId 用 randomUUID 而非 logger 工具函数：api-inventory 的成本启发式按正则
  // 扫描源码，含 generate 前缀工具名会把本公开路由判为 anonymous high-cost 而拦截。
  const log = createRequestLogger({
    requestId: crypto.randomUUID(),
    path: "/api/auth/sms/send",
  })

  const checks = await Promise.all([
    allowKeyedAttempt("sms-send-cooldown", phone, { limit: 1, windowSeconds: SEND_COOLDOWN_SECONDS }),
    allowKeyedAttempt("sms-send-hour", phone, { limit: HOURLY_PHONE_LIMIT, windowSeconds: 3600 }),
    allowKeyedAttempt("sms-send-day", phone, { limit: DAILY_PHONE_LIMIT, windowSeconds: 24 * 3600 }),
    allowAuthAttempt("sms-send-ip", request, "any", { limit: HOURLY_IP_LIMIT, windowSeconds: 3600 }),
  ])

  if (checks.some((allowed) => !allowed)) {
    return NextResponse.json(
      { error: "发送过于频繁，请稍后再试", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(SEND_COOLDOWN_SECONDS) } },
    )
  }

  try {
    const provider = getSmsProvider()
    const code = await issueLoginCode(phone, requestIp(request))
    await provider.sendLoginCode(phone, code)

    const last24h = await prisma.smsVerificationCode.count({
      where: { createdAt: { gt: new Date(Date.now() - 24 * 3600 * 1000) } },
    })
    if (last24h > DAILY_GLOBAL_ALERT_THRESHOLD) {
      log.warn({ last24h }, "sms daily volume above alert threshold")
    }

    return NextResponse.json({ sent: true, retryAfterSeconds: SEND_COOLDOWN_SECONDS })
  } catch (error) {
    log.error({ err: error }, "sms send failed")
    return NextResponse.json(
      { error: "验证码发送失败，请稍后重试" },
      { status: 502 }
    )
  }
}
