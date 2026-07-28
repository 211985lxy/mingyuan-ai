"use client"

import { useCustomerKnowledgeData } from "@/features/knowledge/hooks/use-customer-knowledge-data"
import {
  useCustomerKnowledgeFilterState,
  useVisibleCustomerKnowledgeEntries,
} from "@/features/knowledge/hooks/use-customer-knowledge-filters"
import { useCustomerKnowledgeMutations } from "@/features/knowledge/hooks/use-customer-knowledge-mutations"

export function useCustomerKnowledgeWorkspace() {
  const filters = useCustomerKnowledgeFilterState()
  const data = useCustomerKnowledgeData({
    statusFilter: filters.statusFilter,
    projectFilter: filters.projectFilter,
    categoryFilter: filters.categoryFilter,
  })
  const visibleEntries = useVisibleCustomerKnowledgeEntries(data.entries, filters.keyword)
  const mutations = useCustomerKnowledgeMutations({
    projectFilter: filters.projectFilter,
    reload: data.load,
  })

  return {
    ...filters,
    ...data,
    ...mutations,
    visibleEntries,
  }
}
