"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { AssetsTab } from "@/features/assets/components/assets-tab";
import { AssetFlowOverview } from "@/features/assets/components/page-sections";
import { listAssets } from "@/lib/api/client";
import type { ApiAsset } from "@/types/api";

export default function AssetsPage() {
  const [assets, setAssets] = useState<ApiAsset[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    try {
      setAssets(await listAssets());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "资产加载失败，请重试");
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(fetchAssets);
  }, [fetchAssets]);

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">AIM 资产库</h1>
          <Badge variant="outline" className="text-[10px] sm:text-xs">
            企业营销资产沉淀
          </Badge>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          这里不是单纯上传文件，而是把企业资料、案例素材和客户反馈沉淀成创作页可调用的证据库。
        </p>
        <AssetFlowOverview assetCount={assets.length} />
      </div>

      <AssetsTab
        assets={assets}
        loading={loading}
        onRefresh={fetchAssets}
      />
    </div>
  );
}
