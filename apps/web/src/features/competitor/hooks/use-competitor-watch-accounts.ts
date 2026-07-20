import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import {
  ApiError, addWatchAccount, deleteWatchAccount, listWatchAccounts, refreshWatchAccounts,
  type SimilarAccount, type WatchAccount,
} from "@/lib/api/client"
import { formatCompetitorRefreshError } from "@/lib/competitor/display"
import { validateCompetitorUrl } from "@/features/competitor/competitor-url-utils"

function useAccountList() {
  const [accounts, setAccounts] = useState<WatchAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null)
  const loadAccounts = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const { items } = await listWatchAccounts()
      setAccounts(items)
      setActiveAccountId((previous) => items.some((account) => account.id === previous) ? previous : items[0]?.id ?? null)
    } catch { toast.error("加载监控列表失败")
    } finally { if (showLoading) setLoading(false) }
  }, [])
  useEffect(() => {
    const timer = window.setTimeout(() => void loadAccounts(), 0)
    return () => window.clearTimeout(timer)
  }, [loadAccounts])
  useEffect(() => {
    if (!accounts.some((account) => account.refreshStatus === "refreshing")) return
    const timer = window.setInterval(() => void loadAccounts(false), 3000)
    return () => window.clearInterval(timer)
  }, [accounts, loadAccounts])
  return { accounts, activeAccountId, loadAccounts, loading, setAccounts, setActiveAccountId }
}

function useAccountAdd(loadAccounts: () => Promise<void>) {
  const [addUrl, setAddUrl] = useState("")
  const [adding, setAdding] = useState(false)
  const addAccount = async (url = addUrl, successMessage = "已添加监控账号") => {
    if (!url.trim()) return
    const validated = validateCompetitorUrl(url)
    if (!validated.ok) {
      toast.error(validated.error)
      return
    }
    setAdding(true)
    try { await addWatchAccount(validated.url); toast.success(successMessage); setAddUrl(""); await loadAccounts()
    } catch (error) {
      const message = error instanceof ApiError && error.details ? String((error.details as Record<string, unknown>).error || "") : ""
      toast.error(message || "添加失败")
    } finally { setAdding(false) }
  }
  const addDiscoveredAccount = async (account: SimilarAccount) => {
    if (account.targetUrl) await addAccount(account.targetUrl, "已加入监控，刷新后可进入作品池和 AIM 选题依据")
  }
  return { addAccount, addDiscoveredAccount, addUrl, adding, setAddUrl }
}

function useAccountMaintenance(list: ReturnType<typeof useAccountList>) {
  const [refreshing, setRefreshing] = useState(false)
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const removeAccount = async (id: string) => {
    if (deletingId) return
    setDeletingId(id)
    try {
      await deleteWatchAccount(id)
      list.setAccounts((previous) => {
        const remaining = previous.filter((account) => account.id !== id)
        list.setActiveAccountId((active) => active === id ? remaining[0]?.id ?? null : active)
        return remaining
      })
      toast.success("已移除监控账号")
    } catch { toast.error("移除失败")
    } finally { setDeletingId(null) }
  }
  const refreshAll = async () => {
    setRefreshing(true)
    try {
      const result = await refreshWatchAccounts()
      const firstError = result.results.find((item) => item.status === "failed")?.error
      if (result.summary.failed > 0) toast.error(firstError ? formatCompetitorRefreshError(firstError) : `刷新失败: ${result.summary.failed}/${result.summary.total}`)
      else toast.success(`已开始刷新 ${result.summary.total} 个账号`)
      await list.loadAccounts(false)
    } catch (error) { toast.error(error instanceof Error ? error.message : "刷新失败")
    } finally { setRefreshing(false) }
  }
  const refreshAccount = async (id: string) => {
    setRefreshingId(id)
    list.setAccounts((previous) => previous.map((account) => account.id === id ? { ...account, refreshStatus: "refreshing" } : account))
    try {
      const result = await refreshWatchAccounts(id); await list.loadAccounts(false)
      const failed = result.results.find((item) => item.status === "failed")
      if (failed) toast.error(failed.error ? formatCompetitorRefreshError(failed.error) : "刷新失败，账号链接已保存。")
      else toast.success("已开始后台刷新")
    } catch (error) { toast.error(error instanceof Error ? error.message : "刷新失败"); await list.loadAccounts()
    } finally { setRefreshingId(null) }
  }
  return { deletingId, refreshAccount, refreshAll, refreshing, refreshingId, removeAccount }
}

/**
 * @description React Hook：competitorwatchaccounts
 * @returns 无返回值
 */
export function useCompetitorWatchAccounts() {
  const list = useAccountList()
  return { ...list, ...useAccountAdd(() => list.loadAccounts()), ...useAccountMaintenance(list) }
}
