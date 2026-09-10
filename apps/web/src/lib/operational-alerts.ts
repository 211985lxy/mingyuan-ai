import { env } from "@/env"
import { prisma } from "@/lib/prisma"
import { redactAuditValue } from "@/lib/audit-event-contract"
import {
  readSupervisorNotificationConfig,
  sanitizeSupervisorText,
  sendFeishuSystemAlert,
} from "@/lib/aim/feishu-supervisor-notifier"

export type AlertSeverity = "warning" | "error" | "critical"
export type AlertStatus = "open" | "acknowledged" | "resolved"

export interface OperationalAlert {
  id: string
  fingerprint: string
  rule: string
  severity: AlertSeverity
  status: AlertStatus
  summary: string
  source: string
  correlationId: string | null
  metadata: unknown
  firstSeenAt: Date
  lastSeenAt: Date
  occurrenceCount: number
  lastNotifiedAt: Date | null
  acknowledgedAt: Date | null
  acknowledgedBy: string | null
  resolvedAt: Date | null
  resolvedBy: string | null
  createdAt: Date
  updatedAt: Date
}

interface AlertDelegate {
  findUnique(args: unknown): Promise<OperationalAlert | null>
  create(args: unknown): Promise<OperationalAlert>
  update(args: unknown): Promise<OperationalAlert>
  findMany(args: unknown): Promise<OperationalAlert[]>
}

function getAlertDelegate(): AlertDelegate | undefined {
  const delegate = (prisma as unknown as { operationalAlert?: unknown }).operationalAlert
  if (!delegate || typeof delegate !== "object") return undefined
  const candidate = delegate as Partial<AlertDelegate>
  if ([candidate.findUnique, candidate.create, candidate.update, candidate.findMany].some((fn) => typeof fn !== "function")) return undefined
  return candidate as AlertDelegate
}

function safeAlertMetadata(value: unknown): unknown {
  return value === undefined ? undefined : redactAuditValue(value, 0, true)
}

function safeFingerprint(value: string): string {
  return value.trim().slice(0, 191) || "unknown-alert"
}

function notificationEnabled(): boolean {
  // Reuse the existing supervisor notification switch so control-center alerts
  // cannot silently create a second Feishu configuration surface.
  return env.AIM_LOOP_NOTIFICATIONS_ENABLED?.trim().toLowerCase() === "true"
}

async function maybeNotify(row: OperationalAlert, now: Date, shouldNotify: boolean, fetchImpl?: typeof fetch) {
  if (!shouldNotify || row.severity === "warning" || !notificationEnabled()) return
  try {
    const config = readSupervisorNotificationConfig()
    await sendFeishuSystemAlert({
      config,
      fingerprint: row.fingerprint,
      severity: row.severity,
      summary: row.summary,
      correlationId: row.correlationId || undefined,
      fetchImpl,
    })
    await getAlertDelegate()?.update({ where: { id: row.id }, data: { lastNotifiedAt: now } })
  } catch {
    // Alert persistence remains useful when Feishu is unavailable; the next
    // occurrence after the suppression window retries notification.
  }
}

export async function upsertOperationalAlert(input: {
  fingerprint: string
  rule: string
  severity: AlertSeverity
  summary: string
  source: string
  correlationId?: string | null
  metadata?: unknown
  now?: Date
  fetchImpl?: typeof fetch
}): Promise<{ row: OperationalAlert; changed: boolean }> {
  const delegate = getAlertDelegate()
  if (!delegate) throw new Error("OperationalAlert client is not generated")
  const now = input.now ?? new Date()
  const fingerprint = safeFingerprint(input.fingerprint)
  const summary = sanitizeSupervisorText(input.summary).slice(0, 500)
  const existing = await delegate.findUnique({ where: { fingerprint } })
  if (!existing) {
    const row = await delegate.create({
      data: {
        fingerprint,
        rule: input.rule.slice(0, 80),
        severity: input.severity,
        status: "open",
        summary,
        source: input.source.slice(0, 40),
        correlationId: input.correlationId || null,
        metadata: safeAlertMetadata(input.metadata),
        firstSeenAt: now,
        lastSeenAt: now,
      },
    })
    await maybeNotify(row, now, true, input.fetchImpl)
    return { row, changed: true }
  }

  const shouldNotify = existing.severity !== "warning"
    && (!existing.lastNotifiedAt || now.getTime() - existing.lastNotifiedAt.getTime() >= 15 * 60 * 1000)
  const row = await delegate.update({
    where: { id: existing.id },
    data: {
      severity: input.severity,
      status: existing.status === "resolved" ? "open" : existing.status,
      summary,
      source: input.source.slice(0, 40),
      correlationId: input.correlationId || existing.correlationId,
      metadata: safeAlertMetadata(input.metadata),
      lastSeenAt: now,
      occurrenceCount: { increment: 1 },
    },
  })
  await maybeNotify(row, now, shouldNotify, input.fetchImpl)
  return { row, changed: true }
}

