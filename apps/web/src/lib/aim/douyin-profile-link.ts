/**
 * 抖音主页链接采集（WP-A1）：作品数据通道以 sec_user_id 定位账号，
 * 用户一次性粘贴主页链接 → 解析出 sec_user_id 落库 → 之后每日同步全自动。
 *
 * 纯逻辑（校验/归一）留在本文件便于单测；解析动作走 TikHub 适配器（含短链与本地降级）。
 */

export const DOUYIN_PROFILE_URL_MAX = 500

/** 只接受抖音域名的链接，避免把任意 URL 交给第三方解析接口。 */
const ALLOWED_HOST_PATTERN = /(^|\.)(douyin\.com|iesdouyin\.com)$/i

export function normalizeDouyinProfileUrl(raw: unknown): { ok: true; url: string } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "请粘贴抖音主页链接" }
  const trimmed = raw.trim().slice(0, DOUYIN_PROFILE_URL_MAX)
  if (!trimmed) return { ok: false, error: "请粘贴抖音主页链接" }
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return { ok: false, error: "链接格式不正确，请复制抖音 App 里的「分享主页」链接" }
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, error: "链接必须以 http(s) 开头" }
  }
  if (!ALLOWED_HOST_PATTERN.test(parsed.hostname)) {
    return { ok: false, error: "请粘贴抖音（douyin.com）的主页分享链接" }
  }
  return { ok: true, url: trimmed }
}

/** sec_user_id 形如 MS4wLjABAAAA...，仅做宽松格式校验（不同来源长度有差异）。 */
export function isValidSecUserId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 10 && /^[A-Za-z0-9_-]+$/.test(value.trim())
}
