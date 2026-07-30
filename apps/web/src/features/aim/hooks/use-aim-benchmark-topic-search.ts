"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import type { OpportunityItem } from "@/features/opportunities/contracts/types"
import {
  adoptOpportunityForWriting,
  saveOpportunityCollection,
  searchContentOpportunities,
} from "@/features/opportunities/lib/opportunity-collection-client"

export function useAimBenchmarkTopicSearch(projectId?: string | null) {
  const router = useRouter()
  const [keyword, setKeyword] = useState("")
  const [loading, setLoading] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [items, setItems] = useState<OpportunityItem[]>([])
  const [warnings, setWarnings] = useState<string[]>([])

  async function search() {
    if (!keyword.trim()) {
      toast.error("请输入关键词，例如：数字供暖 / 私域获客")
      return
    }
    setLoading(true)
    setItems([])
    setWarnings([])
    try {
      const result = await searchContentOpportunities({
        keyword: keyword.trim(),
        platforms: ["douyin", "wechat_channels"],
        count: 12,
        sortOrder: "popular",
        timeRange: "30d",
      })
      setItems(result.items)
      setWarnings(result.warnings)
      if (result.items.length === 0) toast.info("没搜到，换个更具体的词试试")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "搜索失败")
    } finally {
      setLoading(false)
    }
  }

  async function save(item: OpportunityItem) {
    const key = `${item.platform}-${item.sourceId}:save`
    setBusyKey(key)
    try {
      await saveOpportunityCollection({
        name: `${keyword.trim() || "对标"} · ${(item.title || "选题").slice(0, 40)}`,
        items: [item],
        projectId,
      })
      toast.success("已收藏到研究篮，可稍后在市场洞察里继续拆")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "收藏失败")
    } finally {
      setBusyKey(null)
    }
  }

  async function write(item: OpportunityItem) {
    const key = `${item.platform}-${item.sourceId}:write`
    setBusyKey(key)
    try {
      const { generationId } = await adoptOpportunityForWriting({ item, projectId, keyword })
      toast.success("已转成写稿事项")
      router.push(`/aim?generationId=${encodeURIComponent(generationId)}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "转写稿失败")
    } finally {
      setBusyKey(null)
    }
  }

  return {
    keyword,
    setKeyword,
    loading,
    busyKey,
    items,
    warnings,
    search,
    save,
    write,
  }
}
