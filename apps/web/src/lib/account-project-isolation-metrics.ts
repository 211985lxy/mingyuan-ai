/**
 * Account-project isolation metrics (Task 10 / rollout Gate monitoring).
 *
 * Content-free, process-local counters for the three isolation events that the
 * staged rollout (apps/web/docs/operations/account-project-isolation-rollout.md)
 * is monitored against:
 *
 *   - `project_context_mismatch_total`  — an account-project binding rejection
 *     happened at the execution gate BEFORE any model call / knowledge recall.
 *     Labels: entry type (web/remote/newsroom/inspiration/background) + error code.
 *   - `legacy_null_scope_blocked_total` — a legacy row that still carries
 *     `projectId = null` was refused for a project-scoped read/generation path.
 *     Label: which legacy record type was blocked (content-free).
 *   - `stale_task_quarantined_total`    — a stale queued AgentInvocation /
 *     BackgroundTask was actually quarantined (Task 6 primitives). Label: code.
 *
 * This mirrors the lightweight in-memory counter style already established by
 * security-metrics.ts: dependency-free, no prom-client, no external services,
 * so it is safe to import from the execution gate, the background-task module
 * (which intentionally stays free of the prisma singleton) and worker code.
 *
 * SECURITY — labels are the ONLY dimensions allowed by the isolation brief:
 * an entry/legacy TYPE plus a STABLE ERROR CODE. It is never legal to pass
 * customer content, account nicknames, user ids, raw messages, project names
 * or any body/chat/knowledge text as a label value. The reader and render
 * helpers below expose exactly what was counted so unit tests can assert that
 * no content marker ever appears in metric output.
 */

export type IsolationEntryType = "web" | "remote" | "newsroom" | "inspiration" | "background"

/**
 * Legacy data kinds that can be blocked because they still carry `projectId = null`.
 * Kept as a content-free enum so new kinds can be added without ever allowing
 * free text into the metric.
 */
export type LegacyNullScopeKind = "script_structure"

export type IsolationMetricName =
  | "project_context_mismatch_total"
  | "legacy_null_scope_blocked_total"
  | "stale_task_quarantined_total"

/** Label schema per metric — the full allowed dimension vocabulary. */
export const ISOLATION_METRIC_LABEL_KEYS = {
  project_context_mismatch_total: ["entry", "code"],
  legacy_null_scope_blocked_total: ["type"],
  stale_task_quarantined_total: ["code"],
} as const satisfies Record<IsolationMetricName, readonly string[]>

/** Stable error code used when a null-project legacy record is blocked. */
export const LEGACY_NULL_SCOPE_ERROR_CODE = "LEGACY_NULL_PROJECT_SCOPE"
/** Stable error code written when a stale task is quarantined. */
export const STALE_TASK_QUARANTINED_ERROR_CODE = "ACCOUNT_PROJECT_CONTEXT_STALE"

type LabelBag = { entry?: string; code?: string; type?: string }

const counters = new Map<string, number>()

/** Escape a label value into the Prometheus text grammar (never contains raw text). */
function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")
}

/** Build the stable map key for a metric + label set. */
function signature(name: IsolationMetricName, labels: LabelBag): string {
  const keys = ISOLATION_METRIC_LABEL_KEYS[name]
  const parts = keys.map((key) => `${key}="${escapeLabelValue(labels[key] ?? "")}"`)
  return parts.length > 0 ? `${name}{${parts.join(",")}}` : name
}

/** Derive a typed error-code label from an error, falling back to UNKNOWN. */
export function errorCodeLabel(error: unknown): string {
  if (error && typeof error === "object") {
    const code = (error as { code?: unknown }).code
    if (typeof code === "string" && code.length > 0) return code
  }
  return "UNKNOWN"
}

const ENTRY_TYPE_VALUES: readonly IsolationEntryType[] = [
  "web",
  "remote",
  "newsroom",
  "inspiration",
  "background",
]

/**
 * Normalize an internal source discriminator onto the fixed entry vocabulary.
 * The web generate path historically logs source "generate"; everything else is
 * already one of the five entry types. Returns null for anything unknown so a
 * stray caller value can NEVER become a label (content-free by construction).
 */
export function normalizeIsolationEntryType(source: string): IsolationEntryType | null {
  if (source === "generate") return "web"
  return (ENTRY_TYPE_VALUES as readonly string[]).includes(source)
    ? (source as IsolationEntryType)
    : null
}

/**
 * Increment an isolation counter. The overloads restrict each metric to its
 * OWN allowed dimensions so a call site can never smuggle content into another
 * metric's label set. Only values from the fixed vocabulary above are ever
 * stored — no user ids, no customer text, no messages.
 */
export function incrementIsolationMetric(
  name: "project_context_mismatch_total",
  labels: { entry: IsolationEntryType; code: string },
): void
export function incrementIsolationMetric(
  name: "legacy_null_scope_blocked_total",
  labels: { type: LegacyNullScopeKind },
): void
export function incrementIsolationMetric(
  name: "stale_task_quarantined_total",
  labels: { code: string },
): void
export function incrementIsolationMetric(
  name: IsolationMetricName,
  labels: LabelBag,
): void {
  const key = signature(name, labels)
  counters.set(key, (counters.get(key) ?? 0) + 1)
}

export interface IsolationMetricReading {
  name: IsolationMetricName
  labels: Record<string, string>
  value: number
}

/** Read the current value of one counter series (default 0). */
export function readIsolationMetric(
  name: IsolationMetricName,
  labels: LabelBag,
): number {
  return counters.get(signature(name, labels)) ?? 0
}

/** Snapshot of every non-zero series, for testable readers / dashboards. */
export function readIsolationMetricSeries(): IsolationMetricReading[] {
  const readings: IsolationMetricReading[] = []
  for (const [key, value] of counters.entries()) {
    const open = key.indexOf("{")
    const name = open >= 0 ? key.slice(0, open) : key
    const labelText = open >= 0 ? key.slice(open + 1, -1) : ""
    const labels: Record<string, string> = {}
    for (const part of labelText.split(",")) {
      if (!part) continue
      const eq = part.indexOf("=")
      if (eq <= 0) continue
      const labelKey = part.slice(0, eq)
      const raw = part.slice(eq + 1)
      const rawValue = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw
      labels[labelKey] = rawValue.replace(/\\"/g, '"').replace(/\\\\/g, "\\").replace(/\\n/g, "\n")
    }
    readings.push({
      name: name as IsolationMetricName,
      labels,
      value,
    })
  }
  return readings.sort((a, b) => {
    const byName = a.name.localeCompare(b.name)
    if (byName !== 0) return byName
    return JSON.stringify(a.labels).localeCompare(JSON.stringify(b.labels))
  })
}

/** Render the counters as Prometheus text (content-free by construction). */
export function renderIsolationMetrics(): string {
  const lines: string[] = []
  for (const metric of Object.keys(ISOLATION_METRIC_LABEL_KEYS) as IsolationMetricName[]) {
    lines.push(`# TYPE ${metric} counter`)
  }
  for (const reading of readIsolationMetricSeries()) {
    const labels = Object.entries(reading.labels)
      .map(([k, v]) => `${k}="${escapeLabelValue(v)}"`)
      .join(",")
    const series = labels.length > 0 ? `${reading.name}{${labels}}` : reading.name
    lines.push(`${series} ${reading.value}`)
  }
  return lines.join("\n") + "\n"
}

/** Test hook: clear all counters (matches security-metrics.ts convention). */
export function resetIsolationMetricsForTests(): void {
  counters.clear()
}
