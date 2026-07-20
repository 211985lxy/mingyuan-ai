/**
 * @description 获取监控视频的页面访问 URL（抹音平台优先拼接规范 URL）
 * @param input - 包含平台、视频 ID、视频 URL 和回退 URL 的对象
 * @returns 视频页面 URL，无法确定时返回空字符串
 */
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
