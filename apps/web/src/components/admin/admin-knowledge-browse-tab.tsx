"use client"

import * as React from "react"

import { KnowledgeBrowser, type AdminProject as BrowserAdminProject } from "@/components/admin/knowledge-browser"
import { KnowledgeBrowserHealthBlock } from "@/components/admin/knowledge-browser-health-block"
import type { KnowledgeEntry } from "@/features/knowledge/admin-knowledge-shared"
import type { KnowledgeAssetHealthResult } from "@/lib/knowledge-asset-health"
import type { KnowledgeCategory } from "@/lib/knowledge-categories"

export interface AdminKnowledgeBrowseTabProps {
  browserEntries: KnowledgeEntry[]
  browserTotal: number
  browserLoading: boolean
  browserPage: number
  browserPageSize: number
  projects: BrowserAdminProject[]
  browserStats: {
    totalEntries: number
    categoryDistribution: Array<{ category: string; categoryLabel: string; count: number }>
  } | null
  browserProject: string
  browserCategory: string
  browserSearchInput: string
  selectedIds: Set<string>
  assetHealth: KnowledgeAssetHealthResult | null
  onSelectProject: (value: string) => void
  onSelectCategory: (value: string) => void
  onSearchChange: (value: string) => void
  onPageChange: (page: number) => void
  onToggleSelect: (id: string) => void
  onOpenDetail: (entry: KnowledgeEntry) => void
  onManualAdd: () => void
  onUpload: () => void
  onSmartImport: () => void
  onSupplement: (input: { category: KnowledgeCategory }) => void
}

/**
 * @description 管理端知识「浏览」Tab：五盒健康度 + 知识浏览器
 */
export function AdminKnowledgeBrowseTab(props: AdminKnowledgeBrowseTabProps) {
  const showHealth = Boolean(props.browserProject && props.browserProject !== "unbound" && props.assetHealth)

  return (
    <KnowledgeBrowser
      entries={props.browserEntries}
      total={props.browserTotal}
      loading={props.browserLoading}
      page={props.browserPage}
      pageSize={props.browserPageSize}
      projects={props.projects}
      stats={props.browserStats}
      selectedProject={props.browserProject}
      selectedCategory={props.browserCategory}
      searchValue={props.browserSearchInput}
      selectedIds={props.selectedIds}
      onSelectProject={props.onSelectProject}
      onSelectCategory={props.onSelectCategory}
      onSearchChange={props.onSearchChange}
      onPageChange={props.onPageChange}
      onToggleSelect={props.onToggleSelect}
      onOpenDetail={props.onOpenDetail}
      onManualAdd={props.onManualAdd}
      onUpload={props.onUpload}
      onSmartImport={props.onSmartImport}
      headerSlot={
        showHealth && props.assetHealth ? (
          <KnowledgeBrowserHealthBlock
            health={props.assetHealth}
            onSelectBox={() => {
              props.onSelectCategory("")
              props.onPageChange(1)
            }}
            onSupplement={({ category }) => props.onSupplement({ category })}
          />
        ) : null
      }
    />
  )
}
