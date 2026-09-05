"use client"

import { request } from "./core"

export type DouyinBoundAccountApi = {
  id: string
  openId: string
  unionId: string | null
  scope: string
  profile: {
    nickname: string
    avatar: string
    followers?: number | null
    awemeCount?: number | null
    totalFavorited?: number | null
    signature?: string | null
  } | null
  syncStatus: string
  lastSyncedAt: string | null
  accessExpiresAt: string
  createdAt: string
}

/** 已绑定的抖音账号列表（安全视图，不含 token） */
export async function listDouyinBoundAccounts(): Promise<DouyinBoundAccountApi[]> {
  const payload = await request<{ items: DouyinBoundAccountApi[] }>("/api/integrations/douyin/accounts")
  return payload.items
}

/** 免扫码刷新某绑定账号的资料 */
export async function refreshDouyinBoundAccount(id: string): Promise<DouyinBoundAccountApi["profile"]> {
  const payload = await request<{ profile: DouyinBoundAccountApi["profile"] }>(
    `/api/integrations/douyin/accounts/${id}`,
    { method: "POST" }
  )
  return payload.profile
}

/** 解绑 */
export async function unbindDouyinAccount(id: string): Promise<void> {
  await request<{ ok: true }>(`/api/integrations/douyin/accounts/${id}`, { method: "DELETE" })
}
