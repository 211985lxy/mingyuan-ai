import type { SyntheticEvent } from "react"

import { isSignedImageUrlExpired } from "@/app/api/proxy-image/proxy-image-utils"

export { isSignedImageUrlExpired }

/**
 * @description 构建proxyimageurl
 * @param url - URL 地址
 * @returns string
 */
export function buildProxyImageUrl(url: string): string {
  return `/api/proxy-image?url=${encodeURIComponent(url)}`
}

/**
 * 过期签名图直接返回 null，避免刷一堆 502；调用方应展示占位并引导刷新账号。
 */
export function buildProxyImageUrlIfFresh(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed || isSignedImageUrlExpired(trimmed)) return null
  return buildProxyImageUrl(trimmed)
}

/**
 * @description 获取proxyimagefallbacksrc
 * @param url - URL 地址
 * @param fallbackApplied - 降级值Applied
 * @returns string | null
 */
export function getProxyImageFallbackSrc(url: string, fallbackApplied: boolean): string | null {
  const trimmed = url.trim()
  if (!trimmed || fallbackApplied) return null
  return trimmed
}

/**
 * @description 处理proxyimageerror
 * @param event - 事件对象
 * @param originalUrl - 原始值URL 地址
 * @returns 无返回值
 */
export function handleProxyImageError(
  event: SyntheticEvent<HTMLImageElement>,
  originalUrl: string,
): void {
  const img = event.currentTarget
  const nextSrc = getProxyImageFallbackSrc(
    originalUrl,
    img.dataset.proxyFallbackApplied === "true",
  )

  if (nextSrc) {
    img.dataset.proxyFallbackApplied = "true"
    img.src = nextSrc
    return
  }

  img.style.display = "none"
}
