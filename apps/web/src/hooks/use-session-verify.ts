"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { useAuthStore } from "@/lib/store"
import { ApiError, getCurrentUser } from "@/lib/api/client"

/**
 * 服务端会话校验：进入工作台时向 /api/auth/me 拉取实时会话。
 *
 * - 会话有效但订阅非 active → 跳 /activate
 * - 401 → 清空本地会话并跳 /login
 *
 * 供 (dashboard) 与 /lite 两个布局共用，避免各自复制一遍。
 */
export function useSessionVerify() {
  const router = useRouter()
  const { setSession, clearSession, isHydrated, sessionChecked } = useAuthStore()

  useEffect(() => {
    if (!isHydrated || sessionChecked) return

    getCurrentUser()
      .then((liveUser) => {
        setSession(liveUser)

        if (liveUser.subscriptionStatus !== "active") {
          router.replace("/activate")
        }
      })
      .catch((error) => {
        if (error instanceof ApiError && error.status === 401) {
          clearSession()
          router.replace("/login")
          return
        }
      })
  }, [isHydrated, sessionChecked, setSession, clearSession, router])
}
