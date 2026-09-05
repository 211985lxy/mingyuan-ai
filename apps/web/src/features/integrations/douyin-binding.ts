import { prisma } from "@/lib/prisma"
import {
  fetchDouyinUserProfile,
  refreshDouyinAccessToken,
  type DouyinToken,
  type DouyinUserProfile,
} from "@/lib/douyin-openapi"

/** API 对外的安全视图：绝不包含 accessToken / refreshToken */
export type DouyinBindingView = {
  id: string
  openId: string
  unionId: string | null
  scope: string
  profile: DouyinUserProfile | null
  accessExpiresAt: string
  lastSyncedAt: string | null
  syncStatus: string
  createdAt: string
}

function toView(row: {
  id: string
  openId: string
  unionId: string | null
  scope: string
  profileSnapshot: unknown
  accessExpiresAt: Date
  lastSyncedAt: Date | null
  syncStatus: string
  createdAt: Date
}): DouyinBindingView {
  return {
    id: row.id,
    openId: row.openId,
    unionId: row.unionId,
    scope: row.scope,
    profile: (row.profileSnapshot as DouyinUserProfile | null) ?? null,
    accessExpiresAt: row.accessExpiresAt.toISOString(),
    lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
    syncStatus: row.syncStatus,
    createdAt: row.createdAt.toISOString(),
  }
}

/** 回调后落库：同一用户重复授权同一抖音号 = 更新 token 与资料快照 */
export async function upsertDouyinBinding(input: {
  userId: string
  token: DouyinToken
  profile: DouyinUserProfile
}): Promise<void> {
  const accessExpiresAt = new Date(Date.now() + input.token.expiresIn * 1000)
  await prisma.douyinAccountBinding.upsert({
    where: { userId_openId: { userId: input.userId, openId: input.token.openId } },
    create: {
      userId: input.userId,
      openId: input.token.openId,
      unionId: input.token.unionId ?? null,
      scope: input.token.scope,
      accessToken: input.token.accessToken,
      refreshToken: input.token.refreshToken,
      accessExpiresAt,
      profileSnapshot: input.profile as unknown as object,
      lastSyncedAt: new Date(),
      syncStatus: "ok",
    },
    update: {
      unionId: input.token.unionId ?? null,
      scope: input.token.scope,
      accessToken: input.token.accessToken,
      refreshToken: input.token.refreshToken || undefined,
      accessExpiresAt,
      profileSnapshot: input.profile as unknown as object,
      lastSyncedAt: new Date(),
      syncStatus: "ok",
    },
  })
}

export async function listDouyinBindings(userId: string): Promise<DouyinBindingView[]> {
  const rows = await prisma.douyinAccountBinding.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  })
  return rows.map(toView)
}

export async function getDouyinBinding(userId: string, id: string) {
  return prisma.douyinAccountBinding.findFirst({ where: { id, userId } })
}

export async function removeDouyinBinding(userId: string, id: string): Promise<boolean> {
  const existing = await getDouyinBinding(userId, id)
  if (!existing) return false
  await prisma.douyinAccountBinding.delete({ where: { id } })
  return true
}

export type RefreshResult =
  | { ok: true; profile: DouyinUserProfile }
  | { ok: false; reason: "not_found" | "refresh_failed" | "profile_failed" }

/** 用存储的 token 免扫码刷新资料；token 过期先走 refresh_token 续期并回写 */
export async function refreshDouyinBinding(userId: string, id: string): Promise<RefreshResult> {
  const row = await getDouyinBinding(userId, id)
  if (!row) return { ok: false, reason: "not_found" }

  let token: DouyinToken = {
    accessToken: row.accessToken,
    refreshToken: row.refreshToken,
    openId: row.openId,
    unionId: row.unionId,
    expiresIn: Math.floor((row.accessExpiresAt.getTime() - Date.now()) / 1000),
    scope: row.scope,
  }

  // 过期或临近过期（<1 小时）先续期
  if (token.expiresIn < 3600 && row.refreshToken) {
    const renewed = await refreshDouyinAccessToken(row.refreshToken)
    if (!renewed) {
      await prisma.douyinAccountBinding.update({
        where: { id },
        data: { syncStatus: "expired" },
      })
      return { ok: false, reason: "refresh_failed" }
    }
    token = renewed
    await prisma.douyinAccountBinding.update({
      where: { id },
      data: {
        accessToken: renewed.accessToken,
        refreshToken: renewed.refreshToken,
        accessExpiresAt: new Date(Date.now() + renewed.expiresIn * 1000),
        scope: renewed.scope,
      },
    })
  }

  const profile = await fetchDouyinUserProfile(token)
  if (!profile) {
    await prisma.douyinAccountBinding.update({
      where: { id },
      data: { syncStatus: "failed" },
    })
    return { ok: false, reason: "profile_failed" }
  }

  await prisma.douyinAccountBinding.update({
    where: { id },
    data: { profileSnapshot: profile as unknown as object, lastSyncedAt: new Date(), syncStatus: "ok" },
  })
  return { ok: true, profile }
}
