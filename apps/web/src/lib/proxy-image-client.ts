import type { SyntheticEvent } from "react"

export function buildProxyImageUrl(url: string): string {
  return `/api/proxy-image?url=${encodeURIComponent(url)}`
}

export function getProxyImageFallbackSrc(url: string, fallbackApplied: boolean): string | null {
  const trimmed = url.trim()
  if (!trimmed || fallbackApplied) return null
  return trimmed
}

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
