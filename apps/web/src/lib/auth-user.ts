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
