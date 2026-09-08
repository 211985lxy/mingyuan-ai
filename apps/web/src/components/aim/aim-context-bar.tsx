"use client"

import { useState, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

/** 工作台顶部上下文条：把 IP 档案、本周进展等信息条折叠成一行摘要，点击展开。 */
export function AimContextBar(props: {
  summary: string
  defaultExpanded?: boolean
  children: ReactNode
}) {
  const [expanded, setExpanded] = useState(Boolean(props.defaultExpanded))
  return (
    <div className="shrink-0 border-b border-border/50">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:text-foreground sm:px-5"
      >
        <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", expanded && "rotate-180")} aria-hidden />
        <span className="min-w-0 flex-1 truncate">{props.summary}</span>
      </button>
      {expanded ? <div className="px-3 pb-2 sm:px-5">{props.children}</div> : null}
    </div>
  )
}
