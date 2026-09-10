import {
  Registry,
  Counter,
  Gauge,
  collectDefaultMetrics,
} from "prom-client"

export const metricsRegistry = new Registry()

metricsRegistry.setDefaultLabels({ service: "mingyuan-web" })
collectDefaultMetrics({ register: metricsRegistry })

// ─── Database & Redis Health ────────────────────────────

export const dbConnectionPoolActive = new Gauge({
  name: "mingyuan_db_connection_pool_active",
  help: "Active database connections",
  registers: [metricsRegistry],
})

export const redisConnectionStatus = new Gauge({
  name: "mingyuan_redis_connection_status",
  help: "Redis connection status (1=connected, 0=disconnected)",
  registers: [metricsRegistry],
})

export const auditReconcileFailuresTotal = new Counter({
  name: "mingyuan_audit_reconcile_failures_total",
  help: "Audit reconciliation failures by specialist source",
  labelNames: ["source"] as const,
  registers: [metricsRegistry],
})

export const auditReconcileLagMs = new Gauge({
  name: "mingyuan_audit_reconcile_lag_ms",
  help: "Audit reconciliation lag in milliseconds",
  registers: [metricsRegistry],
})

export const statisticsQueryFailuresTotal = new Counter({
  name: "mingyuan_statistics_query_failures_total",
  help: "Statistics center query failures",
  labelNames: ["source"] as const,
  registers: [metricsRegistry],
})

export const channelMetricRollupFailuresTotal = new Counter({
  name: "mingyuan_channel_metric_rollup_failures_total",
  help: "Durable channel metric rollup failures",
  labelNames: ["platform", "metric"] as const,
  registers: [metricsRegistry],
})

export const auditIndexFailuresTotal = new Counter({
  name: "mingyuan_audit_index_failures_total",
  help: "Cross-source audit index write failures",
  labelNames: ["source"] as const,
  registers: [metricsRegistry],
})

export const auditIdempotencyConflictsTotal = new Counter({
  name: "mingyuan_audit_idempotency_conflicts_total",
  help: "Audit events rejected because a key carried a different payload",
  labelNames: ["source"] as const,
  registers: [metricsRegistry],
})
