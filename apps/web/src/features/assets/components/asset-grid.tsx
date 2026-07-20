import Image from "next/image";
import { Clock, Image as ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  assetFilters,
  assetTypeConfig,
  formatDate,
  type AssetFilter,
} from "@/features/assets/asset-page-shared";
import type { ApiAsset } from "@/types/api";

/**
 * @description assetgrid
 * @param options - 配置选项
 * @returns 无返回值
 */
export function AssetGrid({
  assets,
  filter,
}: {
  assets: ApiAsset[];
  filter: AssetFilter;
}) {
  const filteredAssets =
    filter === "all"
      ? assets
      : assets.filter((asset) => asset.assetType === filter);

  if (filteredAssets.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <ImageIcon className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-muted-foreground">
            {filter === "all"
              ? "还没有素材，上传一个吧！"
              : `没有${assetFilters.find((item) => item.value === filter)?.label ?? ""}类型的素材`}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {filteredAssets.map((asset) => {
        const typeConfig = assetTypeConfig[asset.assetType];
        const TypeIcon = typeConfig?.icon ?? ImageIcon;
        return (
          <Card
            key={asset.id}
            className="overflow-hidden transition-colors duration-200 hover:bg-muted/50 cursor-pointer"
          >
            <div className="relative aspect-video bg-muted overflow-hidden">
              {asset.assetType === "image" && asset.url ? (
                <Image
                  src={asset.url}
                  alt={asset.name}
                  fill
                  unoptimized
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <TypeIcon className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
            </div>

            <CardContent className="pt-3 space-y-1.5">
              <p className="text-sm font-medium truncate">{asset.name}</p>
              <div className="flex items-center justify-between">
                <Badge variant="secondary" className="text-xs">
                  {typeConfig?.label ?? asset.assetType}
                </Badge>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>{formatDate(asset.createdAt)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
