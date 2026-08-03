"use client"

import { Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CATEGORY_LABELS } from "@/features/knowledge/admin-knowledge-shared"
import type {
  SmartImportEdit,
  SmartImportItem,
} from "@/features/knowledge/components/customer-smart-import-types"
import { cn } from "@/lib/utils"

function formatTag(tag: string) {
  return tag
    .replace("kb_scope:", "")
    .replace("asset_role:", "")
    .replace("usable_for:", "")
    .replace("confidence:", "")
}

function PreviewItemMeta(props: {
  item: SmartImportItem
  edit: SmartImportEdit
  onEdit: (patch: SmartImportEdit) => void
}) {
  const isDuplicate = Boolean(props.item.duplicateOfId)
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">#{props.item.index + 1}</span>
        {props.item.detectedSource === "wechat_chat" && (
          <Badge variant="outline" className="text-[10px]">微信记录</Badge>
        )}
        <Badge
          variant={props.item.confidence === "high" ? "default" : props.item.confidence === "medium" ? "secondary" : "outline"}
          className="text-[10px]"
        >
          {props.item.confidence === "high" ? "高置信" : props.item.confidence === "medium" ? "中置信" : "低置信"}
        </Badge>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {isDuplicate && (
          <Badge variant="outline" className="border-orange-300 text-[10px] text-orange-600">
            重复 {((props.item.duplicateScore ?? 0) * 100).toFixed(0)}%
          </Badge>
        )}
        <label className="flex cursor-pointer items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={Boolean(props.edit.skip)}
            onChange={(event) => props.onEdit({ skip: event.target.checked })}
          />
          跳过
        </label>
      </div>
    </div>
  )
}

function PreviewItemFields(props: {
  item: SmartImportItem
  edit: SmartImportEdit
  onEdit: (patch: SmartImportEdit) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground">标题</Label>
        <Input
          value={props.edit.title ?? props.item.suggestedTitle}
          onChange={(event) => props.onEdit({ title: event.target.value })}
          className="h-8 text-sm"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground">分类</Label>
        <Select
          value={props.edit.category ?? props.item.suggestedCategory}
          onValueChange={(value) => props.onEdit({ category: value ?? "" })}
        >
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground">价值分级</Label>
        <Select
          value={props.edit.valueGrade ?? props.item.suggestedValueGrade}
          onValueChange={(value) => props.onEdit({ valueGrade: value ?? "" })}
        >
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="S">S · 战略级</SelectItem>
            <SelectItem value="A">A · 战术级</SelectItem>
            <SelectItem value="B">B · 参考级</SelectItem>
            <SelectItem value="C">C · 索引级</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

function CustomerSmartImportPreviewItem(props: {
  item: SmartImportItem
  edit: SmartImportEdit
  expanded: boolean
  onEdit: (patch: SmartImportEdit) => void
  onToggleExpand: () => void
}) {
  const { item, edit, expanded } = props
  return (
    <Card className={cn("border", edit.skip && "opacity-50", item.duplicateOfId && "border-orange-200")}>
      <CardContent className="space-y-2 p-3">
        <PreviewItemMeta item={item} edit={edit} onEdit={props.onEdit} />
        <PreviewItemFields item={item} edit={edit} onEdit={props.onEdit} />
        <div className="flex flex-wrap gap-1">
          {(edit.tags ?? item.suggestedTags ?? []).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-[10px]">{formatTag(tag)}</Badge>
          ))}
        </div>
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {edit.skip ? "(已跳过)" : item.suggestedKeyPoints}
        </p>
        <button type="button" className="cursor-pointer text-[10px] text-primary hover:underline" onClick={props.onToggleExpand}>
          {expanded ? "收起原文" : "展开原文"}
        </button>
        {expanded && (
          <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-muted/50 p-2 text-xs text-muted-foreground">
            {item.originalText}
          </pre>
        )}
      </CardContent>
    </Card>
  )
}

export function CustomerSmartImportPreviewStep(props: {
  processed: SmartImportItem[]
  edits: Record<number, SmartImportEdit>
  expanded: Set<number>
  confirming: boolean
  onEdit: (index: number, patch: SmartImportEdit) => void
  onToggleExpand: (index: number) => void
  onBack: () => void
  onConfirm: () => void
}) {
  const keepCount = props.processed.filter((item) => !props.edits[item.index]?.skip).length
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        共 {props.processed.length} 条待确认，可改标题/分类，重复的可勾选跳过
      </p>
      <div className="space-y-3">
        {props.processed.map((item) => (
          <CustomerSmartImportPreviewItem
            key={item.index}
            item={item}
            edit={props.edits[item.index] ?? {}}
            expanded={props.expanded.has(item.index)}
            onEdit={(patch) => props.onEdit(item.index, patch)}
            onToggleExpand={() => props.onToggleExpand(item.index)}
          />
        ))}
      </div>
      <div className="flex items-center justify-between pt-2">
        <span className="text-sm text-muted-foreground">将导入 {keepCount} 条</span>
        <div className="flex gap-2">
          <Button variant="outline" onClick={props.onBack}>重新选择</Button>
          <Button onClick={props.onConfirm} disabled={props.confirming || keepCount === 0}>
            {props.confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            确认入库
          </Button>
        </div>
      </div>
    </div>
  )
}
