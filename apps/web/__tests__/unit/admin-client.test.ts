import { afterEach, describe, expect, it, vi } from "vitest"

function createMemoryStorage(): Storage {
  const data = new Map<string, string>()

  return {
    get length() {
      return data.size
    },
    clear() {
      data.clear()
    },
    getItem(key: string) {
      return data.get(key) ?? null
    },
    key(index: number) {
      return Array.from(data.keys())[index] ?? null
    },
    removeItem(key: string) {
      data.delete(key)
    },
    setItem(key: string, value: string) {
      data.set(key, value)
    },
  }
}

function installBrowserGlobals(pathname = "/admin/users") {
  const storage = createMemoryStorage()
  const replace = vi.fn()

  vi.stubGlobal("localStorage", storage)
  vi.stubGlobal("window", {
    localStorage: storage,
    location: {
      pathname,
      replace,
    },
  })

  return { replace }
}

describe("admin api client", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("clears stale admin sessions and redirects on authenticated 401 responses", async () => {
    const { replace } = installBrowserGlobals("/admin/users")
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 })
    )
    vi.stubGlobal("fetch", fetchMock)

    const { useAdminStore } = await import("@/lib/admin-store")
    const { getAdminUserStats } = await import("@/lib/api/admin-client")

    useAdminStore.getState().setSession({
      id: "admin-1",
      email: "admin@example.com",
      name: "Admin",
      role: "admin",
    })

    await expect(getAdminUserStats()).rejects.toMatchObject({
      status: 401,
      message: "Invalid token",
    })

    expect(useAdminStore.getState().isAuthenticated).toBe(false)
    expect(useAdminStore.getState().admin).toBeNull()
    expect(replace).toHaveBeenCalledWith("/admin/login")
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/users/stats",
      expect.objectContaining({
        credentials: "same-origin",
      })
    )
  })

  it("does not redirect failed login attempts", async () => {
    const { replace } = installBrowserGlobals("/admin/login")
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Invalid credentials" }), { status: 401 })
      )
    )

    const { adminLogin } = await import("@/lib/api/admin-client")

    await expect(adminLogin("admin@example.com", "wrong")).rejects.toMatchObject({
      status: 401,
      message: "Invalid credentials",
    })

    expect(replace).not.toHaveBeenCalled()
  })
})
