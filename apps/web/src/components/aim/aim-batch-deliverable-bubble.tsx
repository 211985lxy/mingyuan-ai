"use client"

import { useState } from "react"
import { Check, Copy, FileText, Layers } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import type { BatchDeliverableResult } from "@/lib/aim/workbench-types"

/** 批量复刻交付物气泡：展示提取的结构模板 + N 条生成的文案。
 *  每条文案可单独复制。不走标准交付物气泡的 tab 逻辑。 */
export function AimBatchDeliverableBubble(props: {
  deliverables: BatchDeliverableResult
}) {
  const { deliverables } = props
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0)

  return (
    <div className="mt-2 w-full space-y-2">
      {/* 结构模板摘要 */}
      <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
        <Layers className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground">
            结构模板：{deliverables.structure.displayName}
          </p>
          {deliverables.structure.description ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {deliverables.structure.description}
            </p>
          ) : null}
        </div>
      </div>

      {/* 生成的文案列表 */}
      <div className="space-y-1.5">
        {deliverables.scripts.map((script, index) => {
          const isExpanded = expandedIndex === index
          return (
            <Card key={script.id} className="overflow-hidden">
              <CardHeader className="flex flex-row items-center gap-2 py-2.5">
                <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                <button
                  type="button"
                  onClick={() => setExpandedIndex(isExpanded ? null : index)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-sm font-medium text-foreground">
                    {index + 1}. {script.title}
                  </p>
                </button>
                <CopyButton text={script.content} />
              </CardHeader>
              {isExpanded ? (
                <CardContent className="border-t bg-muted/30 px-3 py-2.5">
                  <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-foreground/90">
                    {script.content}
                  </pre>
                </CardContent>
              ) : null}
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function CopyButton(props: { text: string }) {
  const { text } = props
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success("已复制到剪贴板")
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("复制失败")
    }
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 shrink-0 px-2 text-xs"
      onClick={handleCopy}
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copied ? "已复制" : "复制"}
    </Button>
  )
}
