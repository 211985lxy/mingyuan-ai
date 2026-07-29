"use client"

import type { AimAgentId } from "@/lib/aim-ui-config"
import {
  reportFinalDisposition,
  reportRequiredAimRunEvent,
} from "@/lib/aim/run-events"
import type { FinalDisposition } from "@/lib/aim/run-outcome-telemetry"

interface ActiveSession {
  activeMs: number
  lastInteractionAt: number
  edited: boolean
}

const ACTIVE_GAP_CAP_MS = 60_000
const sessions = new Map<string, ActiveSession>()

export function startRunOutcomeActivity(runId: string | null | undefined) {
  if (!runId || sessions.has(runId)) return
  sessions.set(runId, { activeMs: 0, lastInteractionAt: Date.now(), edited: false })
}

function touch(runId: string) {
  const now = Date.now()
  const session = sessions.get(runId) ?? {
    activeMs: 0,
    lastInteractionAt: now,
    edited: false,
  }
  session.activeMs += Math.max(0, Math.min(now - session.lastInteractionAt, ACTIVE_GAP_CAP_MS))
  session.lastInteractionAt = now
  sessions.set(runId, session)
  return session
}

function requestId(prefix: string, runId: string) {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `${prefix}:${runId}:${suffix}`
}

export function resolveRunWorkflowId(agentId: AimAgentId): string {
  return agentId === "business_system_diagnosis" || agentId === "business_diagnosis"
    ? "sales-diagnosis-v1"
    : "content-growth-v1"
}

export async function reportWebRunEdited(input: {
  runId: string | null | undefined
  workflowId: string
  taskType: string
}) {
  if (!input.runId) throw new Error("缺少执行编号，编辑遥测未记录")
  const session = touch(input.runId)
  session.edited = true
  const editRequestId = requestId("web_edit", input.runId)
  await reportRequiredAimRunEvent(input.runId, "edited", {
    workflowId: input.workflowId,
    taskType: input.taskType,
    channel: "web",
    humanActiveMinutes: session.activeMs / 60_000,
    requestId: editRequestId,
  })
}

export async function reportWebFinalDisposition(input: {
  runId: string | null | undefined
  workflowId: string
  taskType: string
  finalDisposition: FinalDisposition
  reasonCode?: string
}) {
  if (!input.runId) throw new Error("缺少执行编号，经营结果未记录")
  const session = touch(input.runId)
  const finalDisposition =
    input.finalDisposition === "accepted_first_pass" && session.edited
      ? "accepted_after_edit"
      : input.finalDisposition
  const outcomeRequestId = requestId("web_outcome", input.runId)
  await reportFinalDisposition(input.runId, {
    workflowId: input.workflowId,
    taskType: input.taskType,
    finalDisposition,
    humanActiveMinutes: session.activeMs / 60_000,
    reasonCode: input.reasonCode,
    channel: "web",
    requestId: outcomeRequestId,
  })
}
