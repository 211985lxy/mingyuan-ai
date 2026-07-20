import Link from "next/link"
import { Bell, ExternalLink } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

/**
 * @description competitorworkbenchlinks
 * @returns 无返回值
 */
export function CompetitorWorkbenchLinks() {
  return (
    <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
      <Card className="border-primary/40 bg-primary/[0.03] ring-1 ring-primary/20">
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <div>
            <p className="font-semibold text-foreground">优质账号分析</p>
            <p className="mt-1 text-xs text-muted-foreground">监控优质账号，刷新作品池和爆款作品。</p>
          </div>
          <Badge>当前</Badge>
        </CardContent>
      </Card>

      <Link href="/video-copy" className="block">
        <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/40">
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div>
              <p className="font-semibold text-foreground">爆款文案拆解</p>
              <p className="mt-1 text-xs text-muted-foreground">粘贴视频链接，提取文案并做结构化分析。</p>
            </div>
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

      <Link href="/ai-hot" className="block">
        <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/40">
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div>
              <p className="font-semibold text-foreground">全网热点洞察</p>
              <p className="mt-1 text-xs text-muted-foreground">去那里查看 AIHOT 精选、全网热榜洞察和当天线索。</p>
            </div>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>
    </div>
  )
}
