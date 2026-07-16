"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuthStore } from "@/lib/store"
import { getSubscriptionStatus } from "@/lib/subscription"

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, sessionChecked, isHydrated } = useAuthStore()
  const router = useRouter()
  const hasKnownActivationState =
    !!user &&
    (user.subscriptionStatus !== undefined
      || user.isActivated !== undefined
      || user.expiresAt !== undefined)
  const subscriptionStatus =
    user?.subscriptionStatus ?? getSubscriptionStatus(user?.expiresAt ?? null)
  const needsActivation =
    isAuthenticated && hasKnownActivationState && subscriptionStatus !== "active"

  useEffect(() => {
    if (isHydrated && sessionChecked && !isAuthenticated) {
      router.replace("/login")
    }

    if (isHydrated && needsActivation) {
      router.replace("/activate")
    }
  }, [isHydrated, sessionChecked, isAuthenticated, needsActivation, router])

  if (!isHydrated || !sessionChecked || !isAuthenticated || needsActivation) {
    return null
  }

  return <>{children}</>
}
