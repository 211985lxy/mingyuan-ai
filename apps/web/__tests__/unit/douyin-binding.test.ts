import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const prismaMocks = vi.hoisted(() => ({
  bindingUpsert: vi.fn(),
  bindingFindMany: vi.fn(),
  bindingFindFirst: vi.fn(),
  bindingDelete: vi.fn(),
  bindingUpdate: vi.fn(),
  identityFindUnique: vi.fn(),
  identityCreate: vi.fn(),
}))

const fetchUserProfile = vi.hoisted(() => vi.fn())
const refreshAccessToken = vi.hoisted(() => vi.fn())

vi.mock("@/lib/prisma", () => ({
  prisma: {
    douyinAccountBinding: {
      upsert: prismaMocks.bindingUpsert,
      findMany: prismaMocks.bindingFindMany,
      findFirst: prismaMocks.bindingFindFirst,
      delete: prismaMocks.bindingDelete,
      update: prismaMocks.bindingUpdate,
    },
    douyinLoginIdentity: {
      findUnique: prismaMocks.identityFindUnique,
      create: prismaMocks.identityCreate,
    },
  },
}))

vi.mock("@/lib/douyin-openapi", () => ({
  fetchDouyinUserProfile: fetchUserProfile,
  refreshDouyinAccessToken: refreshAccessToken,
}))

vi.mock("@/lib/user-auth", () => ({
  withUserAuth: (handler: any) =>
    (request: NextRequest, segmentData: { params: Promise<Record<string, string>> }) =>
      handler(request, { user: { id: "u1", email: "t@t.com" }, params: { id: "bind-1" } }),
}))

import { GET as listAccounts } from "@/app/api/integrations/douyin/accounts/route"
import { POST as refreshAccount, DELETE as unbindAccount } from "@/app/api/integrations/douyin/accounts/[id]/route"
import {
  claimDouyinLoginIdentity,
  upsertDouyinBinding,
  listDouyinBindings,
} from "@/features/integrations/douyin-binding"

const PROFILE = {
  openId: "open-1",
  unionId: null,
  nickname: "测试抖音号",
  avatar: "https://example.com/a.png",
  followers: 1234,
  following: 10,
  awemeCount: 42,
  totalFavorited: 9999,
  signature: null,
  gender: null,
  country: null,
  province: null,
  city: null,
}

const TOKEN = {
  accessToken: "at-1",
  refreshToken: "rt-1",
  openId: "open-1",
  unionId: null,
  expiresIn: 15 * 86400,
  scope: "user_info,video.list",
}

const ROW = {
  id: "bind-1",
  openId: "open-1",
  unionId: null,
  scope: TOKEN.scope,
  accessToken: "at-1",
  refreshToken: "rt-1",
  accessExpiresAt: new Date(Date.now() + 10 * 86400 * 1000),
  profileSnapshot: PROFILE,
  lastSyncedAt: new Date("2026-09-01T00:00:00Z"),
  syncStatus: "ok",
  createdAt: new Date("2026-08-01T00:00:00Z"),
  updatedAt: new Date("2026-09-01T00:00:00Z"),
}

function req(url: string, method = "GET") {
  return new NextRequest(new URL(url), {
    method,
    headers: { origin: "http://localhost" },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("douyin binding service", () => {
  it("claims a new Douyin openid for the current AIM user", async () => {
    prismaMocks.identityFindUnique.mockResolvedValue(null)
    prismaMocks.identityCreate.mockResolvedValue({})

    await claimDouyinLoginIdentity("u1", TOKEN)

    expect(prismaMocks.identityCreate).toHaveBeenCalledWith({
      data: { userId: "u1", openId: "open-1", unionId: null },
    })
  })

  it("allows the existing owner to claim the same openid again", async () => {
    prismaMocks.identityFindUnique.mockResolvedValue({ userId: "u1", openId: "open-1" })

    await claimDouyinLoginIdentity("u1", TOKEN)

    expect(prismaMocks.identityCreate).not.toHaveBeenCalled()
  })

  it("rejects a different user from claiming an owned openid", async () => {
    prismaMocks.identityFindUnique.mockResolvedValue({ userId: "other-user", openId: "open-1" })

    await expect(claimDouyinLoginIdentity("u1", TOKEN)).rejects.toMatchObject({
      code: "DOUYIN_IDENTITY_CONFLICT",
    })
  })

  it("upserts a binding with token and profile snapshot", async () => {
    prismaMocks.bindingUpsert.mockResolvedValue({})
    await upsertDouyinBinding({ userId: "u1", token: TOKEN, profile: PROFILE as never })

    expect(prismaMocks.bindingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_openId: { userId: "u1", openId: "open-1" } },
        create: expect.objectContaining({ userId: "u1", accessToken: "at-1", profileSnapshot: expect.anything() }),
        update: expect.objectContaining({ accessToken: "at-1", syncStatus: "ok" }),
      })
    )
  })

  it("lists bindings without exposing tokens", async () => {
    prismaMocks.bindingFindMany.mockResolvedValue([ROW])
    const items = await listDouyinBindings("u1")

    expect(items).toHaveLength(1)
    expect(items[0].profile?.nickname).toBe("测试抖音号")
    expect(JSON.stringify(items)).not.toContain("accessToken")
    expect(JSON.stringify(items)).not.toContain("refreshToken")
    expect(JSON.stringify(items)).not.toContain("at-1")
  })
})