export async function listOperationalAlerts(input: {
  status?: AlertStatus
  severity?: AlertSeverity
  limit?: number
  cursor?: string | null
}): Promise<{ data: OperationalAlert[]; nextCursor: string | null }> {
  const delegate = getAlertDelegate()
  if (!delegate) throw new Error("OperationalAlert client is not generated")
  const limit = Math.min(100, Math.max(1, Math.trunc(input.limit || 50)))
  const rows = await delegate.findMany({
    where: { ...(input.status ? { status: input.status } : {}), ...(input.severity ? { severity: input.severity } : {}) },
    orderBy: [{ lastSeenAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  })
  const data = rows.length > limit ? rows.slice(0, limit) : rows
  return { data, nextCursor: rows.length > limit ? data[data.length - 1]?.id || null : null }
}

export async function transitionOperationalAlert(input: {
  id: string
  transition: "acknowledged" | "resolved" | "reopened"
  adminId: string
  now?: Date
}): Promise<OperationalAlert> {
  const delegate = getAlertDelegate()
  if (!delegate) throw new Error("OperationalAlert client is not generated")
  const now = input.now ?? new Date()
  const data = input.transition === "acknowledged"
    ? { status: "acknowledged", acknowledgedAt: now, acknowledgedBy: input.adminId }
    : input.transition === "resolved"
      ? { status: "resolved", resolvedAt: now, resolvedBy: input.adminId }
      : { status: "open", acknowledgedAt: null, acknowledgedBy: null, resolvedAt: null, resolvedBy: null }
  return delegate.update({ where: { id: input.id }, data })
}

async function checkReconcileLag(now: Date): Promise<number> {
  const delegate = (prisma as unknown as { auditReconcileCheckpoint?: { findMany(args: unknown): Promise<Array<{ source: string; lastSuccessAt: Date | null }>> } }).auditReconcileCheckpoint
  if (!delegate) return 0
  const checkpoints = await delegate.findMany({ select: { source: true, lastSuccessAt: true } })
  let created = 0
  for (const checkpoint of checkpoints) {
    if (checkpoint.lastSuccessAt && now.getTime() - checkpoint.lastSuccessAt.getTime() <= 10 * 60 * 1000) continue
    await upsertOperationalAlert({
      fingerprint: `audit-reconcile-lag:${checkpoint.source}`,
      rule: "audit_reconcile_lag",
      severity: "error",
      summary: `审计对账源 ${checkpoint.source} 延迟超过 10 分钟`,
      source: "audit_reconcile",
      metadata: { source: checkpoint.source },
      now,
    })
    created += 1
  }
  return created
}

async function checkAimFailureRate(now: Date): Promise<number> {
  const delegate = (prisma as unknown as { aimExecutionTrace?: { findMany(args: unknown): Promise<Array<{ status: string }>> } }).aimExecutionTrace
  if (!delegate) return 0
  const rows = await delegate.findMany({ where: { createdAt: { gte: new Date(now.getTime() - 30 * 60 * 1000) }, status: { in: ["success", "failed"] } }, select: { status: true }, take: 1000 })
  const failed = rows.filter((row) => row.status === "failed").length
  if (rows.length < 10 || failed / rows.length < 0.2) return 0
  await upsertOperationalAlert({
    fingerprint: "aim-failure-rate:30m",
    rule: "aim_failure_rate",
    severity: "error",
    summary: `最近 30 分钟 AIM 失败率 ${(failed / rows.length * 100).toFixed(1)}%`,
    source: "aim_execution",
    metadata: { failed, total: rows.length },
    now,
  })
  return 1
}

export async function runOperationalAlertChecks(now = new Date()): Promise<{ created: number }> {
  const [reconcile, aim] = await Promise.all([checkReconcileLag(now), checkAimFailureRate(now)])
  return { created: reconcile + aim }
}
