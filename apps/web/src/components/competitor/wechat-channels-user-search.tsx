"use client"

import { Loader2, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useWechatChannelsUserSearch } from "@/features/competitor/hooks/use-wechat-channels-user-search"
import type { SearchChannelsUserResult } from "@/lib/api/client"

interface WechatChannelsUserSearchProps {
  disabled?: boolean
  adding: boolean
  onAdd: (url: string, successMessage?: string) => Promise<void>
}

export function WechatChannelsUserSearch({
  disabled = false,
  adding,
  onAdd,
}: WechatChannelsUserSearchProps) {
  const {
    keyword,
    setKeyword,
    searching,
    results,
    searched,
    addingFinder,
    handleSearch,
    handleAddChannelsUser,
  } = useWechatChannelsUserSearch({ disabled, adding, onAdd })

  return (
    <div className="mt-4 space-y-3 border-t border-border/60 pt-4">
      <p className="text-xs text-muted-foreground">
        视频号：输入昵称或关键词搜索，点「加入监控」即可，不必复制主页链接。
      </p>
      <div className="flex gap-3">
        <Input
          placeholder="视频号昵称 / 关键词，如：人民日报"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && void handleSearch()}
          disabled={searching || disabled}
          className="flex-1"
        />
        <Button
          variant="outline"
          onClick={() => void handleSearch()}
          disabled={searching || !keyword.trim() || disabled}
        >
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {searching ? "搜索中..." : "搜视频号"}
        </Button>
      </div>

      {searched && !searching && results.length === 0 ? (
        <p className="rounded-lg bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
          没搜到可添加的账号。可换更完整的昵称再试。
        </p>
      ) : null}

      {results.length > 0 ? (
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
