"use client"

import { KnowledgeAssetHealthPanel } from "@/components/admin/knowledge-asset-health-panel"
import type { AssetBoxId, KnowledgeAssetHealthResult } from "@/lib/knowledge-asset-health"
import type { KnowledgeCategory } from "@/lib/knowledge-categories"

export interface KnowledgeBrowserHealthBlockProps {
  health: KnowledgeAssetHealthResult
  onSelectBox: (boxId: AssetBoxId) => void
  onSupplement: (input: {
    boxId: AssetBoxId
    category: KnowledgeCategory
    prompts: string[]
  }) => void
}

/**
 * @description 知识浏览页顶部五盒健康度区块（拆出以满足体积护栏）
 */
export function KnowledgeBrowserHealthBlock({
  health,
  onSelectBox,
  onSupplement,
}: KnowledgeBrowserHealthBlockProps) {
  return (
    <KnowledgeAssetHealthPanel
      health={health}
      onSelectBox={(box) => onSelectBox(box.id)}
      onSupplement={onSupplement}
    />
  )
}
