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
}

/** 创作台长文附件条：展开、移除、用途确认 */
export function AimPastedCopyAttachmentBar({
  attachment,
  busy,
  onRemove,
  onSelectUsage,
}: AimPastedCopyAttachmentProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="mx-3 mt-3 rounded-xl border border-border/70 bg-muted/30 px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            文案附件 · {formatCharCount(attachment.charCount)}字
            {attachment.usage === "edit" ? " · 待修改" : null}
            {attachment.usage === "benchmark" ? " · 对标参考" : null}
            {attachment.usage === "style_sample" ? " · 风格样本" : null}
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
      {!attachment.usage ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            检测到一篇文案 · {formatCharCount(attachment.charCount)}字
          </span>
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => onSelectUsage("edit")}>
            修改这篇
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => onSelectUsage("benchmark")}>
            作为对标参考
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => onSelectUsage("style_sample")}>
            沉淀为我的风格
          </Button>
        </div>
      ) : null}
    </div>
  )
}
