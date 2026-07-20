import type { WatchAccount } from "@/lib/api/client"

const MAX_LATEST_VIDEOS = 30

/** Derive the currently selected account from the list and active id. */
/**
 * @description 解析activeaccount
 * @param accounts - accounts
 * @param activeAccountId - 是否活跃账户唯一标识符
 * @returns WatchAccount | undefined
 */
export function resolveActiveAccount(
  accounts: WatchAccount[],
  activeAccountId: string | null,
): WatchAccount | undefined {
  if (accounts.length === 0) return undefined
  return accounts.find((a) => a.id === activeAccountId) || accounts[0]
}

/** Attach account ref, sort by time desc, and cap the list. */
/**
 * @description 解析activelatestvideos
 * @param account - 账户
 * @returns []
 */
export function resolveActiveLatestVideos(
  account: WatchAccount | undefined,
): (NonNullable<WatchAccount["latestVideos"]>[number] & { account: WatchAccount })[] {
  if (!account?.latestVideos) return []
  return account.latestVideos
    .map((v) => ({ ...v, account }))
    .sort((a, b) => b.createTime - a.createTime)
    .slice(0, MAX_LATEST_VIDEOS)
}
