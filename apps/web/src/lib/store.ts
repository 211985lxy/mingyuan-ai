import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import type { ApiUser } from "@/types/api"
import { AUTH_STORAGE_KEY } from "@/lib/auth-storage"

interface AuthState {
  token: string | null
  user: ApiUser | null
  sessions: Array<{ token: string; user: ApiUser }>
  isAuthenticated: boolean
  isHydrated: boolean
  setSession: (token: string, user: ApiUser) => void
  switchSession: (token: string) => void
  updateUser: (user: ApiUser) => void
  clearSession: () => void
  login: (user: ApiUser) => void
  setHydrated: (value: boolean) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      sessions: [],
      isAuthenticated: false,
      isHydrated: false,
      setSession: (token, user) => set((state) => ({
        token,
        user,
        isAuthenticated: true,
        sessions: [
          { token, user },
          ...(state.sessions ?? []).filter((item) => item.user.id !== user.id),
        ].slice(0, 5),
      })),
      switchSession: (token) => set((state) => {
        const session = (state.sessions ?? []).find((item) => item.token === token)
        return session
          ? { token: session.token, user: session.user, isAuthenticated: true }
          : state
      }),
      updateUser: (user) =>
        set((state) => ({
          ...state,
          user: state.user ? { ...state.user, ...user } : user,
          sessions: (state.sessions ?? []).map((item) =>
            item.user.id === user.id ? { ...item, user: { ...item.user, ...user } } : item
          ),
        })),
      clearSession: () => set({ token: null, user: null, isAuthenticated: false }),
      login: (user) => set((state) => ({ ...state, user, isAuthenticated: true })),
      setHydrated: (value) => set({ isHydrated: value }),
    }),
    {
      name: AUTH_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        sessions: state.sessions,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true)
      },
    }
  )
)
