import { logger } from "@/lib/logger"

/**
 * 轻量进程内安全计数：只记类别，不记凭证 / Prompt / 客户正文 / PII。
 *
 * 指标名以**单一数组**为准，类型与快照都从它派生 —— 早前类型与 `getSecurityMetrics`
 * 是两份手写清单，新增指标时容易只改一处（漏改快照会被 tsc 拦下，但清单本身仍会漂移）。
 */
export const SECURITY_METRIC_NAMES = [
  "proxy_image.reject",
  "proxy_image.oversize",
  "proxy_image.rate_limited",
  "proxy_image.ok",
  "obsidian.denied",
  "obsidian.quota",
  "obsidian.ok",
  "ssrf.blocked",
  "ssrf.short_url_error",
] as const

export type SecurityMetricName = (typeof SECURITY_METRIC_NAMES)[number]

const counters = new Map<SecurityMetricName, number>()

/**
 * @description 增加安全指标计数并写结构化日志（无敏感字段）
 */
export function incrementSecurityMetric(
  name: SecurityMetricName,
  detail?: { reason?: string },
): void {
  counters.set(name, (counters.get(name) ?? 0) + 1)
  logger.info(
    {
      event: "security_metric",
      metric: name,
      reason: detail?.reason,
      count: counters.get(name),
    },
    "security_metric",
  )
}

/**
 * @description 读取当前进程安全指标快照
 */
export function getSecurityMetrics(): Record<SecurityMetricName, number> {
  return Object.fromEntries(
    SECURITY_METRIC_NAMES.map((name) => [name, counters.get(name) ?? 0]),
  ) as Record<SecurityMetricName, number>
}

/**
 * @description 测试用：清空计数
 */
export function resetSecurityMetricsForTests(): void {
  counters.clear()
}
