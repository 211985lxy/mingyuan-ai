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
  admin: AdminUser | null
  isAuthenticated: boolean
  sessionChecked: boolean
  isHydrated: boolean
  setSession: (admin: AdminUser) => void
  clearSession: () => void
  setHydrated: (value: boolean) => void
}

export const useAdminStore = create<AdminAuthState>()(
  persist(
    (set) => ({
      admin: null,
      isAuthenticated: false,
      sessionChecked: false,
      isHydrated: false,
      setSession: (admin) => set({ admin, isAuthenticated: true, sessionChecked: true }),
      clearSession: () => set({ admin: null, isAuthenticated: false, sessionChecked: true }),
      setHydrated: (value) => set({ isHydrated: value }),
    }),
    {
      name: ADMIN_STORAGE_KEY,
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        admin: state.admin,
      }),
      migrate: (persisted) => ({
        admin: (persisted as { admin?: AdminUser | null } | null)?.admin ?? null,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true)
      },
    }
  )
)
