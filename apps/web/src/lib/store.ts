import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import type { ApiUser } from "@/types/api"

const AUTH_STORAGE_KEY = "mingyuan-auth"

interface AuthState {
  user: ApiUser | null
  isAuthenticated: boolean
  sessionChecked: boolean
  isHydrated: boolean
  setSession: (user: ApiUser) => void
  updateUser: (user: ApiUser) => void
  clearSession: () => void
  setHydrated: (value: boolean) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      sessionChecked: false,
      isHydrated: false,
      setSession: (user) => set({
        user,
        isAuthenticated: true,
        sessionChecked: true,
      }),
      updateUser: (user) =>
        set((state) => ({
          ...state,
          user: state.user ? { ...state.user, ...user } : user,
        })),
      clearSession: () => set({ user: null, isAuthenticated: false, sessionChecked: true }),
      setHydrated: (value) => set({ isHydrated: value }),
    }),
    {
      name: AUTH_STORAGE_KEY,
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
      }),
      migrate: (persisted) => ({
        user: (persisted as { user?: ApiUser | null } | null)?.user ?? null,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true)
      },
    }
  )
)
