"use client"

import { FileText, Loader2, Sparkles } from "lucide-react"
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { clampEditorPanelWidth, type TextSelectionRange } from "@/lib/aim-editor"
import type { EditorPanelLabels } from "@/lib/aim-editor-labels"
import { STYLE_GUIDE_LABELS } from "@/lib/style-guide-config"
import type { ContentFormat } from "@/lib/api/aim"

const FORMAT_LABELS: Record<ContentFormat, string> = {
  video_script: "口播文案",
  wechat_article: "公众号文章",
  moments_post: "朋友圈文案",
  community_message: "社群运营文案",
  shooting_brief: "拍摄交接单",
  raw_copy: "诊断报告",
  koubo_script: "口播文案",
  xiaohongshu_post: "小红书图文",
}

const SOFT_ACTION_CLASS = "h-7 rounded-md border-0 bg-muted/45 px-2 text-xs text-muted-foreground shadow-none hover:bg-muted hover:text-foreground"
const ACTIVE_SOFT_ACTION_CLASS = "h-7 rounded-md border-0 bg-primary/10 px-2 text-xs text-primary shadow-none hover:bg-primary/15"

export interface EditorSelection {
  text: string
  range: TextSelectionRange
}

interface BenchmarkEditorPanelProps {
  open: boolean
  width: number
  labels: EditorPanelLabels
  referenceText: string
  editorText: string
  editorFormat?: ContentFormat
  onOpen: () => void
  onClose: () => void
  onWidthChange: (width: number) => void
  onEditorTextChange: (text: string) => void
  onReferenceSelection: (selection: EditorSelection) => void
  onDraftSelection: (selection: EditorSelection) => void
  onSave: () => void
  onImitate: () => void
  imitating: boolean
  imitateStyleId: string
  onImitateStyleChange: (styleId: string) => void
}

function readTextareaSelection(element: HTMLTextAreaElement): EditorSelection {
  const range = { start: element.selectionStart, end: element.selectionEnd }
  return { text: element.value.slice(range.start, range.end), range }
}

function CollapsedEditorPanel({ labels, editorText, onOpen }: Pick<BenchmarkEditorPanelProps, "labels" | "editorText" | "onOpen">) {
  return (
    <button type="button" className="flex w-9 shrink-0 flex-col items-center justify-center gap-2 border-l bg-background text-xs text-muted-foreground hover:bg-muted/40" onClick={onOpen} title={labels.collapsedTitle}>
      <FileText className="h-4 w-4" />
      <span className="[writing-mode:vertical-rl]">{editorText.length}字</span>
    </button>
  )
}

function EditorPanelHeader(props: Pick<BenchmarkEditorPanelProps, "labels" | "referenceText" | "editorText" | "editorFormat" | "onClose" | "onSave" | "onImitate" | "imitating" | "imitateStyleId" | "onImitateStyleChange">) {
  const canImitate = props.referenceText.length >= 30
  return (
    <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{props.labels.title}</p>
        <p className="truncate text-xs text-muted-foreground">{props.editorFormat ? FORMAT_LABELS[props.editorFormat] : props.labels.currentLabel} · {props.editorText.length} 字</p>
      </div>
      <div className="flex items-center gap-1">
        {canImitate ? <>
          <Select value={props.imitateStyleId} onValueChange={(value) => props.onImitateStyleChange(value ?? "default")}>
            <SelectTrigger size="sm" className="h-7 w-[104px] text-xs"><SelectValue placeholder="文风" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="default">默认（我的风格）</SelectItem>
              {Object.entries(STYLE_GUIDE_LABELS).map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="ghost" className={ACTIVE_SOFT_ACTION_CLASS} disabled={props.imitating || props.editorText.trim().length < 30} onClick={props.onImitate} title="把上面对标爆款的结构逻辑迁移到你的稿子">
            {props.imitating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}仿写
          </Button>
        </> : null}
        <Button size="sm" variant="ghost" className={ACTIVE_SOFT_ACTION_CLASS} onClick={props.onSave}>保存</Button>
        <Button size="sm" variant="ghost" className={SOFT_ACTION_CLASS} onClick={props.onClose}>隐藏</Button>
      </div>
    </div>
  )
}

function EditorPanelBody(props: Pick<BenchmarkEditorPanelProps, "labels" | "referenceText" | "editorText" | "onEditorTextChange" | "onReferenceSelection" | "onDraftSelection">) {
  const splitRef = useRef<HTMLDivElement>(null)
  const [referencePercent, setReferencePercent] = useState(50)
  function resizeReferenceArea(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault()
    const box = splitRef.current?.getBoundingClientRect()
    if (!box) return
    const move = (moveEvent: PointerEvent) => setReferencePercent(Math.min(80, Math.max(20, ((moveEvent.clientY - box.top) / box.height) * 100)))
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up) }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }
  return (
    <div ref={splitRef} className="grid min-h-0 flex-1 bg-muted/15" style={{ gridTemplateRows: `${referencePercent}% 6px minmax(0, 1fr)` }}>
      <section className="flex min-h-0 flex-col px-4 py-3">
        <div className="mb-2 flex items-center justify-between"><span className="text-xs font-medium text-muted-foreground">{props.labels.referenceTitle}</span>{props.referenceText ? <span className="text-[11px] text-muted-foreground">{props.referenceText.length} 字</span> : null}</div>
        <textarea readOnly className="min-h-0 flex-1 resize-none rounded-md border border-transparent bg-background/70 p-3 text-sm leading-6 outline-none focus:border-primary/25" value={props.referenceText} placeholder={props.labels.referencePlaceholder} onSelect={(event) => props.onReferenceSelection(readTextareaSelection(event.currentTarget))} />
      </section>
      <div className="group flex cursor-row-resize items-center bg-transparent transition-colors hover:bg-primary/5" title="拖动调整上下区域高度" onPointerDown={resizeReferenceArea}><div className="h-px w-full bg-border/60 transition-colors group-hover:bg-primary/35" /></div>
      <section className="flex min-h-0 flex-col px-4 py-3">
        <div className="mb-2 flex items-center justify-between"><span className="text-xs font-medium text-muted-foreground">{props.labels.draftTitle}</span><span className="text-[11px] text-muted-foreground">{props.editorText.length} 字</span></div>
        <textarea className="min-h-0 flex-1 resize-none rounded-md border border-transparent bg-background p-3 text-sm leading-6 outline-none focus:border-primary/25" value={props.editorText} onChange={(event) => props.onEditorTextChange(event.target.value)} onSelect={(event) => props.onDraftSelection(readTextareaSelection(event.currentTarget))} placeholder={props.labels.draftPlaceholder} />
      </section>
    </div>
  )
}

export function BenchmarkEditorPanel(props: BenchmarkEditorPanelProps) {
  if (!props.open) return <CollapsedEditorPanel {...props} />
  function resizePanel(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault()
    const move = (moveEvent: PointerEvent) => props.onWidthChange(clampEditorPanelWidth(window.innerWidth - moveEvent.clientX))
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up) }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }
  return (
    <aside className="relative flex shrink-0 flex-col border-l bg-background" style={{ width: props.width }}>
      <div className="absolute left-0 top-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-primary/30" onPointerDown={resizePanel} />
      <EditorPanelHeader {...props} />
      <EditorPanelBody {...props} />
    </aside>
  )
}
