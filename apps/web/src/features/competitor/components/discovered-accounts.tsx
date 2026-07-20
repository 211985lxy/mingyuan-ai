import { User } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { formatCount } from "@/features/competitor/presentation"
import { extractPureUrl } from "@/lib/tikhub/url-parser"
import { buildProxyImageUrl } from "@/lib/proxy-image-client"
import type { SimilarAccount, WatchAccount } from "@/lib/api/client"

/**
 * @description discoveredaccountgroup
 * @param options - 配置选项
 * @returns 无返回值
 */
export function DiscoveredAccountGroup({
  title,
  description,
  items,
  accounts,
  ignoredUrls,
  adding,
  onAdd,
  onIgnore,
}: {
  title: string
  description: string
  items: SimilarAccount[]
  accounts: WatchAccount[]
  ignoredUrls: Set<string>
  adding: boolean
  onAdd: (account: SimilarAccount) => void
  onIgnore: (key: string) => void
}) {
  const visible = items.filter((account) => !ignoredUrls.has(account.targetUrl || account.platformUserId || account.nickname))
  if (visible.length === 0) return null

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {visible.map((account) => {
          const key = account.targetUrl || account.platformUserId || account.nickname
          const pureUrl = account.targetUrl ? extractPureUrl(account.targetUrl) || account.targetUrl : ""
          const monitored = Boolean(account.targetUrl) && accounts.some((item) => item.targetUrl === pureUrl || item.platformUserId === account.platformUserId)
          const canAdd = Boolean(account.targetUrl) && !monitored && accounts.length < 10
          return (
            <Card key={key} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {account.avatar ? (
                    <img src={buildProxyImageUrl(account.avatar)} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted"><User className="h-5 w-5 text-muted-foreground" /></div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><p className="truncate text-sm font-semibold">{account.nickname || "未知账号"}</p>{monitored ? <Badge variant="secondary">已监控</Badge> : null}</div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {account.followerCount ? `${formatCount(account.followerCount)} 粉丝` : "粉丝数未提供"}
                      {account.redfoxScore != null ? ` · 红狐指数 ${account.redfoxScore}` : ""}
                    </p>
                  </div>
                </div>
                {account.reason ? <p className="mt-3 line-clamp-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs leading-5 text-muted-foreground">{account.reason}</p> : null}
                {account.recentVideos.length > 0 ? (
                  <div className="mt-3 space-y-1.5">
                    {account.recentVideos.map((video, index) => (
                      <a key={`${video.videoUrl}-${index}`} href={video.videoUrl || account.targetUrl} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-muted-foreground hover:text-foreground">
                        {video.title} · 赞 {formatCount(video.likes)} · 评 {formatCount(video.comments)}
                      </a>
                    ))}
                  </div>
                ) : null}
                <div className="mt-3 flex gap-2">
                  <Button size="sm" className="h-8 flex-1 text-xs" disabled={!canAdd || adding} onClick={() => onAdd(account)}>
                    {monitored ? "已监控" : accounts.length >= 10 ? "账号池已满" : account.targetUrl ? "加入监控" : "无法加入"}
                  </Button>
                  {account.targetUrl ? <a href={account.targetUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center justify-center rounded-md border px-3 text-xs font-medium transition-colors hover:bg-muted">打开主页</a> : null}
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => onIgnore(key)}>忽略</Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
