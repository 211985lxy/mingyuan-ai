"use client"

import React from "react"
import { toast } from "sonner"
import {
  AdminApiError,
  createGovernanceAssignment,
  getGovernanceAssignments,
  setGovernanceAssignmentStatus,
  type GovernanceAssignmentInput,
  type GovernanceAssignmentItem,
} from "@/lib/api/admin-client"

export const EMPTY_GOVERNANCE_DRAFT: GovernanceAssignmentInput = {
  scopeType: "workflow",
  scopeId: "content-growth-v1",
  role: "business_owner",
  userId: "",
  externalOpenId: "",
  externalUserId: "",
  status: "active",
}

export function useGovernanceAssignments() {
  const [items, setItems] = React.useState<GovernanceAssignmentItem[]>([])
  const [total, setTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [draft, setDraft] = React.useState<GovernanceAssignmentInput>(EMPTY_GOVERNANCE_DRAFT)
  const [statusFilter, setStatusFilter] = React.useState<"all" | "active" | "inactive">("active")

  const fetchItems = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getGovernanceAssignments({
        status: statusFilter === "all" ? undefined : statusFilter,
        limit: 100,
        offset: 0,
      })
      setItems(res.items)
      setTotal(res.total)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "加载失败"
      setError(msg)
      toast.error(msg)
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  React.useEffect(() => {
    void fetchItems()
  }, [fetchItems])

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await createGovernanceAssignment({
        ...draft,
        userId: draft.userId?.trim() || undefined,
        externalOpenId: draft.externalOpenId?.trim() || undefined,
        externalUserId: draft.externalUserId?.trim() || undefined,
      })
      toast.success("已新增责任配置")
      setDraft(EMPTY_GOVERNANCE_DRAFT)
      await fetchItems()
    } catch (err) {
      toast.error(err instanceof AdminApiError ? err.message : "保存失败")
    } finally {
      setSaving(false)
    }
  }

  async function onToggle(item: GovernanceAssignmentItem) {
    const next = item.status === "active" ? "inactive" : "active"
    try {
      await setGovernanceAssignmentStatus(item.id, next)
      toast.success(next === "inactive" ? "已停用" : "已启用")
      await fetchItems()
    } catch (err) {
      toast.error(err instanceof AdminApiError ? err.message : "更新失败")
    }
  }

  return {
    items,
    total,
    loading,
    error,
    saving,
    draft,
    setDraft,
    statusFilter,
    setStatusFilter,
    fetchItems,
    onCreate,
    onToggle,
  }
}
