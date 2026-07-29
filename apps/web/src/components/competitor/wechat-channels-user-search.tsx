"use client"

import { Loader2, Plus, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { isCompetitorAccountLinkInput } from "@/features/competitor/competitor-url-utils"
import { useWechatChannelsUserSearch } from "@/features/competitor/hooks/use-wechat-channels-user-search"
import type { SearchChannelsUserResult } from "@/lib/api/client"

interface WechatChannelsUserSearchProps {
  value: string
  accountCount: number
  disabled?: boolean
  adding: boolean
  onChange: (value: string) => void
  onAdd: (url?: string, successMessage?: string) => Promise<void>
}

export function WechatChannelsUserSearch({
  value,
  accountCount,
  disabled = false,
  adding,
  onChange,
  onAdd,
}: WechatChannelsUserSearchProps) {
  const {
    searching,
    results,
    searched,
    addingFinder,
    handleSearch,
    handleAddChannelsUser,
  } = useWechatChannelsUserSearch({ keyword: value, disabled, adding, onAdd })
  const linkInput = isCompetitorAccountLinkInput(value)
  const busy = adding || searching

  function handleSubmit() {
    if (linkInput) {
      void onAdd()
      return
    }
    void handleSearch()
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <Input
          placeholder="输入账号昵称，或粘贴抖音 / 视频号主页链接"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && handleSubmit()}
          disabled={busy || disabled}
          className="flex-1"
        />
        <Button
          onClick={handleSubmit}
          disabled={busy || !value.trim() || disabled}
        >
          {searching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : linkInput ? (
            <Plus className="h-4 w-4" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          {searching
            ? "搜索中..."
            : adding
              ? "添加中..."
              : linkInput
                ? `添加 (${accountCount}/10)`
                : "搜视频号"}
        </Button>
      </div>

      {!linkInput && searched && !searching && results.length === 0 ? (
        <p className="rounded-lg bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
          没搜到可添加的账号。可换更完整的昵称再试。
        </p>
      ) : null}

      {!linkInput && results.length > 0 ? (
        <ChannelsUserResultList
          results={results}
          adding={adding}
          addingFinder={addingFinder}
          disabled={disabled}
          onAdd={handleAddChannelsUser}
        />
      ) : null}
    </div>
  )
}

function ChannelsUserResultList({
  results,
  adding,
  addingFinder,
  disabled,
  onAdd,
}: {
  results: SearchChannelsUserResult[]
  adding: boolean
  addingFinder: string | null
  disabled: boolean
  onAdd: (user: SearchChannelsUserResult) => void
}) {
  return (
    <ul className="space-y-2">
      {results.slice(0, 8).map((user) => {
        const busy = addingFinder === user.finderUsername
        return (
          <li
            key={user.finderUsername}
            className="flex items-center gap-3 rounded-lg border border-border/70 px-3 py-2"
          >
            {user.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatar} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">
                号
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {user.nickname || "未命名视频号"}
                {user.isVerified ? (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">已认证</span>
                ) : null}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user.signature || "暂无简介"}
                {user.followerCount > 0 ? ` · ${formatCount(user.followerCount)} 粉丝` : ""}
              </p>
            </div>
            <Button
              size="sm"
              className="shrink-0"
              disabled={adding || disabled || Boolean(addingFinder)}
              onClick={() => onAdd(user)}
            >
              {busy ? "添加中..." : "加入监控"}
            </Button>
          </li>
        )
      })}
    </ul>
  )
}

function formatCount(n: number): string {
  if (n >= 10_000) return `${(n / 10_000).toFixed(1).replace(/\.0$/, "")}万`
  return String(n)
}
