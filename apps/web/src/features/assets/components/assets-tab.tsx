import { useState } from "react"
import { Button } from "@/components/ui/button"
import { AssetGrid } from "@/features/assets/components/asset-grid"
import { AssetUploadDialog } from "@/features/assets/components/asset-upload-dialog"
import { AssetsSkeleton } from "@/features/assets/components/page-sections"
import { assetFilters, type AssetFilter } from "@/features/assets/asset-page-shared"
import type { ApiAsset } from "@/types/api"

/**
 * @description assetstab
 * @param options - 配置选项
 * @returns 无返回值
 */
export function AssetsTab({
  assets,
  loading,
  onRefresh,
}: {
  assets: ApiAsset[]
  loading: boolean
  onRefresh: () => void
}) {
  const [filter, setFilter] = useState<AssetFilter>("all")
  if (loading) return <AssetsSkeleton />

  return (
    <section className="space-y-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          {assetFilters.map((item) => (
            <Button
              key={item.value}
              variant={filter === item.value ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(item.value)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <AssetUploadDialog onUploaded={onRefresh} />
      </div>
      <AssetGrid assets={assets} filter={filter} />
    </section>
  )
}
