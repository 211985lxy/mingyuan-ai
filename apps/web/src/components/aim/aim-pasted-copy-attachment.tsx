"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  formatCharCount,
  type PastedCopyAttachment,
  type PasteUsage,
} from "@/lib/aim/paste-copy-attachment"

interface AimPastedCopyAttachmentProps {
  attachment: PastedCopyAttachment
  busy: boolean
  onRemove: () => void
  onSelectUsage: (usage: PasteUsage) => void
  /** 能力矩阵允许的用途；不传则保持旧行为（三项全显示） */
  allowedUsages?: PasteUsage[]
  /** edit/review 自动用途时的标签文案 */
  autoUsageLabel?: string
}

function getUsageLabel(usage: PasteUsage | undefined, autoUsageLabel?: string) {
  if (usage === "edit") return autoUsageLabel ?? " · 待修改"
  if (usage === "review") return autoUsageLabel ?? " · 待质检"
  if (usage === "analytics") return autoUsageLabel ?? " · 发布数据"
  if (usage === "benchmark") return " · 对标参考"
  if (usage === "style_sample") return " · 风格样本"
  return null
}

/** 创作台长文附件条：展开、移除、用途确认 */
export function AimPastedCopyAttachmentBar({
  attachment,
  busy,
  onRemove,
  onSelectUsage,
  allowedUsages = ["edit", "review", "benchmark", "style_sample"],
  autoUsageLabel,
}: AimPastedCopyAttachmentProps) {
  const [expanded, setExpanded] = useState(false)
  // 单用途（质检/编辑）也要能点选，避免 usage 未自动带上时发送键死锁
  const showChooser = !attachment.usage && allowedUsages.length > 0
  const usageLabel = getUsageLabel(attachment.usage, autoUsageLabel)

  return (
    <div className="mx-3 mt-3 rounded-xl border border-border/70 bg-muted/30 px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            文案附件 · {formatCharCount(attachment.charCount)}字
            {usageLabel}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {expanded ? "收起" : "展开"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={onRemove}
          disabled={busy}
          title="移除文案附件"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      {expanded ? (
        <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">
          {attachment.content}
        </pre>
      ) : null}
      {showChooser ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            检测到一篇文案 · {formatCharCount(attachment.charCount)}字
          </span>
          {allowedUsages.includes("edit") ? (
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => onSelectUsage("edit")}>
              修改这篇
            </Button>
          ) : null}
          {allowedUsages.includes("review") ? (
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => onSelectUsage("review")}>
              质检这篇
            </Button>
          ) : null}
          {allowedUsages.includes("benchmark") ? (
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => onSelectUsage("benchmark")}>
              作为对标参考
            </Button>
          ) : null}
          {allowedUsages.includes("style_sample") ? (
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => onSelectUsage("style_sample")}>
              沉淀为我的风格
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
