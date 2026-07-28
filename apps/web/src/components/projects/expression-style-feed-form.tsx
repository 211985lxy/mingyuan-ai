"use client"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { StyleSampleDraft } from "@/features/aim/hooks/use-expression-style-panel"

interface ExpressionStyleFeedFormProps {
  samples: StyleSampleDraft[]
  setSamples: React.Dispatch<React.SetStateAction<StyleSampleDraft[]>>
  onAddSample: () => void
  onStartPreview: () => void
}

/** 批量投喂表单：1—10 篇样本 */
export function ExpressionStyleFeedForm({
  samples,
  setSamples,
  onAddSample,
  onStartPreview,
}: ExpressionStyleFeedFormProps) {
  return (
    <div className="space-y-3 border-t border-border/60 pt-3">
      <p className="text-xs text-muted-foreground">粘贴 1—10 篇纯文本。分析后先预览，确认才写入。</p>
      {samples.map((sample, index) => (
        <div key={sample.id} className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs">样本 {index + 1}</Label>
            <select
              className="h-7 rounded-md border border-input bg-background px-1.5 text-xs"
              value={sample.label}
              onChange={(event) => {
                const label = event.target.value as "core" | "normal"
                setSamples((prev) => prev.map((item) => (item.id === sample.id ? { ...item, label } : item)))
              }}
            >
              <option value="core">核心样本</option>
              <option value="normal">普通样本</option>
            </select>
          </div>
          <Textarea
            className="min-h-20 text-sm"
            value={sample.content}
            placeholder="粘贴一篇你以前写的文案…"
            onChange={(event) => {
              const content = event.target.value
              setSamples((prev) => prev.map((item) => (item.id === sample.id ? { ...item, content } : item)))
            }}
          />
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={onAddSample}>再加一篇</Button>
        <Button type="button" size="sm" className="h-8 text-xs" onClick={onStartPreview}>分析并预览</Button>
      </div>
    </div>
  )
}
