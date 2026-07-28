"use client"

import { useState } from "react"
import { Loader2, Plus, Search } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AiResultPanel } from "@/components/workbench/ai-result-panel"
import { buildWechatChannelsProfileUrl } from "@/features/competitor/competitor-url-utils"
import {
  ApiError,
  searchChannelsUsers,
  type SearchChannelsUserResult,
} from "@/lib/api/client"

interface AddAccountPanelProps {
  value: string
  adding: boolean
  accountCount: number
  onChange: (value: string) => void
  onAdd: (url?: string, successMessage?: string) => Promise<void>
}

/**
 * @description competitoraddaccountpanel
 * @param options - 配置选项
 * @returns 无返回值
 */
export function CompetitorAddAccountPanel({ value, adding, accountCount, onChange, onAdd }: AddAccountPanelProps) {
  const full = accountCount >= 10
  const [keyword, setKeyword] = useState("")
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<SearchChannelsUserResult[]>([])
  const [searched, setSearched] = useState(false)
  const [addingFinder, setAddingFinder] = useState<string | null>(null)

  async function handleSearch() {
    const q = keyword.trim()
    if (!q || searching || full) return
    setSearching(true)
    setSearched(true)
    try {
      const data = await searchChannelsUsers(q)
      setResults(data.users.filter((user) => user.finderUsername.trim()))
    } catch (error) {
      setResults([])
      const message =
        error instanceof ApiError && error.details
          ? String((error.details as Record<string, unknown>).error || "")
          : ""
      toast.error(message || (error instanceof Error ? error.message : "搜索视频号失败"))
    } finally {
      setSearching(false)
    }
  }

  async function handleAddChannelsUser(user: SearchChannelsUserResult) {
    if (adding || full || addingFinder) return
    const finder = user.finderUsername.trim()
    if (!finder) {
      toast.error("该结果缺少账号标识，请换一个")
      return
    }
    setAddingFinder(finder)
    try {
      const profileUrl = buildWechatChannelsProfileUrl(finder)
      const label = user.nickname.trim() || "视频号"
      await onAdd(profileUrl, `已添加「${label}」`)
    } catch (error) {
      // onAdd 内部已 toast；这里兜底避免未捕获
      if (error instanceof Error && error.message) {
        toast.error(error.message)
      }
    } finally {
      setAddingFinder(null)
    }
  }

  return (
    <AiResultPanel
      title="添加监控账号"
      icon={<Plus className="h-4 w-4 text-primary" />}
      meta={<span>抖音可粘贴主页链接；视频号常无法复制链接，可直接搜昵称添加</span>}
      flat
    >
      <div className="flex gap-3">
        <Input
          placeholder="抖音主页链接，或已有视频号主页链接"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && void onAdd()}
          disabled={adding || full}
          className="flex-1"
        />
        <Button onClick={() => void onAdd()} disabled={adding || !value.trim() || full}>
          {adding && !addingFinder ? "添加中..." : `添加 (${accountCount}/10)`}
        </Button>
      </div>

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
            disabled={searching || full}
            className="flex-1"
          />
          <Button
            variant="outline"
            onClick={() => void handleSearch()}
            disabled={searching || !keyword.trim() || full}
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
                    disabled={adding || full || Boolean(addingFinder)}
                    onClick={() => void handleAddChannelsUser(user)}
                  >
                    {busy ? "添加中..." : "加入监控"}
                  </Button>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>

      {full ? <p className="mt-2 text-xs text-amber-600">已达到 10 个账号上限</p> : null}
    </AiResultPanel>
  )
}

function formatCount(n: number): string {
  if (n >= 10_000) return `${(n / 10_000).toFixed(1).replace(/\.0$/, "")}万`
  return String(n)
}
