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

// searchUser 的返回结构在仓库内无已验证样本，字段按 RedFox 抖音账号对象的
// 常见别名做防御性兼容（参照 lib/competitor-analysis/redfox-similar-accounts.ts
// 中 normalizeDouyinAccount 的 secUid||uid||accountId 优先级）。
interface RedFoxDouyinUserSearchPayload {
  list?: Array<{
    accountId?: string
    secUid?: string
    uid?: string
    displayId?: string
    nickname?: string
    avatarUrl?: string
    signature?: string
    followerCount?: number
    fansCount?: number
    awemeCount?: number
    videoCount?: number
    verifyInfo?: string
    isVerified?: boolean
  }>
}

// queryWorkList 的返回与 lib/competitor-analysis/redfox-douyin-api.ts 一致：
// 账号标识取自作品项的 authorId，作者主页 secUid 也可能随作品返回。
interface RedFoxDouyinWorkList {
  list?: Array<{
    secUid?: string
    authorId?: string
    accountName?: string
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
      accountId: pickAccountId(item),
      nickname: String(item.nickname ?? "").trim(),
      avatarUrl: String(item.avatarUrl ?? "").trim(),
      signature: String(item.signature ?? "").trim(),
      followerCount: Number(item.followerCount ?? item.fansCount) || 0,
      videoCount: Number(item.awemeCount ?? item.videoCount) || 0,
      isVerified:
        typeof item.isVerified === "boolean"
          ? item.isVerified
          : Boolean(String(item.verifyInfo ?? "").trim()),
    }))
    .filter((item) => item.accountId && item.nickname)
}

export async function resolveRedFoxDouyinProfileUrl(accountId: string): Promise<string> {
  const data = await redfoxPost<RedFoxDouyinWorkList>(
    "/story/api/dyData/queryWorkList",
    buildWorkListBody(accountId, 0),
  )
  return extractRedFoxDouyinProfileUrl(data)
}

/**
 * 构造 queryWorkList 请求体，与 lib/competitor-analysis/redfox-douyin-api.ts
 * 的 buildWorkListBody 契约对齐：secUserId（MS4w 前缀）与 accountId 二选一，
 * sortType 使用已验证值 "_2"。
 */
function buildWorkListBody(accountId: string, offset: number): Record<string, unknown> {
  const id = accountId.trim()
  const body: Record<string, unknown> = { offset, sortType: "_2" }
  if (!id) return body
  if (isSecUserId(id)) {
    body.secUserId = id
  } else {
    body.accountId = id
  }
  return body
}

export function extractRedFoxDouyinProfileUrl(data: RedFoxDouyinWorkList): string {
  const first = Array.isArray(data.list) ? data.list[0] : undefined
  // 主页链接优先用作品作者的 secUid；secUid 缺失时退回 authorId（抖音号），
  // 与 redfox-similar-accounts 的 secUid||uid||accountId 优先级保持一致。
  const secUid = String(first?.secUid ?? "").trim()
  if (secUid) {
    return `https://www.douyin.com/user/${secUid}`
  }
  const authorId = String(first?.authorId ?? "").trim()
  if (authorId) {
    return `https://www.douyin.com/user/${authorId}`
  }
  throw new Error("红狐暂时无法解析该账号主页，请复制抖音主页链接添加")
}

type RedFoxDouyinUserSearchEntry = NonNullable<
  RedFoxDouyinUserSearchPayload["list"]
>[number]

function pickAccountId(item: RedFoxDouyinUserSearchEntry): string {
  return String(item.secUid ?? item.uid ?? item.accountId ?? item.displayId ?? "").trim()
}

function isSecUserId(value: string): boolean {
  return value.startsWith("MS4w")
}
