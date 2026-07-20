import { getSubscriptionStatus, type SubscriptionStatus } from "@/lib/subscription"

type AuthUserRecord = {
  id: string
  email: string
  name: string
  plan: string
  createdAt: Date
  expiresAt?: Date | null
}

export type AuthUserPayload = {
  id: string
  email: string
  name: string
  plan: string
  createdAt: string
  expiresAt: string | null
  isActivated: boolean
  subscriptionStatus: SubscriptionStatus
}

/**
 * @description 将数据库用户记录转换为 API 响应用户载荷（含订阅状态与激活标识）
 * @param user - 数据库中的用户记录
 * @returns 用于 API 响应的用户载荷对象
 */
export function buildAuthUserPayload(user: AuthUserRecord): AuthUserPayload {
  const subscriptionStatus = getSubscriptionStatus(user.expiresAt ?? null)

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    plan: user.plan,
    createdAt: user.createdAt.toISOString(),
    expiresAt: user.expiresAt ? user.expiresAt.toISOString() : null,
    isActivated: subscriptionStatus === "active",
    subscriptionStatus,
  }
}
