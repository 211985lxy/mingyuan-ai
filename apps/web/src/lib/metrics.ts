import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from "prom-client"

export const metricsRegistry = new Registry()

metricsRegistry.setDefaultLabels({ service: "mingyuan-web" })
collectDefaultMetrics({ register: metricsRegistry })

// ─── HTTP Request Metrics ───────────────────────────────

export const httpRequestsTotal = new Counter({
  name: "mingyuan_http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "path", "status"] as const,
  registers: [metricsRegistry],
})

export const httpRequestDuration = new Histogram({
  name: "mingyuan_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "path", "status"] as const,
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120],
  registers: [metricsRegistry],
})

// ─── Business Metrics ───────────────────────────────────

// ─── External API Metrics ───────────────────────────────

export const externalApiRequestsTotal = new Counter({
  name: "mingyuan_external_api_requests_total",
  help: "Total external API requests",
  labelNames: ["service", "endpoint", "status"] as const,
  registers: [metricsRegistry],
})

export const externalApiDuration = new Histogram({
  name: "mingyuan_external_api_duration_seconds",
  help: "External API request duration in seconds",
  labelNames: ["service", "endpoint"] as const,
  buckets: [0.5, 1, 2, 5, 10, 30, 60],
  registers: [metricsRegistry],
})

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
