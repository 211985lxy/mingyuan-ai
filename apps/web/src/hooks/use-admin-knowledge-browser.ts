"use client"

import * as React from "react"
import { toast } from "sonner"

import { fetchKnowledge, type KnowledgeEntry } from "@/features/knowledge/admin-knowledge-shared"
import type { KnowledgeAssetHealthResult } from "@/lib/knowledge-asset-health"

/**
 * @description 管理端知识浏览 Tab 的列表 / 统计 / 健康度状态
 */
export function useAdminKnowledgeBrowser() {
  const [browserEntries, setBrowserEntries] = React.useState<KnowledgeEntry[]>([])
  const [browserTotal, setBrowserTotal] = React.useState(0)
  const [browserPage, setBrowserPage] = React.useState(1)
  const [browserSearch, setBrowserSearch] = React.useState("")
  const [browserSearchInput, setBrowserSearchInput] = React.useState("")
  const [browserLoading, setBrowserLoading] = React.useState(false)
  const browserPageSize = 20
  const [browserProject, setBrowserProject] = React.useState("")
  const [browserCategory, setBrowserCategory] = React.useState("")
  const [browserStats, setBrowserStats] = React.useState<{
    totalEntries: number
    categoryDistribution: Array<{ category: string; categoryLabel: string; count: number }>
  } | null>(null)
  const [assetHealth, setAssetHealth] = React.useState<KnowledgeAssetHealthResult | null>(null)
  const [healthTick, setHealthTick] = React.useState(0)

  const fetchBrowserData = React.useCallback(async () => {
    if (!browserProject) {
      setBrowserEntries([])
      setBrowserTotal(0)
      setBrowserLoading(false)
      return
    }
    setBrowserLoading(true)
    try {
      const res = await fetchKnowledge({
        page: browserPage,
        pageSize: browserPageSize,
        search: browserSearch,
        category: browserCategory,
        projectId: browserProject,
        status: "active",
      })
      setBrowserEntries(Array.isArray(res.data?.results) ? res.data.results : [])
      setBrowserTotal(typeof res.data?.total === "number" ? res.data.total : 0)
    } catch (error) {
      setBrowserEntries([])
      setBrowserTotal(0)
      toast.error(error instanceof Error ? error.message : "知识加载失败，请重试")
    } finally {
      setBrowserLoading(false)
    }
  }, [browserPage, browserSearch, browserCategory, browserProject])

  React.useEffect(() => {
    void Promise.resolve().then(fetchBrowserData)
  }, [fetchBrowserData])

  React.useEffect(() => {
    const t = window.setTimeout(() => {
      setBrowserSearch(browserSearchInput)
      setBrowserPage(1)
    }, 300)
    return () => window.clearTimeout(t)
  }, [browserSearchInput])

  React.useEffect(() => {
    const qs = browserProject ? `?projectId=${encodeURIComponent(browserProject)}` : ""
    void fetch(`/api/admin/knowledge/stats${qs}`)
      .then((r) => r.json())
      .then((json) => {
        const data = json.data ?? json
        setBrowserStats({
          totalEntries: data?.totalEntries ?? 0,
          categoryDistribution: Array.isArray(data?.categoryDistribution) ? data.categoryDistribution : [],
        })
      })
      .catch(() => setBrowserStats(null))
  }, [browserProject])

  React.useEffect(() => {
    if (!browserProject || browserProject === "unbound") {
      setAssetHealth(null)
      return
    }
    let cancelled = false
    void fetch(
      `/api/admin/knowledge/asset-health?projectId=${encodeURIComponent(browserProject)}`,
    )
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return
        setAssetHealth(json?.data?.health ?? null)
      })
      .catch(() => {
        if (!cancelled) setAssetHealth(null)
      })
    return () => {
      cancelled = true
    }
  }, [browserProject, healthTick])

  const bumpHealth = React.useCallback(() => {
    setHealthTick((tick) => tick + 1)
  }, [])

  return {
    browserEntries,
    browserTotal,
    browserPage,
    browserPageSize,
    browserSearchInput,
    browserLoading,
    browserProject,
    browserCategory,
    browserStats,
    assetHealth,
    setBrowserPage,
    setBrowserSearchInput,
    setBrowserProject,
    setBrowserCategory,
    fetchBrowserData,
    bumpHealth,
  }
}
