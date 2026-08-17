"use client"

import Link from "next/link"
import { Sparkles } from "lucide-react"

import { listVisibleAimAgents } from "@/lib/aim-ui-config"

/**
 * 极简版首页：AIM 大脑选择器（对照群响 AI 大脑形态）。
 * 主脑大卡 + 专家卡片网格，点击进入对应对话。
 */
export default function LitePickerPage() {
  const experts = listVisibleAimAgents()

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
      <div className="space-y-2 text-center">
        <p className="text-xs font-medium text-primary">明动 AIM · 极简版</p>
        <h1 className="text-2xl font-semibold tracking-tight">AIM 大脑</h1>
        <p className="text-sm text-muted-foreground">选一个大脑开始，问什么都行</p>
      </div>

      {/* 默认主脑：通用对话 */}
      <Link
        href="/lite/chat"
        className="mt-8 flex cursor-pointer items-center gap-4 rounded-2xl border bg-card p-5 shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/[0.03]"
      >
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
          <Sparkles className="size-7" />
        </span>
        <span className="min-w-0">
          <span className="block text-base font-semibold">明远 AIM · 通用大脑</span>
          <span className="mt-1 block text-sm text-muted-foreground">
            通用问答、写作、修改和一次性任务
          </span>
        </span>
      </Link>

      {/* 专家大脑卡片：与完整版侧栏同一配置源 */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {experts.map((agent) => (
          <Link
            key={agent.id}
            href={`/lite/chat?agent=${encodeURIComponent(agent.id)}`}
            className="flex cursor-pointer items-start gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-primary/[0.03]"
          >
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <agent.icon className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{agent.title}</span>
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                {agent.description}
              </span>
            </span>
          </Link>
        ))}
      </div>

      <p className="mt-10 text-center text-[11px] text-muted-foreground/70">
        需要选题、发布、数据复盘等完整工作台？
        <a href="/home" className="ml-1 text-primary hover:underline">前往完整版</a>
      </p>
    </div>
  )
}
