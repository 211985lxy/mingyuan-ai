"use client"

import { User } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { formatCompetitorCount } from "@/lib/competitor/display"
import { buildProxyImageUrl } from "@/lib/proxy-image-client"
import type { SimilarAccount } from "@/lib/api/client"

function RecentAccountVideos({ account }: { account: SimilarAccount }) {
  if (account.recentVideos.length === 0) return null
  return (
    <div className="mt-3 space-y-1.5">
      {account.recentVideos.map((video, index) => (
        <a
          key={`${video.videoUrl}-${index}`}
          href={video.videoUrl || account.targetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-xs text-muted-foreground hover:text-foreground"
        >
          {video.title} · 赞 {formatCompetitorCount(video.likes)} · 评 {formatCompetitorCount(video.comments)}
        </a>
      ))}
    </div>
  )
}

interface DiscoveredAccountCardProps {
  account: SimilarAccount
  monitored: boolean
  canAdd: boolean
  adding: boolean
  poolFull: boolean
  onAdd: () => void
  onIgnore: () => void
}

export function DiscoveredAccountCard({
  account,
  monitored,
  canAdd,
  adding,
  poolFull,
  onAdd,
  onIgnore,
}: DiscoveredAccountCardProps) {
  const addLabel = monitored ? "已监控" : poolFull ? "账号池已满" : account.targetUrl ? "加入监控" : "无法加入"
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {account.avatar ? (
            <img src={buildProxyImageUrl(account.avatar)} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
              <User className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold">{account.nickname || "未知账号"}</p>
              {monitored ? <Badge variant="secondary">已监控</Badge> : null}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {account.followerCount ? `${formatCompetitorCount(account.followerCount)} 粉丝` : "粉丝数未提供"}
              {account.redfoxScore != null ? ` · 红狐指数 ${account.redfoxScore}` : ""}
            </p>
          </div>
        </div>
        {account.reason ? (
          <p className="mt-3 line-clamp-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs leading-5 text-muted-foreground">
            {account.reason}
          </p>
        ) : null}
        <RecentAccountVideos account={account} />
        <div className="mt-3 flex gap-2">
          <Button size="sm" className="h-8 flex-1 text-xs" disabled={!canAdd || adding} onClick={onAdd}>
            {addLabel}
          </Button>
          {account.targetUrl ? (
            <a
              href={account.targetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center justify-center rounded-md border px-3 text-xs font-medium transition-colors hover:bg-muted"
            >
              打开主页
            </a>
          ) : null}
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onIgnore}>忽略</Button>
        </div>
      </CardContent>
    </Card>
  )
}
