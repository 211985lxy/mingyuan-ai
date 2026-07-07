"use client"

import type { ApiUser } from "@/types/api"

export const AUTH_STORAGE_KEY = "mingyuan-auth"

interface StoredAuthState {
  state?: {
    token?: string | null
    user?: ApiUser | null
  }
  version?: number
}

export function getStoredAuthToken(): string | null {
  if (typeof window === "undefined") return null

  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredAuthState
    return parsed.state?.token ?? null
  } catch {
    return null
  }
}

export function clearStoredAuthState() {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(AUTH_STORAGE_KEY)
}

