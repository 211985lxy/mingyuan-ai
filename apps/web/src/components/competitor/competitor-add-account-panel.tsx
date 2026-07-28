"use client"

import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AiResultPanel } from "@/components/workbench/ai-result-panel"
import { WechatChannelsUserSearch } from "@/components/competitor/wechat-channels-user-search"

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
          {adding ? "添加中..." : `添加 (${accountCount}/10)`}
        </Button>
      </div>

      <WechatChannelsUserSearch disabled={full} adding={adding} onAdd={onAdd} />

      {full ? <p className="mt-2 text-xs text-amber-600">已达到 10 个账号上限</p> : null}
    </AiResultPanel>
  )
}
