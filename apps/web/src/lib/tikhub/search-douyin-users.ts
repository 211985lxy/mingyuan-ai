import { tikhubPost } from "@/lib/tikhub/client"

export interface DouyinUserSearchItem {
  secUserId: string
  nickname: string
  avatarUrl: string
  followerCount: number
  videoCount: number
  category: string
}

interface DouyinUserSearchPayload {
  user_list?: Array<{
    user_id?: string
    nick_name?: string
    avatar_url?: string
    fans_cnt?: number
    publish_cnt?: number
    second_tag_name?: string
  }>
}

interface DouyinUserSearchResponse {
  data?: DouyinUserSearchPayload
}

/**
 * Search Douyin accounts by nickname or Douyin ID.
 * TikHub's V2 response currently wraps the actual result in a second `data` object.
 */
export async function searchDouyinUsers(keyword: string): Promise<DouyinUserSearchItem[]> {
  const response = await tikhubPost<DouyinUserSearchResponse>(
    "/api/v1/douyin/search/fetch_user_search_v2",
    { keyword: keyword.trim().slice(0, 100), cursor: 0 },
  )
  return mapDouyinUserSearchPayload(response.data)
}

export function mapDouyinUserSearchPayload(
  payload?: DouyinUserSearchPayload,
): DouyinUserSearchItem[] {
  return (payload?.user_list ?? [])
    .map((item) => ({
      secUserId: String(item.user_id ?? "").trim(),
      nickname: String(item.nick_name ?? "").trim(),
      avatarUrl: String(item.avatar_url ?? "").trim(),
      followerCount: Number(item.fans_cnt) || 0,
      videoCount: Number(item.publish_cnt) || 0,
      category: String(item.second_tag_name ?? "").trim(),
    }))
    .filter((item) => item.secUserId && item.nickname)
}
