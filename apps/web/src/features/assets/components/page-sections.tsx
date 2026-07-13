import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ASSET_FLOW_CARDS } from "@/features/assets/asset-page-shared";

export function AssetFlowOverview({
  assetCount,
  voiceCount,
}: {
  assetCount: number;
  voiceCount: number;
}) {
  return (
    <Card className="border-primary/15 bg-primary/[0.02]">
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4">
          {ASSET_FLOW_CARDS.map((item, index) => (
            <div key={item.title} className="rounded-md border bg-background px-3 py-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                  {index + 1}
                </span>
                <p className="text-sm font-medium">{item.title}</p>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">已沉淀素材 {assetCount}</Badge>
          <Badge variant="secondary">可用声音 {voiceCount}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

export function AssetsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-14" />
          ))}
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <Skeleton className="aspect-video w-full" />
            <CardContent className="pt-3 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <div className="flex justify-between">
                <Skeleton className="h-5 w-10" />
                <Skeleton className="h-3 w-20" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
