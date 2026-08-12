import { logger } from "@/lib/logger"

/**
 * 轻量进程内安全计数：只记类别，不记凭证 / Prompt / 客户正文 / PII。
 */
export type SecurityMetricName =
  | "proxy_image.reject"
  | "proxy_image.oversize"
  | "proxy_image.rate_limited"
  | "proxy_image.ok"
  | "obsidian.denied"
  | "obsidian.quota"
  | "obsidian.ok"

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
  return {
    "proxy_image.reject": counters.get("proxy_image.reject") ?? 0,
    "proxy_image.oversize": counters.get("proxy_image.oversize") ?? 0,
    "proxy_image.rate_limited": counters.get("proxy_image.rate_limited") ?? 0,
    "proxy_image.ok": counters.get("proxy_image.ok") ?? 0,
    "obsidian.denied": counters.get("obsidian.denied") ?? 0,
    "obsidian.quota": counters.get("obsidian.quota") ?? 0,
    "obsidian.ok": counters.get("obsidian.ok") ?? 0,
  }
}

/**
 * @description 测试用：清空计数
 */
export function resetSecurityMetricsForTests(): void {
  counters.clear()
}
