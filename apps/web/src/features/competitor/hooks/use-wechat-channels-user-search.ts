"use client"

import { useState } from "react"
import { toast } from "sonner"

import { buildWechatChannelsProfileUrl } from "@/features/competitor/competitor-url-utils"
import {
  ApiError,
  searchChannelsUsers,
  type SearchChannelsUserResult,
} from "@/lib/api/client"

export function useWechatChannelsUserSearch(options: {
  disabled?: boolean
  adding: boolean
  onAdd: (url: string, successMessage?: string) => Promise<void>
}) {
  const { disabled = false, adding, onAdd } = options
  const [keyword, setKeyword] = useState("")
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<SearchChannelsUserResult[]>([])
  const [searched, setSearched] = useState(false)
  const [addingFinder, setAddingFinder] = useState<string | null>(null)

  async function handleSearch() {
    const q = keyword.trim()
    if (!q || searching || disabled) return
    setSearching(true)
    setSearched(true)
    try {
      const data = await searchChannelsUsers(q)
      setResults(data.users.filter((user) => user.finderUsername.trim()))
    } catch (error) {
      setResults([])
      const message =
        error instanceof ApiError && error.details
          ? String((error.details as Record<string, unknown>).error || "")
          : ""
      toast.error(message || (error instanceof Error ? error.message : "搜索视频号失败"))
    } finally {
      setSearching(false)
    }
  }

  async function handleAddChannelsUser(user: SearchChannelsUserResult) {
    if (adding || disabled || addingFinder) return
    const finder = user.finderUsername.trim()
    if (!finder) {
      toast.error("该结果缺少账号标识，请换一个")
      return
    }
    setAddingFinder(finder)
    try {
      const profileUrl = buildWechatChannelsProfileUrl(finder)
      const label = user.nickname.trim() || "视频号"
      await onAdd(profileUrl, `已添加「${label}」`)
    } catch (error) {
      if (error instanceof Error && error.message) {
        toast.error(error.message)
      }
    } finally {
      setAddingFinder(null)
    }
  }

  return {
    keyword,
    setKeyword,
    searching,
    results,
    searched,
    addingFinder,
    handleSearch,
    handleAddChannelsUser,
  }
}
