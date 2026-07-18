/**
 * 经营事项集成入口的共享鉴权（execute / meeting-insight 共用）。
 *
 * 契约：Authorization: Bearer <AIM_WORK_ITEM_API_SECRET>，timingSafeEqual 防时序攻击。
 *   - "ok" 通过
 *   - "unconfigured" 入口密钥未配置（调用方应返回 503 fail-closed）
 *   - "unauthorized" 密钥不匹配或缺 Bearer（调用方应返回 401）
 */
import { timingSafeEqual } from "node:crypto"
import type { NextRequest } from "next/server"

/** 提取 Bearer token；非 Bearer 头返回 null。 */
export function extractBearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization")
  if (!header?.startsWith("Bearer ")) return null
  return header.slice("Bearer ".length).trim()
}

/** 常量时间比较两个密钥；长度不等先返回 false 但仍消耗稳定分支。 */
export function safeSecretEqual(expected: string, provided: string): boolean {
  const a = Buffer.from(expected)
  const b = Buffer.from(provided)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** 校验经营事项入口服务密钥。 */
export function checkWorkItemApiSecret(
  request: NextRequest,
  env: Record<string, string | undefined> = process.env,
): "ok" | "unconfigured" | "unauthorized" {
  const secret = env.AIM_WORK_ITEM_API_SECRET?.trim()
  if (!secret) return "unconfigured"
  const provided = extractBearerToken(request)
  if (!provided) return "unauthorized"
  return safeSecretEqual(secret, provided) ? "ok" : "unauthorized"
}
