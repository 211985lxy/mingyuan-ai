"use client"

import { useCallback, useEffect, useState } from "react"

import Link from "next/link"

import { ExternalLink, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ApiError, listDouyinBoundAccounts, refreshDouyinBoundAccount, unbindDouyinAccount } from "@/lib/api/client"
import { DouyinBoundAccounts, type BoundDouyinAccount } from "./douyin-bound-accounts"
import { DouyinSyncAlert, useDouyinSyncAlert } from "./douyin-sync-alert"

/**
 * 多平台数据同步卡片。
 * - 用户点「绑定抖音账号」→ 跳 /api/integrations/douyin/auth?return=<本页> → 扫码授权
 * - 回调按 return 回跳本页，URL 带 douyin_ok / douyin_error，由共享 hook 消费展示
 * - 已绑账号支持免扫码「刷新资料」与「解绑」（数据存 AIM 库 DouyinAccountBinding）。
 */

function SyncActions(props: {
  larkBaseUrl?: string | null
  hasAlert: boolean
  onClear: () => void
  onBind: () => void
}) {
  const { larkBaseUrl, hasAlert, onClear, onBind } = props
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
        <Button variant="ghost" size="sm" onClick={onClear}>
          清除提示
        </Button>
      ) : null}
    </div>
  )
}

export function PlatformIntegrationsCard({ larkBaseUrl }: { larkBaseUrl?: string | null }) {
  const { okState, errorMsg, clear, hasAlert } = useDouyinSyncAlert()

  function onBind() {
    clear()
    // 带上本页路径：回调据此回跳，提示才落在发起页
    const returnTo = typeof window === "undefined" ? "/account" : window.location.pathname
    window.location.href = `/api/integrations/douyin/auth?return=${encodeURIComponent(returnTo)}`
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
        <DouyinSyncAlert okState={okState} errorMsg={errorMsg} />
        <SyncActions larkBaseUrl={larkBaseUrl} hasAlert={hasAlert} onClear={clear} onBind={onBind} />
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
        <DouyinBoundAccounts
          accounts={accounts}
          pendingId={pendingId}
          onRefresh={onRefresh}
          onRemove={onRemove}
          onProfileUrlSaved={() => {
            void reloadAccounts()
          }}
        />
      )}
      {accountError ? <p className="text-xs text-destructive">{accountError}</p> : null}
    </div>
  )
}
