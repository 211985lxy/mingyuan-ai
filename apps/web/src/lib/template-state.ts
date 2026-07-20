import { TEMPLATE_TRANSITIONS } from "@/types/content-template"
import type { TemplateStatus } from "@/types/content-template"
import { redis } from "./redis"

const TEMPLATE_CACHE_KEY = "templates:published"

/**
 * Validate a template status transition.
 * Returns true if the transition from → to is allowed.
 */
/**
 * @description 判断是否validtransition
 * @param from - 起始值
 * @param to - 目标值
 * @returns boolean
 */
export function isValidTransition(
  from: string,
  to: TemplateStatus
): boolean {
  const allowed = TEMPLATE_TRANSITIONS[from as TemplateStatus]
  return allowed?.includes(to) ?? false
}

/**
 * Invalidate the published templates cache.
 * Call after any publish/archive/restore operation.
 */
/**
 * @description invalidatetemplatecache
 * @returns Promise<void>
 */
export async function invalidateTemplateCache(): Promise<void> {
  try {
    await redis.del(TEMPLATE_CACHE_KEY)
  } catch {
    // Redis unavailable, cache will expire naturally
  }
}
