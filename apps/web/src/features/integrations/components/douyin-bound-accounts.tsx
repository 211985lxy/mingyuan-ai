"use client"

import React from "react"
import { Loader2, RefreshCw, Unlink } from "lucide-react"

import { Button } from "@/components/ui/button"

export type BoundDouyinAccount = {
  id: string
  openId: string
  profile: {
    nickname: string
    avatar: string
    followers?: number | null
    awemeCount?: number | null
    totalFavorited?: number | null
    signature?: string | null
  } | null
  syncStatus: string
  lastSyncedAt: string | null
  accessExpiresAt: string
}

function formatCount(n?: number | null) {
  return typeof n === "number" ? n.toLocaleString("zh-CN") : "—"
}

function statusBadge(status: string) {
  if (status === "ok") return { text: "正常", className: "text-emerald-600 dark:text-emerald-400" }
  if (status === "expired") return { text: "授权过期，需重新扫码", className: "text-destructive" }
  return { text: "同步异常", className: "text-amber-600 dark:text-amber-400" }
}

function BoundAccountRow(props: {
  account: BoundDouyinAccount
  refreshing: boolean
  removing: boolean
  onRefresh: () => void
  onRemove: () => void
}) {
  const { account } = props
  const badge = statusBadge(account.syncStatus)

  return (
    <div className="flex items-center gap-3 rounded-md border px-3 py-2.5">
      {account.profile?.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={account.profile.avatar} alt="" className="size-9 shrink-0 rounded-full object-cover" />
      ) : (
        <div className="size-9 shrink-0 rounded-full bg-muted" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{account.profile?.nickname || "抖音用户"}</span>
          <span className={`shrink-0 text-xs ${badge.className}`}>{badge.text}</span>
        </div>
        <div className="truncate text-xs text-muted-foreground">
          粉丝 {formatCount(account.profile?.followers)} · 作品 {formatCount(account.profile?.awemeCount)} ·
          获赞 {formatCount(account.profile?.totalFavorited)}
          {account.lastSyncedAt
            ? ` · 更新于 ${new Date(account.lastSyncedAt).toLocaleString("zh-CN", { hour12: false })}`
            : ""}
        </div>
      </div>
      <Button variant="ghost" size="icon" className="size-8 shrink-0 cursor-pointer" disabled={props.refreshing} onClick={props.onRefresh} title="刷新资料">
        {props.refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
      </Button>
      <Button variant="ghost" size="icon" className="size-8 shrink-0 cursor-pointer text-muted-foreground" disabled={props.removing} onClick={props.onRemove} title="解绑">
        {props.removing ? <Loader2 className="size-4 animate-spin" /> : <Unlink className="size-4" />}
      </Button>
    </div>
  )
}

export function DouyinBoundAccounts(props: {
  accounts: BoundDouyinAccount[]
  pendingId: string | null
  onRefresh: (id: string) => void
  onRemove: (id: string) => void
}) {
  if (props.accounts.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">尚未绑定抖音账号，点击上方按钮扫码绑定。</p>
    )
  }
  return (
    <div className="space-y-2">
      {props.accounts.map((account) => (
        <BoundAccountRow
          key={account.id}
          account={account}
          refreshing={props.pendingId === account.id}
          removing={props.pendingId === `remove:${account.id}`}
          onRefresh={() => props.onRefresh(account.id)}
          onRemove={() => props.onRemove(account.id)}
        />
      ))}
    </div>
  )
}
