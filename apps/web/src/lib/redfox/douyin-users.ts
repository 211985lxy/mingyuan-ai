import { redfoxPost } from "@/lib/redfox/client"

export interface RedFoxDouyinUserSearchItem {
  accountId: string
  nickname: string
  avatarUrl: string
  signature: string
  followerCount: number
  videoCount: number
  isVerified: boolean
}

interface RedFoxDouyinUserSearchPayload {
  list?: Array<{
    accountId?: string
    nickname?: string
    avatarUrl?: string
    signature?: string
    followerCount?: number
    awemeCount?: number
    verifyInfo?: string
  }>
}

interface RedFoxDouyinWorkList {
  list?: Array<{
    secUid?: string
  }>
}

export async function searchRedFoxDouyinUsers(
  keyword: string,
): Promise<RedFoxDouyinUserSearchItem[]> {
  const payload = await redfoxPost<RedFoxDouyinUserSearchPayload>(
    "/story/api/dyData/searchUser",
    { keyword: keyword.trim().slice(0, 100), offset: 0, sortType: "default" },
  )
  return mapRedFoxDouyinUserSearchPayload(payload)
}

export function mapRedFoxDouyinUserSearchPayload(
  payload?: RedFoxDouyinUserSearchPayload,
): RedFoxDouyinUserSearchItem[] {
  return (payload?.list ?? [])
    .map((item) => ({
      accountId: String(item.accountId ?? "").trim(),
      nickname: String(item.nickname ?? "").trim(),
      avatarUrl: String(item.avatarUrl ?? "").trim(),
      signature: String(item.signature ?? "").trim(),
      followerCount: Number(item.followerCount) || 0,
      videoCount: Number(item.awemeCount) || 0,
      isVerified: Boolean(String(item.verifyInfo ?? "").trim()),
    }))
    .filter((item) => item.accountId && item.nickname)
}

export async function resolveRedFoxDouyinProfileUrl(accountId: string): Promise<string> {
  const data = await redfoxPost<RedFoxDouyinWorkList>(
    "/story/api/dyData/queryWorkList",
    { accountId: accountId.trim(), offset: 0, sortType: "default" },
  )
  return extractRedFoxDouyinProfileUrl(data)
}

export function extractRedFoxDouyinProfileUrl(data: RedFoxDouyinWorkList): string {
  const secUid = String(data.list?.find((item) => item.secUid)?.secUid ?? "").trim()
  if (!secUid) {
    throw new Error("红狐暂时无法解析该账号主页，请复制抖音主页链接添加")
  }
  return `https://www.douyin.com/user/${secUid}`
}
