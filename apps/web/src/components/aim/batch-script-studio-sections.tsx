"use client"

import { useState } from "react"
import { FileUp, Loader2, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { splitScripts } from "@/lib/aim/script-structure-extractor-types"

// ─── 共享类型 ──────────────────────────────────────────────

export type BatchTab = "extract" | "generate" | "pipeline"

export interface StructureOption {
  id: string
  displayName: string
  description: string | null
  sourceScriptsCount: number
}

export interface ExtractedSegmentView {
  type: string
  label: string
  instruction: string
  example: string
  order: number
}

export interface StructureResult {
  id: string
  displayName: string
  description: string | null
  blueprint: { segments?: ExtractedSegmentView[] } & Record<string, unknown>
}

export interface GeneratedScriptView {
  id: string
  title: string
  content: string
}

// ─── 文件上传 + 粘贴输入区 ─────────────────────────────────

/** 文案输入区：支持粘贴文本 + 上传 .txt/.md 文件。
 *  - 上传文件时把内容追加到 textarea（用 --- 分隔）
 *  - 显示当前解析出的文案条数 */
export function ScriptInputArea(props: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
}) {
  const { value, onChange, placeholder, rows = 8 } = props
  const scriptCount = value.trim() ? splitScripts(value).length : 0

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? "")
      const joined = value.trim()
        ? `${value.trim()}\n\n---\n\n${text.trim()}`
        : text.trim()
      onChange(joined)
    }
    reader.readAsText(file)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">
          文案内容（多条用 <code className="rounded bg-muted px-1">---</code> 或空行分隔）
        </Label>
        <Label className="cursor-pointer text-xs text-primary hover:underline">
          <FileUp className="mr-1 inline size-3" />
          上传 .txt / .md
          <input
            type="file"
            accept=".txt,.md,.markdown,text/plain,text/markdown"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
              e.target.value = ""
            }}
          />
        </Label>
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "粘贴一条或多条视频文案…"}
        rows={rows}
        className="text-sm"
      />
      {scriptCount > 0 ? (
        <p className="text-[11px] text-muted-foreground">
          已识别 <Badge variant="secondary" className="mx-1 h-4 px-1.5 text-[10px]">{scriptCount}</Badge> 条文案
        </p>
      ) : null}
    </div>
  )
}

// ─── 数量控制 ─────────────────────────────────────────────

export function CountControl(props: {
  value: number
  onChange: (value: number) => void
  max?: number
}) {
  const { value, onChange, max = 10 } = props
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">生成数量（1-{max}）</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={1}
          max={max}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (Number.isFinite(n)) onChange(Math.min(max, Math.max(1, Math.floor(n))))
          }}
          className="h-8 w-20 text-sm"
        />
        <div className="flex gap-1">
          {[1, 3, 5, 10].map((n) => (
            <Button
              key={n}
              type="button"
              variant={n === value ? "default" : "outline"}
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => onChange(n)}
            >
              {n}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── 提取结果展示 ─────────────────────────────────────────

export function StructureResultView(props: { structure: StructureResult }) {
  const segments = props.structure.blueprint.segments ?? []
  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div>
        <p className="text-sm font-medium">{props.structure.displayName}</p>
        {props.structure.description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{props.structure.description}</p>
        ) : null}
      </div>
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">结构骨架（{segments.length} 段）</p>
        {segments.map((seg) => (
          <div key={seg.order} className="rounded border bg-background p-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="h-5 text-[10px]">{seg.order}</Badge>
              <span className="text-xs font-medium">{seg.label}</span>
              <Badge variant="secondary" className="h-5 text-[10px]">{seg.type}</Badge>
            </div>
            {seg.instruction ? (
              <p className="mt-1 text-[11px] text-muted-foreground">{seg.instruction}</p>
            ) : null}
            {seg.example ? (
              <p className="mt-1 text-[11px] italic text-muted-foreground/70">例：{seg.example}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── 生成文案展示 ─────────────────────────────────────────

export function GeneratedScriptsView(props: {
  scripts: GeneratedScriptView[]
  onDelete?: (id: string) => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        已生成 {props.scripts.length} 条文案（已保存到草稿箱）
      </p>
      {props.scripts.map((script, idx) => {
        const isOpen = expanded === script.id
        return (
          <div key={script.id} className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-start justify-between gap-2">
              <button
                type="button"
                className="flex-1 text-left"
                onClick={() => setExpanded(isOpen ? null : script.id)}
              >
                <span className="text-xs font-medium text-muted-foreground">#{idx + 1}</span>
                <span className="ml-2 text-sm font-medium">{script.title || "无标题"}</span>
              </button>
              {props.onDelete ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-muted-foreground"
                  onClick={() => props.onDelete?.(script.id)}
                >
                  <Trash2 className="size-3" />
                </Button>
              ) : null}
            </div>
            <p className={`mt-1.5 whitespace-pre-wrap text-xs text-muted-foreground ${isOpen ? "" : "line-clamp-3"}`}>
              {script.content}
            </p>
            <button
              type="button"
              className="mt-1 text-[11px] text-primary hover:underline"
              onClick={() => setExpanded(isOpen ? null : script.id)}
            >
              {isOpen ? "收起" : "展开全部"}
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ─── 加载/错误状态 ────────────────────────────────────────

export function LoadingState(props: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      {props.label}
    </div>
  )
}

export function ErrorState(props: { message: string }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
      {props.message}
    </div>
  )
}

export function EmptyState(props: { message: string }) {
  return (
    <div className="py-8 text-center text-xs text-muted-foreground">{props.message}</div>
  )
}
