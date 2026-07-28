"use client"

import { useMemo, useState } from "react"
import type { KnowledgeEntry } from "@/lib/api/client"

export function useCustomerKnowledgeFilterState() {
  const [keyword, setKeyword] = useState("")
  const [projectFilter, setProjectFilter] = useState("all")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState<"active" | "archived">("active")

  return {
    keyword,
    setKeyword,
    projectFilter,
    setProjectFilter,
    categoryFilter,
    setCategoryFilter,
    statusFilter,
    setStatusFilter,
  }
}

export function useVisibleCustomerKnowledgeEntries(
  entries: KnowledgeEntry[],
  keyword: string,
) {
  return useMemo(() => {
    const q = keyword.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((entry) =>
      `${entry.title}\n${entry.content}\n${entry.tags.join(" ")}`.toLowerCase().includes(q),
    )
  }, [entries, keyword])
}
