/**
 * Reject literal loopback and private-network source URLs before server-side fetch.
 * DNS rebinding protection remains the responsibility of the network boundary.
 */
export function assertPublicSourceUrl(sourceUrl: string): void {
  let parsed: URL
  try {
    parsed = new URL(sourceUrl)
  } catch {
    throw new Error("transferFromUrl: invalid url")
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`transferFromUrl: disallowed protocol ${parsed.protocol}`)
  }

  const host = parsed.hostname.toLowerCase()
  if (["localhost", "0.0.0.0", "::1", "::ffff:127.0.0.1"].includes(host)) {
    throw new Error(`transferFromUrl: blocked host ${host}`)
  }

  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!v4) return
  const [a, b] = [Number(v4[1]), Number(v4[2])]
  const isInternal =
    a === 127 ||
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127)
  if (isInternal) throw new Error(`transferFromUrl: blocked internal ip ${host}`)
}

export function inferContentTypeFromKey(key: string): string | null {
  const lowerKey = key.toLowerCase()
  if (lowerKey.endsWith(".mp4")) return "video/mp4"
  if (lowerKey.endsWith(".mov")) return "video/quicktime"
  if (lowerKey.endsWith(".webm")) return "video/webm"
  if (lowerKey.endsWith(".jpg") || lowerKey.endsWith(".jpeg")) return "image/jpeg"
  if (lowerKey.endsWith(".png")) return "image/png"
  if (lowerKey.endsWith(".webp")) return "image/webp"
  return null
}

export function inferUrlExpiry(sourceUrl: string): Date | null {
  try {
    const url = new URL(sourceUrl)
    const rawExpiry =
      url.searchParams.get("Expires") ??
      url.searchParams.get("expires") ??
      url.searchParams.get("x-oss-expires")
    if (!rawExpiry) return null

    const asNumber = Number(rawExpiry)
    if (Number.isFinite(asNumber)) {
      return new Date(rawExpiry.length >= 13 ? asNumber : asNumber * 1000)
    }
    const parsed = new Date(rawExpiry)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  } catch {
    return null
  }
}