describe("GET /api/integrations/douyin/accounts", () => {
  it("returns bound accounts for the current user", async () => {
    prismaMocks.bindingFindMany.mockResolvedValue([ROW])
    const res = await listAccounts(req("http://localhost/api/integrations/douyin/accounts"), { params: Promise.resolve({}) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.items).toHaveLength(1)
    expect(prismaMocks.bindingFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u1" } }))
  })
})

describe("POST /api/integrations/douyin/accounts/:id", () => {
  it("refreshes profile with a valid stored token", async () => {
    prismaMocks.bindingFindFirst.mockResolvedValue(ROW)
    fetchUserProfile.mockResolvedValue({ ...PROFILE, followers: 4321 })

    const res = await refreshAccount(req("http://localhost/api/integrations/douyin/accounts/bind-1", "POST"), { params: Promise.resolve({ id: "bind-1" }) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.profile.followers).toBe(4321)
    expect(refreshAccessToken).not.toHaveBeenCalled()
    expect(prismaMocks.bindingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ syncStatus: "ok", lastSyncedAt: expect.any(Date) }) })
    )
  })

  it("renews an expiring token before fetching profile", async () => {
    prismaMocks.bindingFindFirst.mockResolvedValue({
      ...ROW,
      accessExpiresAt: new Date(Date.now() + 30 * 60 * 1000), // < 1h
    })
    refreshAccessToken.mockResolvedValue({ ...TOKEN, accessToken: "at-2", expiresIn: 15 * 86400 })
    fetchUserProfile.mockResolvedValue(PROFILE)

    const res = await refreshAccount(req("http://localhost/api/integrations/douyin/accounts/bind-1", "POST"), { params: Promise.resolve({ id: "bind-1" }) })

    expect(res.status).toBe(200)
    expect(refreshAccessToken).toHaveBeenCalledWith("rt-1")
    expect(prismaMocks.bindingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ accessToken: "at-2" }) })
    )
  })

  it("returns 410 when refresh token is dead", async () => {
    prismaMocks.bindingFindFirst.mockResolvedValue({
      ...ROW,
      accessExpiresAt: new Date(Date.now() - 1000),
    })
    refreshAccessToken.mockResolvedValue(null)

    const res = await refreshAccount(req("http://localhost/api/integrations/douyin/accounts/bind-1", "POST"), { params: Promise.resolve({ id: "bind-1" }) })

    expect(res.status).toBe(410)
    expect(fetchUserProfile).not.toHaveBeenCalled()
  })

  it("returns 404 for another user's binding", async () => {
    prismaMocks.bindingFindFirst.mockResolvedValue(null)
    const res = await refreshAccount(req("http://localhost/api/integrations/douyin/accounts/bind-1", "POST"), { params: Promise.resolve({ id: "bind-1" }) })
    expect(res.status).toBe(404)
  })
})

describe("DELETE /api/integrations/douyin/accounts/:id", () => {
  it("removes the binding owned by the current user", async () => {
    prismaMocks.bindingFindFirst.mockResolvedValue(ROW)
    prismaMocks.bindingDelete.mockResolvedValue(ROW)

    const res = await unbindAccount(req("http://localhost/api/integrations/douyin/accounts/bind-1", "DELETE"), { params: Promise.resolve({ id: "bind-1" }) })

    expect(res.status).toBe(200)
    expect(prismaMocks.bindingDelete).toHaveBeenCalledWith({ where: { id: "bind-1" } })
  })

  it("returns 404 when binding does not exist", async () => {
    prismaMocks.bindingFindFirst.mockResolvedValue(null)
    const res = await unbindAccount(req("http://localhost/api/integrations/douyin/accounts/bind-1", "DELETE"), { params: Promise.resolve({ id: "bind-1" }) })
    expect(res.status).toBe(404)
  })
})
