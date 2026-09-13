import { isDouyinShortUrl, normalizeDouyinAwemeId } from "@/lib/douyin-short-url"

export type PublishedWorkKey =
  | { status: "aweme"; awemeId: string }
  | { status: "short"; url: string }
  | { status: "other" }
  | { status: "missing" }

export function isDouyinPublishPlatform(platform: string | null | undefined): boolean {
  return /抖音|douyin/i.test(platform?.trim() ?? "")
}

export function classifyPublishedWorkKey(
  platform: string | null | undefined,
  publishUrl: string | null | undefined,
): PublishedWorkKey {
  const url = publishUrl?.trim() ?? ""
  if (!isDouyinPublishPlatform(platform)) {
    return url ? { status: "other" } : { status: "missing" }
  }
  const awemeId = normalizeDouyinAwemeId(url)
  if (awemeId) return { status: "aweme", awemeId }
  if (isDouyinShortUrl(url)) return { status: "short", url }
  return { status: "missing" }
}

export function isValidPublishedWorkKey(
  platform: string | null | undefined,
  publishUrl: string | null | undefined,
): boolean {
  if (!isDouyinPublishPlatform(platform)) return Boolean(publishUrl?.trim())
  const classified = classifyPublishedWorkKey(platform, publishUrl)
  return classified.status === "aweme" || classified.status === "short"
}
