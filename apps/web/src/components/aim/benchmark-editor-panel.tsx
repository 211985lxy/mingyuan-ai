"use client"

import { useEffect, useRef, useState, type RefObject } from "react"
import { FileText, Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { STYLE_GUIDE_LABELS } from "@/lib/style-guide-config"
import { clampEditorPanelWidth, type TextSelectionRange } from "@/lib/aim-editor"
import type { EditorPanelLabels } from "@/lib/aim-editor-labels"
import type { ContentFormat } from "@/lib/api/client"
import {
  AIM_ACTIVE_SOFT_ACTION_CLASS,
  AIM_FORMAT_LABELS,
  AIM_SOFT_ACTION_CLASS,
} from "@/lib/aim/workbench-display"

export interface AimEditorSelection {
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
  onReferenceSelection: (selection: AimEditorSelection) => void
  onDraftSelection: (selection: AimEditorSelection) => void
  onSave: () => void
  onImitate: () => void
  imitating: boolean
  imitateStyleId: string
  onImitateStyleChange: (styleId: string) => void
  generationId?: string
}

function readSelection(element: HTMLTextAreaElement): AimEditorSelection {
  const range = { start: element.selectionStart, end: element.selectionEnd }
  return { text: element.value.slice(range.start, range.end), range }
}

function startPanelResize(event: React.PointerEvent, onWidthChange: (width: number) => void) {
  event.preventDefault()
  const move = (moveEvent: PointerEvent) => onWidthChange(clampEditorPanelWidth(window.innerWidth - moveEvent.clientX))
  const up = () => {
    window.removeEventListener("pointermove", move)
    window.removeEventListener("pointerup", up)
  }
  window.addEventListener("pointermove", move)
  window.addEventListener("pointerup", up)
}

function CollapsedEditor({ labels, editorText, onOpen }: Pick<BenchmarkEditorPanelProps, "labels" | "editorText" | "onOpen">) {
  return <button type="button" className="flex w-9 shrink-0 flex-col items-center justify-center gap-2 border-l bg-background text-xs text-muted-foreground hover:bg-muted/40" onClick={onOpen} title={labels.collapsedTitle}><FileText className="h-4 w-4" /><span className="[writing-mode:vertical-rl]">{editorText.length}字</span></button>
}

function EditorHeader(props: Pick<BenchmarkEditorPanelProps, "labels" | "editorFormat" | "editorText" | "referenceText" | "imitateStyleId" | "onImitateStyleChange" | "imitating" | "onImitate" | "onSave" | "onClose">) {
  const { labels, editorFormat, editorText, referenceText, imitateStyleId, onImitateStyleChange, imitating, onImitate, onSave, onClose } = props
  return (
    <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
      <div className="min-w-0"><p className="text-sm font-semibold">{labels.title}</p><p className="truncate text-xs text-muted-foreground">{editorFormat ? AIM_FORMAT_LABELS[editorFormat] : labels.currentLabel} · {editorText.length} 字</p></div>
      <div className="flex items-center gap-1">
        {referenceText.length >= 30 ? <><Select value={imitateStyleId} onValueChange={(value) => onImitateStyleChange(value ?? "default")}><SelectTrigger size="sm" className="h-7 w-[104px] text-xs"><SelectValue placeholder="文风" /></SelectTrigger><SelectContent><SelectItem value="default">默认（我的风格）</SelectItem>{Object.entries(STYLE_GUIDE_LABELS).map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent></Select><Button size="sm" variant="ghost" className={AIM_ACTIVE_SOFT_ACTION_CLASS} disabled={imitating || editorText.trim().length < 30} onClick={onImitate} title="把上面对标爆款的结构逻辑迁移到你的稿子">{imitating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}仿写</Button></> : null}
        <Button size="sm" variant="ghost" className={AIM_ACTIVE_SOFT_ACTION_CLASS} onClick={onSave}>保存</Button>
        <Button size="sm" variant="ghost" className={AIM_SOFT_ACTION_CLASS} onClick={onClose}>隐藏</Button>
      </div>
    </div>
  )
}

type VersionSummary = { id: string; versionNo: number; source: string; createdAt: string; preview: string; content?: string }

function VersionTimeline({ generationId, editorText, onRestore }: { generationId: string; editorText: string; onRestore: (content: string) => void }) {
  const [versions, setVersions] = useState<VersionSummary[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  useEffect(() => { fetch(`/api/content-versions?generationId=${encodeURIComponent(generationId)}`).then((r) => r.ok ? r.json() : null).then((payload) => setVersions(payload?.data ?? [])).catch(() => {}) }, [generationId])
  async function restore(id: string) {
    const response = await fetch(`/api/content-versions/${id}/restore`, { method: "POST" })
    if (!response.ok) return
    const payload = await response.json()
    const content = payload?.data?.content
    if (typeof content === "string") { onRestore(content); setVersions((items) => [...items, payload.data]) }
  }
  async function loadContent(id: string) {
    const response = await fetch(`/api/content-versions?id=${encodeURIComponent(id)}`)
    const payload = await response.json()
    setVersions((items) => items.map((item) => item.id === id ? { ...item, content: payload?.data?.content } : item))
  }
  const selectedVersion = versions.find((item) => item.id === selected)
  const diff = selectedVersion?.content ? selectedVersion.content.split("\n").map((line, index) => `${line === editorText.split("\n")[index] ? "  " : "+ "}${line}`).join("\n") : ""
  return <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4"><div className="text-xs font-medium text-muted-foreground">版本时间线</div>{versions.length === 0 ? <p className="text-xs text-muted-foreground">保存后会自动生成版本快照。</p> : <div className="space-y-2">{versions.map((version) => <div key={version.id} className="rounded-md border p-2 text-xs"><button type="button" className="w-full text-left" onClick={() => { setSelected(version.id); void loadContent(version.id) }}><div className="flex justify-between"><span>v{version.versionNo} · {version.source}</span><span>{new Date(version.createdAt).toLocaleString()}</span></div><p className="mt-1 truncate text-muted-foreground">{version.preview}</p></button><Button size="sm" variant="ghost" className="mt-1 h-7 text-xs" onClick={() => void restore(version.id)}>恢复为新版本</Button></div>)}</div>}{diff ? <pre className="whitespace-pre-wrap rounded-md bg-muted/30 p-2 text-xs leading-5">{diff}</pre> : null}</div>
}

function EditorSection({ title, value, placeholder, readOnly, muted, hideEmptyCount, onChange, onSelection }: {
  title: string
  value: string
  placeholder: string
  readOnly?: boolean
  muted?: boolean
  hideEmptyCount?: boolean
  onChange?: (text: string) => void
  onSelection: (selection: AimEditorSelection) => void
}) {
  return (
    <section className="flex min-h-0 flex-col px-4 py-3">
      <div className="mb-2 flex items-center justify-between"><span className="text-xs font-medium text-muted-foreground">{title}</span>{value || !hideEmptyCount ? <span className="text-[11px] text-muted-foreground">{value.length} 字</span> : null}</div>
      <textarea readOnly={readOnly} className={`min-h-0 flex-1 resize-none rounded-md border border-transparent ${muted ? "bg-background/70" : "bg-background"} p-3 text-sm leading-6 outline-none focus:border-primary/25`} value={value} placeholder={placeholder} onChange={onChange ? (event) => onChange(event.target.value) : undefined} onSelect={(event) => onSelection(readSelection(event.currentTarget))} />
    </section>
  )
}

function EditorSplitHandle({ splitRef, onPercentChange }: { splitRef: RefObject<HTMLDivElement | null>; onPercentChange: (value: number) => void }) {
  function startResize(event: React.PointerEvent) {
    event.preventDefault()
    const box = splitRef.current?.getBoundingClientRect()
    if (!box) return
    const move = (moveEvent: PointerEvent) => onPercentChange(Math.min(80, Math.max(20, ((moveEvent.clientY - box.top) / box.height) * 100)))
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up) }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }
  return <div className="group flex cursor-row-resize items-center bg-transparent transition-colors hover:bg-primary/5" title="拖动调整上下区域高度" onPointerDown={startResize}><div className="h-px w-full bg-border/60 transition-colors group-hover:bg-primary/35" /></div>
}

export function BenchmarkEditorPanel(props: BenchmarkEditorPanelProps) {
  const splitRef = useRef<HTMLDivElement>(null)
  const [referencePercent, setReferencePercent] = useState(50)
  const [view, setView] = useState<"edit" | "versions">("edit")
  async function saveWithVersion() {
    props.onSave()
    if (!props.generationId || !props.editorFormat || !props.editorText.trim()) return
    await fetch("/api/content-versions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ generationId: props.generationId, format: props.editorFormat, content: props.editorText, source: "manual_edit" }) }).catch(() => {})
  }
  if (!props.open) return <CollapsedEditor labels={props.labels} editorText={props.editorText} onOpen={props.onOpen} />
  return (
    <aside className="relative flex shrink-0 flex-col border-l bg-background" style={{ width: props.width }}>
      <div className="absolute left-0 top-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-primary/30" onPointerDown={(event) => startPanelResize(event, props.onWidthChange)} />
      <EditorHeader {...props} onSave={saveWithVersion} />
      <div className="flex gap-1 border-b px-4 py-2"><Button size="sm" variant={view === "edit" ? "secondary" : "ghost"} className="h-7 text-xs" onClick={() => setView("edit")}>编辑</Button>{props.generationId ? <Button size="sm" variant={view === "versions" ? "secondary" : "ghost"} className="h-7 text-xs" onClick={() => setView("versions")}>版本</Button> : null}</div>
      {view === "versions" && props.generationId ? <VersionTimeline generationId={props.generationId} editorText={props.editorText} onRestore={props.onEditorTextChange} /> : <div ref={splitRef} className="grid min-h-0 flex-1 bg-muted/15" style={{ gridTemplateRows: `${referencePercent}% 6px minmax(0, 1fr)` }}>
        <EditorSection title={props.labels.referenceTitle} value={props.referenceText} placeholder={props.labels.referencePlaceholder} readOnly muted hideEmptyCount onSelection={props.onReferenceSelection} />
        <EditorSplitHandle splitRef={splitRef} onPercentChange={setReferencePercent} />
        <EditorSection title={props.labels.draftTitle} value={props.editorText} placeholder={props.labels.draftPlaceholder} onChange={props.onEditorTextChange} onSelection={props.onDraftSelection} />
      </div>}
    </aside>
  )
}
