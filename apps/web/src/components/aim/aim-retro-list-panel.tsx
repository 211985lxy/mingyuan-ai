"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { AimRetroListItemCard } from "@/components/aim/aim-retro-list-item-card"
import { Button } from "@/components/ui/button"
import { listAimRetroItems, type AimRetroListItem } from "@/lib/api/projects"

export function AimRetroListPanel(props: {
  projectId?: string
  selectedId: string | null
  onSelect: (id: string) => void
  onStartRetro: (id: string) => void
}) {
  const [items, setItems] = useState<AimRetroListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const result = await listAimRetroItems({ projectId: props.projectId, limit: 30 })
      setItems(result.items)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "复盘列表加载失败")
    } finally {
      setLoading(false)
    }
  }, [props.projectId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <div className="rounded-xl border border-border/70 bg-card/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">复盘列表</p>
          <p className="text-xs text-muted-foreground">先选中一条内容，再粘贴发布数据或开始复盘</p>
        </div>
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void refresh()} disabled={loading}>
          {loading ? "加载中…" : "刷新"}
        </Button>
      </div>
      {items.length === 0 && !loading ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          还没有已发布或已登记数据的内容。先在作品编辑里登记发布，或从历史成稿推进到已发布。
        </p>
      ) : (
        <ul className="max-h-72 space-y-2 overflow-y-auto">
          {items.map((item) => (
            <AimRetroListItemCard
              key={item.id}
              item={item}
              selected={props.selectedId === item.id}
              expanded={expandedId === item.id}
              onSelect={() => props.onSelect(item.id)}
              onStartRetro={() => props.onStartRetro(item.id)}
              onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
