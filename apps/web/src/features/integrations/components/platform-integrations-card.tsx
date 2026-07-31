"use client"

import { useEffect, useState } from "react"

import Link from "next/link"

import { ExternalLink, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

/**
 * 多平台数据同步卡片。
 * - 用户点「绑定抖音账号」→ 跳 /api/integrations/douyin/auth → 扫码授权
 * - 抖音回调回 Dashboard 时，URL 会带 douyin_ok / douyin_error 参数，
 *   本组件读取并展示「同步成功/失败」的提示。
 * - 数据看板不在 AIM 网页展示，直接给一个跳转到飞书仪表盘的链接。
 */
type OkSyncState = {
  nickname?: string
  fans?: string
  videosCount?: string
  larkAccounts?: string
  larkVideos?: string
}

function readDouyinQueryState(
  setState: (s: OkSyncState | null) => void,
  setErrorMsg: (m: string | null) => void,
) {
  if (typeof window === "undefined") return
  const sp = new URLSearchParams(window.location.search)
  const ok = sp.get("douyin_ok")
  const err = sp.get("douyin_error")
  const keys = ["douyin_ok", "nickname", "fans", "videos_count", "lark_accounts", "lark_videos", "douyin_error"]
  if (ok === "1") {
    setState({
      nickname: sp.get("nickname") ? decodeURIComponent(sp.get("nickname")!) : undefined,
      fans: sp.get("fans") || undefined,
      videosCount: sp.get("videos_count") || undefined,
      larkAccounts: sp.get("lark_accounts") || undefined,
      larkVideos: sp.get("lark_videos") || undefined,
    })
    keys.forEach((k) => sp.delete(k))
    replaceUrl(sp)
  } else if (err) {
    try { setErrorMsg(decodeURIComponent(err)) } catch { setErrorMsg(err) }
    keys.forEach((k) => sp.delete(k))
    replaceUrl(sp)
  }
}

function replaceUrl(sp: URLSearchParams) {
  const q = sp.toString()
  window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}${window.location.hash}`)
}

function SyncAlerts(props: { okState: OkSyncState | null; errorMsg: string | null }) {
  const { okState, errorMsg } = props
  return (
    <>
      {okState ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm">
          <div className="font-medium text-emerald-700 dark:text-emerald-400">
            {okState.nickname ? `已同步：${okState.nickname}` : "抖音账号同步成功"}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            粉丝 {okState.fans ?? "—"} · 拉取视频 {okState.videosCount ?? 0} 条
            {okState.larkAccounts ? ` · 飞书账号表写入 ${okState.larkAccounts}` : ""}
            {okState.larkVideos ? ` · 飞书视频表写入 ${okState.larkVideos}` : ""}
          </div>
        </div>
      ) : null}
      {errorMsg ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm">
          <div className="font-medium text-destructive">抖音同步失败</div>
          <div className="mt-1 text-xs text-muted-foreground">{errorMsg}</div>
        </div>
      ) : null}
    </>
  )
}

function SyncActions(props: {
  larkBaseUrl?: string | null
  clearing: boolean
  hasAlert: boolean
  onClear: () => void
  onBind: () => void
}) {
  const { larkBaseUrl, clearing, hasAlert, onClear, onBind } = props
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={onBind}>绑定抖音账号</Button>
      {larkBaseUrl ? (
        <Button variant="outline" nativeButton={false}
          render={<Link href={larkBaseUrl} target="_blank" rel="noreferrer" />}>
          去飞书看仪表盘 <ExternalLink className="ml-1 h-3.5 w-3.5" />
        </Button>
      ) : null}
      {hasAlert ? (
        <Button variant="ghost" size="sm" disabled={clearing} onClick={onClear}>
          {clearing ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          清除提示
        </Button>
      ) : null}
    </div>
  )
}

export function PlatformIntegrationsCard({ larkBaseUrl }: { larkBaseUrl?: string | null }) {
  const [okState, setOkState] = useState<OkSyncState | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)
  useEffect(() => readDouyinQueryState(setOkState, setErrorMsg), [])
  const hasAlert = Boolean(okState || errorMsg)

  function onBind() { setOkState(null); setErrorMsg(null); window.location.href = "/api/integrations/douyin/auth" }
  function onClear() {
    setClearing(true)
    setTimeout(() => { setOkState(null); setErrorMsg(null); setClearing(false) }, 200)
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold">多平台数据同步</CardTitle>
            <CardDescription className="mt-1">
              扫码绑定短视频账号，数据自动同步到飞书多维表格，在飞书里看仪表盘。
            </CardDescription>
          </div>
          <Badge variant="outline" className="shrink-0">抖音接入中</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <SyncAlerts okState={okState} errorMsg={errorMsg} />
        <SyncActions larkBaseUrl={larkBaseUrl} clearing={clearing} hasAlert={hasAlert} onClear={onClear} onBind={onBind} />
        <div className="text-xs text-muted-foreground">
          · 支持抖音：粉丝、作品、点赞/评论/播放数据，扫码即同步
          <br />
          · 视频号 / 小红书：待开放平台接入，当前可在飞书里手动导入
        </div>
      </CardContent>
    </Card>
  )
}
