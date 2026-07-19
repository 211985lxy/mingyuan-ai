import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import {
  addWatchAccount,
  deleteWatchAccount,
  listWatchAccounts,
  refreshWatchAccounts,
  type SimilarAccount,
  type WatchAccount,
} from "@/lib/api/client"
import { formatCompetitorRefreshError } from "@/lib/competitor/display"
import { validateCompetitorUrl } from "@/features/competitor/competitor-url-utils"

export function useCompetitorWatchAccounts() {
  const [accounts, setAccounts] = useState<WatchAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [addUrl, setAddUrl] = useState("")
  const [adding, setAdding] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null)

  const loadAccounts = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const { items } = await listWatchAccounts()
      setAccounts(items)
      setActiveAccountId((previous) => items.some((account) => account.id === previous) ? previous : items[0]?.id ?? null)
    } catch {
      toast.error("加载监控列表失败")
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAccounts()
  }, [loadAccounts])

  useEffect(() => {
    if (!accounts.some((account) => account.refreshStatus === "refreshing")) return
    const timer = window.setInterval(() => void loadAccounts(false), 3000)
    return () => window.clearInterval(timer)
  }, [accounts, loadAccounts])

  async function addAccount(url = addUrl) {
    if (!url.trim()) return
    const validated = validateCompetitorUrl(url)
    if (!validated.ok) {
      toast.error(validated.error)
      return
    }
    setAdding(true)
    try {
      await addWatchAccount(validated.url)
      toast.success("已添加监控账号")
      setAddUrl("")
      await loadAccounts()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "添加失败")
    } finally {
      setAdding(false)
    }
  }

  async function addDiscoveredAccount(account: SimilarAccount) {
    if (account.targetUrl) await addAccount(account.targetUrl)
  }

  async function removeAccount(id: string) {
    if (deletingId) return
    setDeletingId(id)
    try {
      await deleteWatchAccount(id)
      setAccounts((previous) => {
        const remaining = previous.filter((account) => account.id !== id)
        setActiveAccountId((active) => active === id ? remaining[0]?.id ?? null : active)
        return remaining
      })
      toast.success("已移除监控账号")
    } catch {
      toast.error("移除失败")
    } finally {
      setDeletingId(null)
    }
  }

  async function refreshAll() {
    setRefreshing(true)
    try {
      const result = await refreshWatchAccounts()
      if (result.summary.failed > 0) {
        const firstError = result.results.find((item) => item.status === "failed")?.error
        toast.error(firstError ? formatCompetitorRefreshError(firstError) : `刷新失败: ${result.summary.failed}/${result.summary.total}`)
      } else {
        toast.success(`已开始刷新 ${result.summary.total} 个账号`)
      }
      await loadAccounts(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "刷新失败")
    } finally {
      setRefreshing(false)
    }
  }

  async function refreshAccount(accountId: string) {
    setRefreshingId(accountId)
    setAccounts((previous) => previous.map((account) => account.id === accountId ? { ...account, refreshStatus: "refreshing" } : account))
    try {
      const result = await refreshWatchAccounts(accountId)
      await loadAccounts(false)
      const failed = result.results.find((item) => item.status === "failed")
      if (failed) toast.error(failed.error ? formatCompetitorRefreshError(failed.error) : "刷新失败，账号链接已保存。")
      else toast.success("已开始后台刷新")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "刷新失败")
      await loadAccounts()
    } finally {
      setRefreshingId(null)
    }
  }

  return {
    accounts, activeAccountId, addAccount, addDiscoveredAccount, addUrl, adding, deletingId,
    loadAccounts, loading, refreshAccount, refreshAll, refreshing, refreshingId,
    removeAccount, setActiveAccountId, setAddUrl,
  }
}
