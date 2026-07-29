"use client"

import { Plus } from "lucide-react"

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
      meta={<span>输入账号昵称或主页链接，系统会自动识别并添加</span>}
      flat
    >
      <WechatChannelsUserSearch
        value={value}
        accountCount={accountCount}
        disabled={full}
        adding={adding}
        onChange={onChange}
        onAdd={onAdd}
      />

      {full ? <p className="mt-2 text-xs text-amber-600">已达到 10 个账号上限</p> : null}
    </AiResultPanel>
  )
}
