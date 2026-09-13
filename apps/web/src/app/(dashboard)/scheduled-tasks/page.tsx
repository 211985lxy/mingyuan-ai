"use client"

import { useCallback, useEffect, useState } from "react"

import { AutomationLedgerView } from "@/components/automation-ledger/automation-ledger-view"
import type { AutomationJobId } from "@/lib/aim/automation-ledger-catalog"
import { fetchAutomationLedger, type AutomationLedger } from "@/lib/api/automation-ledger"

async function postAdminLedger(path: string, body: Record<string, unknown>) {
  const response = await fetch(path, {
    method: path.includes("flags") ? "PATCH" : "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) {
    throw new Error(payload.error || (response.status === 401 ? "需要管理员登录才能操作" : "操作失败"))
  }
}

export default function AutomationLedgerPage() {
  const [ledger, setLedger] = useState<AutomationLedger | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyJobId, setBusyJobId] = useState<string | null>(null)
  const [jobActionError, setJobActionError] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setLedger(await fetchAutomationLedger())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "台账加载失败")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function withJobAction(jobId: AutomationJobId, action: () => Promise<void>) {
    setBusyJobId(jobId)
    setJobActionError((current) => ({ ...current, [jobId]: "" }))
    try {
      await action()
      await load()
    } catch (cause) {
      setJobActionError((current) => ({
        ...current,
        [jobId]: cause instanceof Error ? cause.message : "操作失败",
      }))
    } finally {
      setBusyJobId(null)
    }
  }

  return (
    <AutomationLedgerView
      ledger={ledger}
      loading={loading}
      error={error}
      busyJobId={busyJobId}
      jobActionError={jobActionError}
      onRefresh={() => void load()}
      onRun={(jobId) => void withJobAction(jobId, () => postAdminLedger("/api/admin/automation-ledger/run", { jobId }))}
      onToggle={(jobId, enabled) => void withJobAction(jobId, () => postAdminLedger("/api/admin/automation-ledger/flags", { jobId, enabled }))}
    />
  )
}
