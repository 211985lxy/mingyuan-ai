export function getWatchVideoPageUrl(input: {
  platform?: string | null
  videoId?: string | null
  videoUrl?: string | null
  fallbackUrl?: string | null
}): string {
  if ((input.platform ?? "").toLowerCase() === "douyin" && input.videoId) {
    return `https://www.douyin.com/video/${input.videoId}`
  }

  return input.videoUrl || input.fallbackUrl || ""
}
