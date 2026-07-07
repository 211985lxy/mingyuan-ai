"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuthStore } from "@/lib/store"
import { getSubscriptionStatus } from "@/lib/subscription"

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { token, user, isHydrated } = useAuthStore()
  const router = useRouter()
  const hasKnownActivationState =
    !!user &&
    (user.subscriptionStatus !== undefined
      || user.isActivated !== undefined
      || user.expiresAt !== undefined)
  const subscriptionStatus =
    user?.subscriptionStatus ?? getSubscriptionStatus(user?.expiresAt ?? null)
  const needsActivation =
    !!token && hasKnownActivationState && subscriptionStatus !== "active"

  useEffect(() => {
    if (isHydrated && !token) {
      router.replace("/login")
    }

    if (isHydrated && needsActivation) {
      router.replace("/activate")
    }
  }, [isHydrated, token, needsActivation, router])

  if (!isHydrated || !token || needsActivation) {
    return null
  }

  return <>{children}</>
}
