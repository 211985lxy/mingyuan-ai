import { getSubscriptionStatus, type SubscriptionStatus } from "@/lib/subscription"
import { signOssUrls } from "@/lib/oss"

type AuthUserRecord = {
  id: string
  email: string
  name: string
  plan: string
  authVideoUrl?: string | null
  createdAt: Date
  expiresAt?: Date | null
}

type AuthUserExtras = {
  dailyLimit?: number
  videosCreatedToday?: number
}

export type AuthUserPayload = {
  id: string
  email: string
  name: string
  plan: string
  authVideoUrl: string | null
  createdAt: string
  expiresAt: string | null
  isActivated: boolean
  subscriptionStatus: SubscriptionStatus
  dailyLimit?: number
  videosCreatedToday?: number
}

export function buildAuthUserPayload(
  user: AuthUserRecord,
  extras: AuthUserExtras = {}
): AuthUserPayload {
  const subscriptionStatus = getSubscriptionStatus(user.expiresAt ?? null)

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    plan: user.plan,
    authVideoUrl: user.authVideoUrl ? signOssUrls(user.authVideoUrl) : null,
    createdAt: user.createdAt.toISOString(),
    expiresAt: user.expiresAt ? user.expiresAt.toISOString() : null,
    isActivated: subscriptionStatus === "active",
    subscriptionStatus,
    ...(extras.dailyLimit !== undefined ? { dailyLimit: extras.dailyLimit } : {}),
    ...(extras.videosCreatedToday !== undefined
      ? { videosCreatedToday: extras.videosCreatedToday }
      : {}),
  }
}
