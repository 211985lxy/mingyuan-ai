"use client"

import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

const ADMIN_STORAGE_KEY = "mingyuan-admin-auth"

interface AdminUser {
  id: string
  email: string
  name: string
  role: string
}

interface AdminAuthState {
  token: string | null
  admin: AdminUser | null
  isAuthenticated: boolean
  isHydrated: boolean
  setSession: (token: string, admin: AdminUser) => void
  clearSession: () => void
  setHydrated: (value: boolean) => void
}

export const useAdminStore = create<AdminAuthState>()(
  persist(
    (set) => ({
      token: null,
      admin: null,
      isAuthenticated: false,
      isHydrated: false,
      setSession: (token, admin) => set({ token, admin, isAuthenticated: true }),
      clearSession: () => set({ token: null, admin: null, isAuthenticated: false }),
      setHydrated: (value) => set({ isHydrated: value }),
    }),
    {
      name: ADMIN_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        token: state.token,
        admin: state.admin,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true)
      },
    }
  )
)

export function getStoredAdminToken(): string | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(ADMIN_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed.state?.token ?? null
  } catch {
    return null
  }
}
