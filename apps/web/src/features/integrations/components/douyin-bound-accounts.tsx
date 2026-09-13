"use client"

import React from "react"
import { Link2, Loader2, RefreshCw, Unlink } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

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
  /** WP-A1：作品数据通道定位账号所需；为空表示尚未采集主页链接 */
  secUserId?: string | null
  profileUrl?: string | null
}

/** 作品数据通道以 sec_user_id 定位账号（抖音官方作品列表能力已下线），故需一次性采集主页链接。 */
function ProfileUrlDialog(props: {
  account: BoundDouyinAccount
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [value, setValue] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  async function submit() {
    const url = value.trim()
    if (!url) {
      toast.error("请粘贴抖音主页链接")
      return
    }
    setSaving(true)
    try {
      const response = await fetch(`/api/integrations/douyin/accounts/${props.account.id}/profile-url`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profileUrl: url }),
      })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) throw new Error(payload?.error ?? `保存失败 (${response.status})`)
      toast.success("主页链接已保存，作品数据下次同步即可取数")
      props.onOpenChange(false)
      setValue("")
      props.onSaved()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>补充抖音主页链接</DialogTitle>
          <DialogDescription>
            抖音官方的「授权账号作品列表」能力已下线，作品数据改由公开数据通道获取，需要该账号的主页链接来定位。
            打开抖音 App → 你的主页 → 分享 → 复制链接，粘贴到下方即可（只需一次）。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="douyin-profile-url">主页链接</Label>
          <Input
            id="douyin-profile-url"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="https://v.douyin.com/xxxxxx/"
            disabled={saving}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
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
  onFillProfileUrl: () => void
}) {
  const { account } = props
  const badge = statusBadge(account.syncStatus)
  const worksReady = Boolean(account.secUserId)

  return (
    <div className="rounded-md border">
      <div className="flex items-center gap-3 px-3 py-2.5">
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
      {worksReady ? (
        <p className="border-t px-3 py-1.5 text-xs text-muted-foreground">
          作品数据通道已就绪（已采集主页链接），作品与效果数据每日自动同步。
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2">
          <span className="text-xs text-amber-600 dark:text-amber-400">
            尚未采集主页链接：作品数据无法取数（抖音官方作品列表能力已下线，改由公开数据通道获取）。
          </span>
          <Button variant="outline" size="sm" className="cursor-pointer" onClick={props.onFillProfileUrl}>
            <Link2 className="size-3.5" />
            补充主页链接
          </Button>
        </div>
      )}
    </div>
  )
}

export function DouyinBoundAccounts(props: {
  accounts: BoundDouyinAccount[]
  pendingId: string | null
  onRefresh: (id: string) => void
  onRemove: (id: string) => void
  onProfileUrlSaved?: () => void
}) {
  const [dialogAccount, setDialogAccount] = React.useState<BoundDouyinAccount | null>(null)

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
          onFillProfileUrl={() => setDialogAccount(account)}
        />
      ))}
      {dialogAccount ? (
        <ProfileUrlDialog
          account={dialogAccount}
          open
          onOpenChange={(open) => {
            if (!open) setDialogAccount(null)
          }}
          onSaved={() => props.onProfileUrlSaved?.()}
        />
      ) : null}
    </div>
  )
}
