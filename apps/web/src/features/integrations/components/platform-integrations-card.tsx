"use client"

import { useCallback, useEffect, useState } from "react"

import Link from "next/link"

import { ExternalLink, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ApiError, listDouyinBoundAccounts, refreshDouyinBoundAccount, unbindDouyinAccount } from "@/lib/api/client"
import { DouyinBoundAccounts, type BoundDouyinAccount } from "./douyin-bound-accounts"

/**
 * 多平台数据同步卡片。
 * - 用户点「绑定抖音账号」→ 跳 /api/integrations/douyin/auth → 扫码授权
 * - 抖音回调回 Dashboard 时，URL 会带 douyin_ok / douyin_error 参数，
 *   本组件读取并展示「同步成功/失败」的提示，然后刷新已绑账号列表。
 * - 已绑账号支持免扫码「刷新资料」与「解绑」（数据存 AIM 库 DouyinAccountBinding）。
 */
type OkSyncState = {
  nickname?: string
  fans?: string
  videosCount?: string
  larkAccounts?: string
  larkVideos?: string
}

function replaceUrl(sp: URLSearchParams) {
  const q = sp.toString()
  window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}${window.location.hash}`)
}

function readDouyinQueryState(
  setState: (s: OkSyncState | null) => void,
  setErrorMsg: (m: string | null) => void,
): boolean {
  if (typeof window === "undefined") return false
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
    return true
  }
  if (err) {
    try { setErrorMsg(decodeURIComponent(err)) } catch { setErrorMsg(err) }
    keys.forEach((k) => sp.delete(k))
    replaceUrl(sp)
  }
  return false
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

  useEffect(() => {
    readDouyinQueryState(setOkState, setErrorMsg)
  }, [])

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
              扫码绑定短视频账号，资料与作品数据自动同步；绑定关系保存在 AIM，可随时免扫码刷新。
            </CardDescription>
          </div>
          <Badge variant="outline" className="shrink-0">抖音接入中</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <SyncAlerts okState={okState} errorMsg={errorMsg} />
        <SyncActions larkBaseUrl={larkBaseUrl} clearing={clearing} hasAlert={Boolean(okState || errorMsg)} onClear={onClear} onBind={onBind} />
        <BoundAccountsSection />
        <div className="text-xs text-muted-foreground">
          · 支持抖音：粉丝、作品、点赞/评论/播放数据，扫码即同步
          <br />
          · 视频号 / 小红书：待开放平台接入，当前可在飞书里手动导入
        </div>
      </CardContent>
    </Card>
  )
}

function BoundAccountsSection() {
  const [accounts, setAccounts] = useState<BoundDouyinAccount[] | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [accountError, setAccountError] = useState<string | null>(null)

  const reloadAccounts = useCallback(async () => {
    try {
      setAccounts(await listDouyinBoundAccounts())
      setAccountError(null)
    } catch (error) {
      setAccountError(error instanceof ApiError ? error.message : "已绑账号加载失败")
    }
  }, [])

  useEffect(() => {
    void reloadAccounts()
  }, [reloadAccounts])

  async function onRefresh(id: string) {
    setPendingId(id)
    setAccountError(null)
    try {
      await refreshDouyinBoundAccount(id)
      await reloadAccounts()
    } catch (error) {
      setAccountError(error instanceof ApiError ? error.message : "刷新失败，请稍后重试")
    } finally {
      setPendingId(null)
    }
  }

  async function onRemove(id: string) {
    setPendingId(`remove:${id}`)
    setAccountError(null)
    try {
      await unbindDouyinAccount(id)
      await reloadAccounts()
    } catch (error) {
      setAccountError(error instanceof ApiError ? error.message : "解绑失败，请稍后重试")
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="space-y-2">
      {accounts === null ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" /> 正在加载已绑账号…
        </div>
      ) : (
        <DouyinBoundAccounts accounts={accounts} pendingId={pendingId} onRefresh={onRefresh} onRemove={onRemove} />
      )}
      {accountError ? <p className="text-xs text-destructive">{accountError}</p> : null}
    </div>
  )
}
