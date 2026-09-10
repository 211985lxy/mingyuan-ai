export type OperationalAlertStatus = "open" | "acknowledged" | "resolved"
export type OperationalAlertSeverity = "warning" | "error" | "critical"

export interface ControlCenterFilters {
  from: string
  to: string
  projectId?: string
  agentId?: string
  channel?: string
}

export interface MetricValue {
  value: number | null
  reason?: string
}

export interface ControlCenterFreshness {
  source: string
  lastUpdatedAt: string | null
  lagMs: number | null
  degraded: boolean
  reason?: string
}

export interface CoverageSummary {
  available: number
  total: number
  ratio: number | null
  reason?: string
}

export function normalizeControlCenterFilters(input: {
  from: string
  to: string
  projectId?: string | null
  agentId?: string | null
  channel?: string | null
}): ControlCenterFilters {
  const clean = (value: string | null | undefined) => {
    const trimmed = value?.trim()
    return trimmed ? trimmed.slice(0, 191) : undefined
  }
  return {
    from: input.from,
    to: input.to,
    projectId: clean(input.projectId),
    agentId: clean(input.agentId),
    channel: clean(input.channel),
  }
}

export function ratioOrNull(available: number, total: number): number | null {
  if (!Number.isFinite(available) || !Number.isFinite(total) || total <= 0) return null
  return Math.max(0, Math.min(1, available / total))
}
