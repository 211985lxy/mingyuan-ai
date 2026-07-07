export type SubscriptionStatus = "inactive" | "active" | "expired"

function normalizeDate(value?: Date | string | null): Date | null {
  if (!value) return null
  if (value instanceof Date) return value

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function getSubscriptionStatus(
  expiresAt?: Date | string | null,
  now = new Date()
): SubscriptionStatus {
  const normalized = normalizeDate(expiresAt)

  if (!normalized) return "inactive"
  if (normalized.getTime() <= now.getTime()) return "expired"

  return "active"
}

export function isSubscriptionActive(
  expiresAt?: Date | string | null,
  now = new Date()
): boolean {
  return getSubscriptionStatus(expiresAt, now) === "active"
}

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
