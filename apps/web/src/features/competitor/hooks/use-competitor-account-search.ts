"use client"

import { useState } from "react"
import { toast } from "sonner"

import {
  ApiError,
  searchCompetitorAccounts,
  type SearchCompetitorAccountResult,
} from "@/lib/api/client"

export function useCompetitorAccountSearch(options: {
  keyword: string
  disabled?: boolean
  adding: boolean
  onAdd: (url?: string, successMessage?: string) => Promise<void>
}) {
  const { keyword, disabled = false, adding, onAdd } = options
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<SearchCompetitorAccountResult[]>([])
  const [searched, setSearched] = useState(false)
  const [addingFinder, setAddingFinder] = useState<string | null>(null)

  async function handleSearch() {
    const q = keyword.trim()
    if (!q || searching || disabled) return
    setSearching(true)
    setSearched(true)
    try {
      const data = await searchCompetitorAccounts(q)
      setResults(data.accounts.filter((account) => account.targetUrl.trim()))
      if (data.partial) {
        toast.warning("部分平台搜索暂时不可用，已展示可用结果")
      }
    } catch (error) {
      setResults([])
      const message =
        error instanceof ApiError && error.details
          ? String((error.details as Record<string, unknown>).error || "")
          : ""
      toast.error(message || (error instanceof Error ? error.message : "搜索账号失败"))
    } finally {
      setSearching(false)
    }
  }

  async function handleAddSearchResult(account: SearchCompetitorAccountResult) {
    if (adding || disabled || addingFinder) return
    const accountId = account.platformUserId.trim()
    if (!accountId || !account.targetUrl.trim()) {
      toast.error("该结果缺少账号标识，请换一个")
      return
    }
    setAddingFinder(accountId)
    try {
      const label = account.nickname.trim() || "账号"
      await onAdd(account.targetUrl, `已添加「${label}」`)
    } catch (error) {
      if (error instanceof Error && error.message) {
        toast.error(error.message)
      }
    } finally {
      setAddingFinder(null)
    }
  }

  return {
    searching,
    results,
    searched,
    addingFinder,
    handleSearch,
    handleAddSearchResult,
  }
}
