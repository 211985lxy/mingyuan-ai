"use client"

import { toast } from "sonner"

export type MediaDownloadResult = "downloaded" | "opened" | "failed"

/**
 * 下载跨域媒体文件（成片/配音）。
 *
 * 为什么不用 `<a download>`：该属性对跨域 URL 会被浏览器忽略，点击只会导航。
 * 因此走 fetch → blob → 本地 objectURL 触发下载，但这条路径依赖对象存储的
 * CORS 配置；未开放或签名已过期时不能静默失败，需降级为新标签打开并明确
 * 告知用户「请在新页面手动另存」。
 */
export async function downloadMedia(
  url: string,
  fileName: string,
): Promise<MediaDownloadResult> {
  try {
    const response = await fetch(url, { credentials: "omit" })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    try {
      const anchor = document.createElement("a")
      anchor.href = objectUrl
      anchor.download = fileName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
    } finally {
      // 触发下载后即可释放；延迟一拍避免部分浏览器尚未开始读取
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000)
    }
    return "downloaded"
  } catch {
    // 降级：新标签打开，用户可手动另存（常见于 CORS 未开放或签名过期）
    const opened = window.open(url, "_blank", "noopener,noreferrer")
    if (opened) {
      toast.info("已在新标签打开成片，请在那里选择「另存为」")
      return "opened"
    }
    toast.error("下载失败，请检查网络后重试")
    return "failed"
  }
}

/** 成片文件名：避免使用成片 URL（含签名参数）或纯 ID，便于用户识别。 */
export function buildVideoFileName(avatarName: string | null, createdAt: string, ext = "mp4"): string {
  const label = (avatarName || "数字人成片").replace(/[\\/:*?"<>|]/g, "").slice(0, 24)
  const date = createdAt.slice(0, 10)
  return `${label}-${date}.${ext}`
}
