export type SubscriptionStatus = "inactive" | "active" | "expired"

function normalizeDate(value?: Date | string | null): Date | null {
  if (!value) return null
  if (value instanceof Date) return value

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/**
 * @description 根据过期时间判断当前订阅状态（未激活/活跃/已过期）
 * @param expiresAt - 订阅过期时间（支持 Date、字符串或 null）
 * @param now - 当前时间，默认为 new Date()
 * @returns 订阅状态：inactive、active 或 expired
 */
export function getSubscriptionStatus(
  expiresAt?: Date | string | null,
  now = new Date()
): SubscriptionStatus {
  const normalized = normalizeDate(expiresAt)

  if (!normalized) return "inactive"
  if (normalized.getTime() <= now.getTime()) return "expired"

  return "active"
}

/**
 * @description 判断订阅是否当前处于活跃状态
 * @param expiresAt - 订阅过期时间
 * @param now - 当前时间，默认为 new Date()
 * @returns 订阅活跃返回 true，否则返回 false
 */
export function isSubscriptionActive(
  expiresAt?: Date | string | null,
  now = new Date()
): boolean {
  return getSubscriptionStatus(expiresAt, now) === "active"
}

/**
 * @description 获取激活起始日期（若订阅未过期则返回过期时间，否则返回当前时间）
 * @param expiresAt - 订阅过期时间
 * @param now - 当前时间，默认为 new Date()
 * @returns 激活起始日期
 */
export function getActivationStartDate(
  expiresAt?: Date | string | null,
  now = new Date()
): Date {
  const normalized = normalizeDate(expiresAt)

  if (normalized && normalized.getTime() > now.getTime()) {
    return normalized
  }

  return now
}
